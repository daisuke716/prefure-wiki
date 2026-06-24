# Development Issues in Go2 Binary Segmentation Project

## Background

The project goal is to run a ROS2 node (`binary_go2_node`) on the Jetson compute platform of a Unitree Go2 robot. The node captures real-time video from the robot's **top front-facing camera**, uses a UNet semantic segmentation model to identify drivable road areas, and publishes three output streams — fused image, binary mask, and grayscale image — as ROS2 topics for an external computer to subscribe to.

The hardware layout is:

```
Robot mainboard (front camera) ──Ethernet direct──► Jetson (ROS2 node + inference) ──ROS2 topics──► External computer
Depth camera (Intel RealSense) ──USB──► Jetson
```

---

## Issue 1: `cv2.VideoCapture(4)` Cannot Open the Front Camera At All

### Description

The original code used `cv2.VideoCapture(4)` to open the camera, corresponding to the device file `/dev/video4`. The program started normally and could read frames, but the frames came from the Intel RealSense depth camera's RGB stream — not from the robot's top front-facing camera. Trying different device indices (`/dev/video2`, `/dev/video4`) only ever accessed streams from the depth camera; the front camera feed was never accessible this way.

### Root Cause

These are two entirely separate data paths — they are not the same type of device at all.

**`cv2.VideoCapture` goes through the V4L2 kernel driver path:**

```
cv2.VideoCapture(4) → Linux kernel V4L2 subsystem → /dev/video4 → depth camera driver
```

The depth camera connects to the Jetson directly via USB, so the OS registers it as standard video device nodes (`/dev/video2`, `/dev/video4`, etc.). OpenCV can read it just like a USB webcam.

**The front camera goes through the DDS network protocol path:**

```
Robot mainboard (capture + JPEG compress) → Ethernet → CycloneDDS → VideoClient.GetImageSample()
```

The Go2's top front camera is not registered as any V4L2 device node. It is continuously captured and JPEG-compressed by an internal camera service on the robot, then broadcast over the network using the DDS publish-subscribe protocol. The host machine must use the `VideoClient` provided by the Unitree SDK to send an RPC request and retrieve image data. From Linux's perspective, this camera simply does not exist — `cv2.VideoCapture` will never find it.

### Solution

Replace `cv2.VideoCapture` with `VideoClient` for camera acquisition:

```python
from unitree_sdk2py.core.channel import ChannelFactoryInitialize
from unitree_sdk2py.go2.video.video_client import VideoClient

ChannelFactoryInitialize(0)          # Initialize DDS communication
client = VideoClient()
client.SetTimeout(3.0)
client.Init()
code, data = client.GetImageSample() # Get JPEG byte stream
frame = cv2.imdecode(np.frombuffer(bytes(data), dtype=np.uint8), cv2.IMREAD_COLOR)
```

---

## Issue 2: `ChannelFactoryInitialize` Conflicts with ROS2's DDS Domain

### Description

After integrating `VideoClient` into the ROS2 node, calling `ChannelFactoryInitialize(0)` before `rclpy.init()` in `main()` and then creating the node caused the following error at startup:

```
[ERROR] [rmw_cyclonedds_cpp]: rmw_create_node: failed to create domain, error Precondition Not Met
RCLError: rcl node's rmw handle is invalid
```

Reversing the order — calling `rclpy.init()` first and then `ChannelFactoryInitialize(0)` — produced the same error. The ROS2 node could never be created.

### Root Cause

Both ROS2 and unitree_sdk2py use CycloneDDS as their communication middleware, and both need to call CycloneDDS's core initialization function:

```
ROS2 (rmw_cyclonedds_cpp)  →  dds_create_domain(0, ros2_config)
unitree_sdk2py             →  dds_create_domain(0, unitree_config)
```

CycloneDDS enforces that **within the same process, a given domain ID can only be initialized once**. Whichever one runs first, the second call finds domain 0 already exists and, if the configurations differ, reports `Precondition Not Met` and fails. This limitation is independent of call order — it is a fundamental CycloneDDS design constraint that cannot be worked around within a single process.

### Solution

Move `VideoClient` into a separate subprocess. Each process has its own independent CycloneDDS instance, and JPEG byte data is exchanged via `multiprocessing.Queue`:

```
Main process                         Subprocess
  rclpy.init()                         ChannelFactoryInitialize(0)
  ROS2 CycloneDDS (domain 0)           Unitree CycloneDDS (domain 0)
  ROS2 node running normally           GetImageSample() loop
        ↑                                      ↓
        └────── mp.Queue (JPEG bytes) ─────────┘
```

The subprocess continuously captures frames and puts them into the Queue. The main process's ROS2 timer reads the latest frame from the Queue on each tick, processes it, and the two sides are fully isolated with no interference.

---

## Issue 3: `<SharedMemory>` Field in `cyclonedds.xml` Crashes ROS2

### Description

After introducing the subprocess solution, the main process's ROS2 node still crashed at startup, with a different error:

```
config: //CycloneDDS/Domain: SharedMemory: unknown element (cyclonedds.xml line 11)
[ERROR] [rmw_cyclonedds_cpp]: rmw_create_node: failed to create domain, error Error
RCLError: rcl node's rmw handle is invalid
```

This error had nothing to do with unitree_sdk2py — it was ROS2's own CycloneDDS crashing while parsing a configuration file.

### Root Cause

The `.bashrc` had the following environment variable set:

```bash
export CYCLONEDDS_URI=~/cyclonedds_ws/cyclonedds.xml
```

This variable points to a CycloneDDS configuration file that every CycloneDDS instance in the process — including ROS2's rmw — reads at startup. The configuration file contained:

```xml
<SharedMemory>
    <Enable>false</Enable>
</SharedMemory>
```

`<SharedMemory>` is a configuration field added in CycloneDDS **0.10.2** to control iceoryx shared-memory transport. However, the CycloneDDS version bundled with ROS Foxy is **0.7.0**, which does not recognize this field. The 0.7.0 XML parser does not silently ignore unknown fields — it reports an error and refuses to complete domain initialization, preventing the ROS2 node from starting. This issue has nothing to do with the subprocess or unitree_sdk2py; it is purely a configuration file version incompatibility.

### Solution

Remove the entire `<SharedMemory>` block from `cyclonedds.xml`. The field was already set to `false` (disabled), so removing it produces identical behavior while maintaining compatibility with all versions of CycloneDDS:

```xml
<!-- Before -->
<SharedMemory>
    <Enable>false</Enable>
</SharedMemory>

<!-- After: nothing written here; shared memory is disabled by default — same behavior -->
```

---

## Issue 4: Subprocess Started with `fork` Inherits Parent's CycloneDDS State

### Description

After fixing the configuration file issue, the main process's ROS2 node finally started normally, but the subprocess (VideoClient) still crashed:

```
[ChannelFactory] create domain error. msg: Occurred upon initialisation of a cyclonedds.domain.Domain
Process Process-1:
Exception: channel factory init error.
```

The subprocess reported domain initialization failure immediately on startup — the same symptom as Issue 2. The main process ran fine, but the Queue never received any frame data, `cv2.imshow` was never called, and the window never appeared.

### Root Cause

Python on Linux defaults to **`fork`** for creating subprocesses. `fork` works by copying the entire memory space of the parent process into the child — the child is a snapshot of the parent at that moment:

```
Parent process state:
  rclpy.init() has been called
  CycloneDDS domain 0 is initialized (full domain data structures in memory)
        ↓ fork
Child process state (inherits parent memory snapshot):
  Memory already contains residual "domain 0 initialized" state
        ↓ ChannelFactoryInitialize(0) tries to initialize domain 0 again
  CycloneDDS detects domain 0 already exists (even as an inherited zombie state) → error
```

The child's CycloneDDS inherits the already-initialized domain state from the parent. That state is invalid in the child (the corresponding sockets, threads, and file descriptors no longer exist), but CycloneDDS's check logic still considers domain 0 occupied and refuses to reinitialize it.

### Solution

Use **`spawn`** to start the subprocess instead. `spawn` does not copy the parent's memory — it launches a brand-new Python interpreter process that starts from scratch with no inherited state:

```python
# Wrong (default fork — inherits parent's CycloneDDS state)
self._cam_proc = mp.Process(target=_camera_worker, ...)

# Correct (spawn — fresh interpreter, zero state)
_ctx = mp.get_context('spawn')
self._frame_queue = _ctx.Queue(maxsize=2)
self._cam_proc = _ctx.Process(target=_camera_worker, ...)
```

```
fork approach:
  Parent process (CycloneDDS domain 0 initialized)
       ↓ memory copied
  Child process (domain 0 zombie state inherited) → reinitialization fails

spawn approach:
  Child process (fresh Python interpreter, clean memory)
       ↓ ChannelFactoryInitialize(0)
  Domain 0 initialized normally → VideoClient works → frames enter Queue
```

With `spawn`, the child process calls `ChannelFactoryInitialize` from a clean state, CycloneDDS initializes normally, `GetImageSample()` begins looping, the Queue receives data, the main process timer picks up frames, completes inference, calls `cv2.imshow`, and the window appears correctly.

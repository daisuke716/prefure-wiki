# Unitree Go2 Onboard Camera Segmentation Fault Analysis

---

## 1. Symptoms

```bash
python3 camera_opencv.py    # → Segmentation fault (core dumped)
python3 capture_image.py    # → Segmentation fault (core dumped)
```

Every script in the official `unitree_sdk2_python` examples that accesses the camera crashes immediately on startup, with no useful error output.

---

## 2. Investigation

Using `faulthandler` to capture the exact crash stack trace:

```
Current thread (main):
  cyclonedds/pub.py:189  →  write()
    └─ ddspy_write(self._ref, ser)   ← crash occurs here

Background thread:
  bqueue.py:33  →  Get()  (waiting for data, unrelated)
```

The crash occurs inside `client.GetImageSample()`, specifically when the DDS "write data" operation is called. `ChannelFactoryInitialize`, `VideoClient()` construction, and `client.Init()` all succeed — the crash only happens when an actual DDS message is sent.

---

## 3. What Are libddsc and iceoryx?

### libddsc

**libddsc** is the core C dynamic library of Eclipse CycloneDDS, also known as the DDS C API Library.

- **DDS** (Data Distribution Service) is a publish-subscribe communication middleware standard widely used in robotics (ROS2 uses DDS under the hood)
- Unitree SDK2 uses DDS to transfer data between the host machine and the robot: joint states, video streams, control commands, etc.
- Python's `cyclonedds` package calls libddsc via `_clayer.cpython-38-aarch64-linux-gnu.so` (a C extension)
- Link chain: `python script → _clayer.so → libddsc.so.0`

### iceoryx

**iceoryx** is a zero-copy inter-process communication (IPC) middleware open-sourced by Bosch. The name comes from "ice phoenix."

- Core idea: the sender writes data directly into shared memory and the receiver reads it directly, **bypassing the kernel entirely**, achieving extremely low latency
- Requires a persistent daemon process called **RouDi** (Router & Discovery) to manage shared memory allocation and routing
- CycloneDDS can be compiled with iceoryx integration, routing local DDS communication over shared memory instead of UDP, significantly reducing latency

**How iceoryx works:**

```
Process A (writer)     Shared Memory       Process B (reader)
     │                  ┌─────────┐              │
     └──── write ──→    │  chunk  │   ←── read ──┘
                        └─────────┘
               RouDi daemon (manages memory allocation)
```

---

## 4. Root Cause

There are **two different versions of libddsc.so.0** on the system:

|                           | Path                                                         | Size   | Build type                 |
| ------------------------- | ------------------------------------------------------------ | ------ | -------------------------- |
| **Problem version** | `/usr/local/lib/libddsc.so.0`                              | 9.4 MB | Built with iceoryx support |
| **Working version** | `~/cyclonedds_ws/install/cyclonedds/lib/libddsc.so.0.10.2` | 8.5 MB | Standard build, no iceoryx |

**Crash chain:**

```
1. Python loads _clayer.so
        ↓
2. _clayer.so requires libddsc.so.0 (searched by SONAME)
        ↓
3. System default path finds /usr/local/lib/libddsc.so.0 first (iceoryx build)
        ↓
4. ddspy_write() calls libddsc's internal write operation
        ↓
5. The iceoryx build of libddsc attempts to access shared memory
        ↓
6. RouDi daemon is not running; the shared memory segment does not exist
        ↓
7. Access to invalid memory address → Segmentation Fault
```

**Why the iceoryx build cannot be used here:**
When the iceoryx build of libddsc initializes a write operation, it tries to request a shared memory chunk through RouDi. RouDi is a separate daemon that only starts in a full robot runtime environment. When running a Python script standalone, RouDi is absent, so libddsc accesses an invalid memory address.

**The clue in `.bashrc`:**

```bash
# Among the ROS Foxy entries:
export LD_LIBRARY_PATH=/usr/local/lib:$LD_LIBRARY_PATH
```

This line places `/usr/local/lib` (the iceoryx build) at the front of the search path, causing the wrong libddsc to be loaded first.

---

## 5. Solution

Make the correct `cyclonedds_ws` library path take **priority over** `/usr/local/lib` in `LD_LIBRARY_PATH`.

**Temporary fix (single session):**

```bash
LD_LIBRARY_PATH=/home/unitree/cyclonedds_ws/install/cyclonedds/lib:$LD_LIBRARY_PATH python3 camera_opencv.py
```

**Permanent fix (add to `~/.bashrc`):**

```bash
# Append after the CUDA line:
export LD_LIBRARY_PATH=/home/unitree/cyclonedds_ws/install/cyclonedds/lib:$LD_LIBRARY_PATH
```

The load order becomes:

```
cyclonedds_ws/lib  →  /usr/local/lib  →  /usr/local/cuda-11.4/lib64
   ↑ standard build wins    ↑ iceoryx build shadowed
```

**Why the cyclonedds_ws version works correctly:**
The standard libddsc sends DDS data over UDP, with no dependency on iceoryx or RouDi. As long as the host is connected to the robot's network, communication works directly.

---

## 6. Verification

```bash
# Ran successfully; image saved (197 KB)
/home/unitree/unitree_sdk2_python/example/go2/front_camera/img.jpg
```

`capture_image.py` no longer segfaults. `GetImageSample` returns code=0 and camera data is retrieved normally.

---

## 7. Summary

> Unitree pre-installed a libddsc built with iceoryx shared-memory support for high-speed local communication on the robot. However, the iceoryx daemon RouDi does not run outside a full robot environment. The Python SDK's DDS write operation triggered an access to non-existent shared memory, causing the segfault. The fix is to make Python load the standard libddsc build, which has no iceoryx dependency.

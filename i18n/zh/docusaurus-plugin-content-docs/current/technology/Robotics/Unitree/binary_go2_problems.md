# 基于Go2二值化分割的开发过程问题记录

## 需求背景

项目目标是在 Unitree Go2 机器人的 Jetson 计算平台上运行一个 ROS2 节点（`binary_go2_node`），实时获取机器人**头顶前置摄像头**的画面，用 UNet 语义分割模型识别可行驶路面区域，将融合图、二值化图、灰度图三路结果发布为 ROS2 话题，供外部电脑订阅使用。

整个系统的硬件关系如下：

```
机器人主板（前摄像头）──网线直连──► Jetson（运行 ROS2 节点 + 推理）──ROS2话题──► 外部电脑
深度相机（Intel RealSense）──USB──► Jetson
```

---

## 问题一：`cv2.VideoCapture(4)` 根本打不开前摄像头

### 情况描述

原始代码用 `cv2.VideoCapture(4)` 打开摄像头，对应的是 `/dev/video4` 这个设备文件。程序能正常启动，摄像头也能读出画面，但画面来源是深度相机（Intel RealSense）的 RGB 输出流，不是机器人头顶的前置摄像头。无论怎么换设备编号（`/dev/video2`、`/dev/video4`），都只能访问深度相机相关的流，前摄画面始终无法获取。

### 根本原因

这是两条完全独立的数据链路，根本不是同一类设备：

**`cv2.VideoCapture` 走的是 V4L2 内核驱动路径：**

```
cv2.VideoCapture(4) → Linux 内核 V4L2 子系统 → /dev/video4 → 深度相机驱动
```

深度相机直接通过 USB 连接 Jetson，操作系统会把它注册为 `/dev/video2`、`/dev/video4` 等标准视频设备节点，OpenCV 可以像读 USB 摄像头一样直接读取。

**前置摄像头走的是 DDS 网络协议路径：**

```
机器人主板（采集+JPEG压缩）→ 以太网 → CycloneDDS → VideoClient.GetImageSample()
```

Go2 的头顶前摄没有注册任何 V4L2 设备节点，它由机器人内部的摄像头服务程序持续采集、压缩成 JPEG，通过 DDS 发布-订阅协议在网络上广播。上位机必须用 Unitree SDK 提供的 `VideoClient` 发送 RPC 请求才能拿到图像数据。用 `cv2.VideoCapture` 在系统里根本找不到这个摄像头，它对 Linux 来说是不存在的。

### 解决方案

将摄像头获取方式从 `cv2.VideoCapture` 替换为 `VideoClient`：

```python
from unitree_sdk2py.core.channel import ChannelFactoryInitialize
from unitree_sdk2py.go2.video.video_client import VideoClient

ChannelFactoryInitialize(0)          # 初始化 DDS 通信
client = VideoClient()
client.SetTimeout(3.0)
client.Init()
code, data = client.GetImageSample() # 获取 JPEG 字节流
frame = cv2.imdecode(np.frombuffer(bytes(data), dtype=np.uint8), cv2.IMREAD_COLOR)
```

---

## 问题二：`ChannelFactoryInitialize` 与 ROS2 的 DDS domain 冲突

### 情况描述

将 `VideoClient` 集成进 ROS2 节点后，在 `main()` 里先调 `ChannelFactoryInitialize(0)`，再调 `rclpy.init()`，然后创建节点，启动时报错：

```
[ERROR] [rmw_cyclonedds_cpp]: rmw_create_node: failed to create domain, error Precondition Not Met
RCLError: rcl node's rmw handle is invalid
```

换了顺序，先 `rclpy.init()` 再 `ChannelFactoryInitialize(0)`，依然报同样的错。ROS2 节点始终无法创建。

### 根本原因

ROS2 和 unitree_sdk2py 底层都使用 CycloneDDS 作为通信中间件，两者都需要调用 CycloneDDS 的核心初始化函数：

```
ROS2 (rmw_cyclonedds_cpp)  →  dds_create_domain(0, ros2_config)
unitree_sdk2py             →  dds_create_domain(0, unitree_config)
```

CycloneDDS 规定：**同一个进程内，同一个 domain ID 只能被初始化一次**。无论谁先调，后来的那个调用看到 domain 0 已经存在，若配置不完全一致就报 `Precondition Not Met` 并失败。这个限制与调用顺序无关，是 CycloneDDS 的设计约束，在同一进程内无解。

### 解决方案

将 `VideoClient` 移到独立的子进程中运行，两个进程各自有独立的 CycloneDDS 实例，通过 `multiprocessing.Queue` 传递 JPEG 字节数据：

```
主进程                           子进程
  rclpy.init()                    ChannelFactoryInitialize(0)
  ROS2 CycloneDDS (domain 0)      Unitree CycloneDDS (domain 0)
  ROS2 节点正常运行                GetImageSample() 循环
        ↑                                ↓
        └────── mp.Queue (JPEG bytes) ───┘
```

子进程持续采集帧并放入 Queue，主进程的 ROS2 timer 每次触发时从 Queue 里取最新帧处理，两侧完全隔离，互不干扰。

---

## 问题三：`cyclonedds.xml` 配置文件中的 `<SharedMemory>` 字段导致 ROS2 崩溃

### 情况描述

引入子进程方案后，主进程的 ROS2 节点启动时仍然崩溃，报错信息变为：

```
config: //CycloneDDS/Domain: SharedMemory: unknown element (cyclonedds.xml line 11)
[ERROR] [rmw_cyclonedds_cpp]: rmw_create_node: failed to create domain, error Error
RCLError: rcl node's rmw handle is invalid
```

这次错误完全和 unitree_sdk2py 无关，是 ROS2 自己的 CycloneDDS 在解析配置文件时崩溃的。

### 根本原因

`.bashrc` 里设置了环境变量：

```bash
export CYCLONEDDS_URI=~/cyclonedds_ws/cyclonedds.xml
```

这个变量指向一个 CycloneDDS 配置文件，进程内所有 CycloneDDS 实例（包括 ROS2 的 rmw）启动时都会读取这个文件。配置文件里有这样一段：

```xml
<SharedMemory>
    <Enable>false</Enable>
</SharedMemory>
```

`<SharedMemory>` 是 CycloneDDS **0.10.2** 新增的配置字段，用于控制 iceoryx 共享内存传输。但是 ROS Foxy 内置的 CycloneDDS 版本是 **0.7.0**，它根本不认识这个字段。0.7.0 的 XML 解析器遇到未知字段时不是忽略，而是直接报错并拒绝完成 domain 初始化，导致 ROS2 节点无法启动。这个问题与子进程、unitree_sdk2py 毫无关系，完全是配置文件版本不兼容造成的。

### 解决方案

从 `cyclonedds.xml` 中删除 `<SharedMemory>` 整个块。该字段本身就是 `false`（禁用状态），删掉它行为完全一致，同时兼容新旧所有版本的 CycloneDDS：

```xml
<!-- 删除前 -->
<SharedMemory>
    <Enable>false</Enable>
</SharedMemory>

<!-- 删除后：什么都不写，默认就是不启用共享内存，效果相同 -->
```

---

## 问题四：子进程用 `fork` 启动继承了父进程的 CycloneDDS 状态

### 情况描述

解决配置文件问题后，主进程的 ROS2 节点终于正常启动了，但子进程（VideoClient）仍然崩溃：

```
[ChannelFactory] create domain error. msg: Occurred upon initialisation of a cyclonedds.domain.Domain
Process Process-1:
Exception: channel factory init error.
```

子进程一启动就报 domain 初始化失败，和问题二的现象一模一样。主进程正常运行，但 Queue 里永远没有帧数据，`cv2.imshow` 也从不被调用，窗口一直弹不出来。

### 根本原因

Python 在 Linux 上默认使用 **`fork`** 方式创建子进程。`fork` 的工作方式是把父进程的整个内存空间完整复制一份给子进程，子进程是父进程在某一时刻的内存快照：

```
父进程状态：
  rclpy.init() 已执行
  CycloneDDS domain 0 已初始化（在内存中有完整的 domain 数据结构）
        ↓ fork
子进程状态（继承父进程内存快照）：
  内存里已经有"domain 0 已初始化"的状态残留
        ↓ ChannelFactoryInitialize(0) 尝试再次初始化 domain 0
  CycloneDDS 检测到 domain 0 已存在（虽然是继承来的僵尸状态）→ 报错
```

子进程里的 CycloneDDS 继承了父进程已初始化的 domain 状态，这些状态对子进程来说是无效的（对应的 socket、线程、文件描述符都不存在），但 CycloneDDS 的检查逻辑仍然认为 domain 0 已占用，拒绝再次初始化。

### 解决方案

改用 **`spawn`** 方式启动子进程。`spawn` 不复制父进程内存，而是启动一个全新的 Python 解释器进程，从零开始执行，没有任何继承状态：

```python
# 错误方式（默认 fork，继承父进程CycloneDDS状态）
self._cam_proc = mp.Process(target=_camera_worker, ...)

# 正确方式（spawn，全新解释器，零状态）
_ctx = mp.get_context('spawn')
self._frame_queue = _ctx.Queue(maxsize=2)
self._cam_proc = _ctx.Process(target=_camera_worker, ...)
```

```
fork 方式：
  父进程（CycloneDDS domain 0 已初始化）
       ↓ 复制内存
  子进程（带僵尸状态的 domain 0 残留）→ 再次初始化失败

spawn 方式：
  子进程（全新Python解释器，内存干净）
       ↓ ChannelFactoryInitialize(0)
  正常初始化 domain 0 → VideoClient 正常工作 → 帧数据进入 Queue
```

`spawn` 启动后，子进程从干净状态调用 `ChannelFactoryInitialize`，CycloneDDS 正常初始化，`GetImageSample()` 开始循环取帧，Queue 里有了数据，主进程的 timer 拿到帧、完成推理、调用 `cv2.imshow`，窗口正常弹出。

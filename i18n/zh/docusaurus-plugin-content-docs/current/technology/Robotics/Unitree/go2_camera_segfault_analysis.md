# Unitree Go2 机载摄像头 Segmentation Fault 原因分析

---

## 一、现象

```bash
python3 camera_opencv.py    # → Segmentation fault (core dumped)
python3 capture_image.py    # → Segmentation fault (core dumped)
```

官方`unitree_sdk2_python` 例程的所有调用摄像头的脚本一启动就崩溃，没有任何有用的报错信息。

---

## 二、排查过程

用 `faulthandler` 捕获到精确的崩溃堆栈：

```
Current thread (main):
  cyclonedds/pub.py:189  →  write()
    └─ ddspy_write(self._ref, ser)   ← 在这里崩溃

Background thread:
  bqueue.py:33  →  Get()  (等待数据，无关)
```

崩溃发生在 `client.GetImageSample()` 内部，具体是调用 DDS 的"写数据"操作时。`ChannelFactoryInitialize`、`VideoClient()` 创建、`client.Init()` 都正常，只有真正发送 DDS 消息时才崩。

---

## 三、libddsc 和 iceoryx 是什么

### libddsc

**libddsc** 是 Eclipse CycloneDDS 的核心 C 动态库，全称 DDS C API Library。

- **DDS**（Data Distribution Service）是一套发布-订阅通信中间件标准，机器人领域广泛使用（ROS2 底层就是 DDS）
- Unitree SDK2 用 DDS 在上位机和机器人之间传输数据：关节状态、视频流、控制命令等
- Python 的 `cyclonedds` 包通过 `_clayer.cpython-38-aarch64-linux-gnu.so`（C 扩展）调用 libddsc 的接口
- 链接关系：`python脚本 → _clayer.so → libddsc.so.0`

### iceoryx

**iceoryx** 是 Bosch 开源的零拷贝进程间通信（IPC）中间件，名字来源于"ice phoenix"。

- 核心思想：发送方直接把数据写入共享内存，接收方直接读取，**完全跳过内核**，延迟极低
- 需要一个常驻守护进程 **RouDi**（Router & Discovery）来管理共享内存分配和路由
- CycloneDDS 可以编译时集成 iceoryx，让 DDS 的本地通信走共享内存而非 UDP，大幅降低延迟

**iceoryx 工作原理：**

```
进程A (写)          共享内存            进程B (读)
  │                  ┌─────────┐           │
  └──────写数据──→   │  chunk  │  ←─读──── ┘
                     └─────────┘
              RouDi守护进程（管理内存分配）
```

---

## 四、根本原因

系统上存在**两个不同版本的 libddsc.so.0**：

| | 路径 | 大小 | 编译方式 |
|---|---|---|---|
| **问题版本** | `/usr/local/lib/libddsc.so.0` | 9.4 MB | 带 iceoryx 支持 |
| **正常版本** | `~/cyclonedds_ws/install/cyclonedds/lib/libddsc.so.0.10.2` | 8.5 MB | 标准版，无 iceoryx |

**崩溃链条：**

```
1. Python 加载 _clayer.so
        ↓
2. _clayer.so 需要 libddsc.so.0（按 SONAME 查找）
        ↓
3. 系统默认路径优先找到 /usr/local/lib/libddsc.so.0（iceoryx 版）
        ↓
4. ddspy_write() 调用 libddsc 内部写操作
        ↓
5. iceoryx 版 libddsc 尝试访问共享内存区域
        ↓
6. RouDi 守护进程未运行，共享内存段不存在
        ↓
7. 访问非法内存地址 → Segmentation Fault
```

**为什么 iceoryx 版在这里不能用：**  
iceoryx 版 libddsc 在初始化写操作时会尝试通过 RouDi 申请共享内存 chunk。RouDi 是独立的守护进程，在机器人的完整运行环境中才会启动。单独运行 Python 脚本时，RouDi 不在，libddsc 就访问了无效的内存地址。

**`.bashrc` 里的线索：**

```bash
# ROS Foxy 选项里有这行：
export LD_LIBRARY_PATH=/usr/local/lib:$LD_LIBRARY_PATH
```

这行把 `/usr/local/lib`（iceoryx 版）加到了搜索路径最前面，让错误的 libddsc 被优先加载。

---

## 五、解决方案

在 `LD_LIBRARY_PATH` 中让正确的 cyclonedds_ws 库路径**优先于** `/usr/local/lib`。

**临时用法（单次有效）：**

```bash
LD_LIBRARY_PATH=/home/unitree/cyclonedds_ws/install/cyclonedds/lib:$LD_LIBRARY_PATH python3 camera_opencv.py
```

**永久修复（写入 `~/.bashrc`）：**

```bash
# 在 CUDA 那行之后追加：
export LD_LIBRARY_PATH=/home/unitree/cyclonedds_ws/install/cyclonedds/lib:$LD_LIBRARY_PATH
```

加载顺序变为：

```
cyclonedds_ws/lib  →  /usr/local/lib  →  /usr/local/cuda-11.4/lib64
   ↑ 标准版优先         ↑ iceoryx版被遮蔽
```

**为什么 cyclonedds_ws 版可以正常工作：**  
标准版 libddsc 走 UDP 网络发送 DDS 数据，不依赖 iceoryx/RouDi，连接上机器人的网络就可以直接通信。

---

## 六、验证结果

```bash
# 运行成功，图片已保存（197 KB）
/home/unitree/unitree_sdk2_python/example/go2/front_camera/img.jpg
```

`capture_image.py` 不再 segfault，GetImageSample 返回 code=0，摄像头数据正常获取。

---

## 七、总结

> Unitree 为机器人本地高速通信预装了一个带 iceoryx 共享内存支持的 libddsc，但 iceoryx 守护进程 RouDi 在没有完整机器人环境时不会运行，Python SDK 的 DDS 写操作触发了对不存在的共享内存的访问，因此 segfault。修复方法是让 Python 优先加载不依赖 iceoryx 的标准版 libddsc。

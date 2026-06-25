# Unitree Go2 拓展坞升级：Orin Nano 8G → Orin NX 16G

## 两种拓展坞版本

Unitree Go2 的拓展坞有两种配置版本，分别搭载不同的 NVIDIA Jetson Orin 模块：

|          | **Jetson Orin Nano 8GB**                                                                             | **Jetson Orin NX 16GB** |
| -------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------- |
| AI 算力  | 40 TOPS                                                                                                    | 100 TOPS                      |
| 内存     | 8 GB                                                                                                       | 16 GB                         |
| CPU      | 6 核 Arm Cortex-A78AE                                                                                      | 8 核 Arm Cortex-A78AE         |
| 最大功耗 | 15W                                                                                                        | 25W                           |

NX 16G 版本在 AI 推理算力上比 Nano 8G 提升了 **2.5 倍**，适合在机器人上运行更复杂的感知或控制模型。本文记录将 Nano 8G 模块替换为 NX 16G 模块的完整流程。

由于此前已在 Nano 8G 上进行了大量开发工作（环境配置、依赖安装、自定义代码等），不希望在 NX 16G 上从零重装系统，因此本文的核心思路是：**保留 Nano 8G 的原有 SSD 和系统，仅通过降级 NX 16G 的 QSPI firmware 并修改少量配置文件，使其能够驱动 NX 16G 硬件正常工作**。

---

## 为什么不能直接插上就用

购买到的全新 Jetson Orin NX 16G 模块出厂预装的是 **JetPack 6.2**（即 NVIDIA Jetson Linux 36.4.3），而 Unitree 出厂的 Expansion Dock 系统运行的是 **JetPack 5.1.1**（即 NVIDIA Jetson Linux 35.3.1）。

|                      | JetPack 版本  | Jetson Linux 版本 |
| -------------------- | ------------- | ----------------- |
| Unitree 出厂 SSD     | JetPack 5.1.1 | 35.3.1            |
| 全新购入 NX 16G 模块 | JetPack 6.2   | 36.4.3            |

从 JetPack 5.x 升级到 JetPack 6.x 是一次重大版本跨越，底层变化包括内核版本、驱动栈和 BSP 结构。更关键的是，**Jetson 模块内部有一块独立的 QSPI-NOR Flash**，其中存储的 QSPI firmware（也称 Bootloader / MB2 / CBoot 等组件）版本必须与运行的 Jetson Linux 版本相匹配。

NVIDIA 官方文档明确指出，Jetson Linux 35.x（JetPack 5.x）与 Jetson Linux 36.x（JetPack 6.x）的 QSPI firmware 互不兼容。如果 QSPI firmware 版本与 SSD 上的系统版本不一致，Jetson 在启动时会因为引导链无法正确握手而陷入**不停重启（boot loop）**，无法进入系统。

> 参考：[Flashing Support — NVIDIA Jetson Linux 36.4.4 Developer Guide](https://docs.nvidia.com/jetson/archives/r36.4.4/DeveloperGuide/SD/FlashingSupport.html)（Updating Jetson Orin Nano Devkit from JetPack 5 to JetPack 6）
>
> 原文："The halt is because of a mismatch between the bootloader in the QSPI and the file system in the SD card. The bootloader version is JetPack 6, and the file system is JetPack 5. JetPack 6 bootloader does not support the JetPack 5 file system."

### 为什么是降级而不是升级？

既然版本不兼容是核心问题，一个自然的想法是：能否反过来，把 SSD 上的系统升级到 JetPack 6.x，让它与 NX 16G 模块的出厂 QSPI firmware 匹配？

理论上，NX 16G 配合 JetPack 6.2 可以激活 **MAXN SUPER 模式**，AI 算力可达 **157 TOPS**；甚至 Nano 8G 升级至 JetPack 6.2 后也能达到 **67 TOPS**。但这在 Go2 上并不可行：**Go2 的散热结构和电源设计是围绕 JetPack 5.1.1 的功耗范围设计的**，在更高算力模式下会出现严重发热和电流过载，存在损坏硬件的风险。

此外，Unitree 目前仅为 Go2 提供基于 **JetPack 5.1.1** 的出厂系统镜像，没有 JetPack 6.x 的官方适配版本。

因此，正确做法是将 NX 16G 模块的 QSPI firmware **降级**至与 JetPack 5.1.1 匹配的版本，而非升级系统。

---

## 解决方案

### 第一步：对 NX 16G 模块降级 QSPI Firmware

在将 NX 16G 模块插入 Unitree Expansion Dock 之前，需要先降级其 QSPI firmware。

#### 所需硬件

- 一块 **Jetson Carrier Board**（能够让 NX 16G 进入 Force Recovery 刷机模式）
- USB Type-C 或 Micro-USB 线（取决于 carrier board 型号）
- 一台运行 Ubuntu 的 Linux 主机

#### 刷写 QSPI Firmware 步骤

1. 将 NX 16G 模块安装到 Jetson Carrier Board 上（**此时不插入 Unitree SSD**）
2. 按照 carrier board 使用说明进入 **Force Recovery 模式**（通常为按住 Recovery 按钮再上电）
3. 在 Linux 主机上下载 **[NVIDIA Jetson Linux 35.3.1 Driver Package (BSP)](https://developer.nvidia.com/embedded/jetson-linux-r3531)**
4. 仅对 QSPI 执行刷写，不刷写 rootfs，即无需下载 Sample Root Filesystem

具体的 QSPI-only 刷机命令可参考以下指南（该指南以 JetPack 6 降级为例，操作思路相同，替换对应版本的 BSP 即可）：

> 参考：[GR00T JetPack 刷机参考](https://nvlabs.github.io/GR00T-WholeBodyControl/references/jetpack6.html)

刷机时需查阅所用 carrier board 自身的使用说明，以确认进入 Recovery 模式的方式和线缆连接方法。

QSPI firmware 降级完成后，将 NX 16G 模块插入 Unitree Expansion Dock 并接上原来的 M.2 SSD，此时已经可以正常进入系统。系统能够识别到 **16GB 内存**和 **8 核 CPU**，但对模块的型号识别和电源管理模式仍然是 Nano 8G 的配置。

---

### 第二步：构建 NX 16G Linux 系统环境

QSPI firmware 降级完成后，根据是否需要保留原有开发环境，选择以下两种方案之一：

#### 方案 A：保留原有系统，修改配置文件

将 NX 16G 模块插入 Unitree Expansion Dock，接上原来的 SSD 启动。此时系统可以进入，但内核仍然加载的是 Nano 8G 的硬件描述，功耗管理也受限于 Nano 8G 的配置。需要手动替换三个文件，让系统正确识别 NX 16G 硬件。

**替换文件的来源**：将 NX 16G 的 Unitree 出厂镜像 SSD 挂载到当前系统（挂载点例如 `/media/unitree/7073f027-1f76-471e-8386-b7ac9f58e0e6/`），直接从中复制对应文件。

##### 1. 替换电源管理配置文件 `nvpmodel.conf`

| 项目             | 内容                                                                 |
| ---------------- | -------------------------------------------------------------------- |
| **来源**   | `/media/unitree/7073f027-.../etc/nvpmodel.conf`（NX 16G 出厂 SSD） |
| **目标**   | `/etc/nvpmodel.conf`（当前运行系统）                               |
| **备份**   | 先将原文件备份为`/etc/nvpmodel.conf.nano8g.bak`                    |
| **替换前** | 仅有 15W / 7W 两个电源模式                                           |
| **替换后** | 新增 MAXN / 10W / 15W / 25W 四个电源模式                             |

```bash
sudo cp /etc/nvpmodel.conf /etc/nvpmodel.conf.nano8g.bak
sudo cp /media/unitree/7073f027-.../etc/nvpmodel.conf /etc/nvpmodel.conf
```

##### 2. 替换设备树文件（DTB）

内核通过 DTB（Device Tree Blob）识别硬件。Nano 8G 与 NX 16G 使用不同的 DTB 文件，需要从 NX 16G 出厂 SSD 复制对应文件覆盖当前系统中的同名文件。

| 项目           | 内容                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| **来源** | `/media/unitree/7073f027-.../boot/dtb/kernel_tegra234-p3767-0000-p3768-0000-a0.dtb`（NX 16G 出厂 SSD） |
| **目标** | `/boot/dtb/kernel_tegra234-p3767-0000-p3768-0000-a0.dtb`（当前系统）                                   |

```bash
sudo cp /media/unitree/7073f027-.../boot/dtb/kernel_tegra234-p3767-0000-p3768-0000-a0.dtb \
    /boot/dtb/kernel_tegra234-p3767-0000-p3768-0000-a0.dtb
```

##### 3. 修改启动配置文件 `extlinux.conf`

`/boot/extlinux/extlinux.conf` 中的 `FDT` 行决定内核启动时加载哪个 DTB 文件。Nano 8G 与 NX 16G 的 DTB 文件名中仅有一段数字不同：

| 项目             | 内容                                                                          |
| ---------------- | ----------------------------------------------------------------------------- |
| **文件**   | `/boot/extlinux/extlinux.conf`                                              |
| **备份**   | 先备份为`/boot/extlinux/extlinux.conf.nano8g.bak`                           |
| **修改前** | `FDT /boot/dtb/kernel_tegra234-p3767-0003-p3768-0000-a0.dtb`（Nano 8G） |
| **修改后** | `FDT /boot/dtb/kernel_tegra234-p3767-0000-p3768-0000-a0.dtb`（NX 16G）  |

```bash
sudo cp /boot/extlinux/extlinux.conf /boot/extlinux/extlinux.conf.nano8g.bak
sudo sed -i 's/p3767-0003-p3768/p3767-0000-p3768/g' /boot/extlinux/extlinux.conf
```

修改后确认文件内容中 `FDT` 行指向的是 `p3767-0000` 版本的 DTB 文件。

完成以上三步后执行重启：

```bash
sudo reboot
```

重启后内核将加载 NX 16G 的硬件描述，系统平台会正确识别为 **Orin NX**，电源管理解锁 25W 和 MaxN 模式，同时 EMC（显存控制器）相关报错也将消除。

可通过以下命令验证：

```bash
# 查看模块型号
cat /proc/device-tree/model

# 查看可用电源模式
sudo nvpmodel -q
```

---

#### 方案 B：全新安装 Unitree 官方 NX 镜像

如果不需要保留原有开发环境，只想用一个干净的出厂系统，可以使用 **M.2 读卡器将 Unitree 官方提供的 NX 16G 镜像文件直接写入 M.2 SSD**，省去后续修改配置文件的步骤。

##### 所需材料

- 一个 **M.2 NVMe 读卡器**（USB 转 M.2 接口）
- 一台运行 Linux 的电脑
- Unitree 官方提供的 NX 16G 系统镜像文件：`go2_nx_Jetpack5.1.1_20250930.img.bz2`，可从 [Unitree 模块升级官方文档](https://support.unitree.com/home/en/developer/module_update) 获取下载链接（Google Drive）

##### 步骤

1. 解压镜像文件：

```bash
bzip2 -d go2_nx_Jetpack5.1.1_20250930.img.bz2
```

2. 将 SSD 通过 M.2 读卡器连接到电脑，确认设备路径：

```bash
lsblk
```

3. 写入镜像（将 `/dev/nvmeXn1` 替换为实际路径，**写入前务必确认设备路径正确**）：

```bash
sudo dd if=go2_nx_Jetpack5.1.1_20250930.img \
    of=/dev/nvmeXn1 \
    bs=64M \
    status=progress \
    oflag=direct
```

4. 写入完成后，将 SSD 装回 Expansion Dock，插上已完成 QSPI firmware 降级的 NX 16G 模块，即可直接启动

---

## 参考资料

- [Unitree 模块升级官方文档](https://support.unitree.com/home/en/developer/module_update)
- [NVIDIA JetPack Archive](https://developer.nvidia.com/embedded/jetpack-archive)
- [NVIDIA Jetson Linux 35.3.1 Developer Guide](https://docs.nvidia.com/jetson/archives/r35.3.1/DeveloperGuide/index.html)
- [GR00T JetPack 刷机参考（QSPI firmware 刷写流程）](https://nvlabs.github.io/GR00T-WholeBodyControl/references/jetpack6.html)

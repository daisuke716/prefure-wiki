# Go2 Jetson WiFi 网络配置完整指南

记录：给 Unitree Go2 机器狗的Jetson拓展坞加装 USB WiFi 网卡，实现"WiFi 无线连接 NoMachine + 桥接电脑有线上网"的完整过程，包括踩过的坑和最终方案。

---

## 1. 背景与目标

- 给 Jetson（Go2 机器人本体的板载电脑）加装一块 USB WiFi 网卡（RTL8812BU），让它对外广播一个热点 `go2`
- 目标一：外部电脑通过 WiFi 连接 `go2` 热点后，可以用 NoMachine 远程访问 Jetson 桌面（不需要插网线）
- 目标二：Jetson 自己的上网，改为通过 WiFi 反向"蹭"外部电脑的网络（电脑有线上网，Jetson WiFi 连电脑，电脑把网络共享给 Jetson）
- `eth0`（Jetson 唯一的物理有线口）专职连接机器人本体网络（`192.168.123.0/24`，机器人主控在 `192.168.123.161`）

---

## 2. 硬件与驱动：RTL8812BU 网卡安装

### 2.1 硬件识别

```bash
lsusb
# Bus 001 Device 002: ID 0bda:b812 Realtek Semiconductor Corp. USB3.0 802.11ac 1200M Adapter
```

芯片型号 `0bda:b812`，即 **RTL8812BU / RTL88x2BU**，支持 2.4G/5G 双频 AC1200。

### 2.2 驱动情况说明

- 这颗芯片（`0bda:b812`）的驱动是在 Linux 6.4 左右才随 `rtw88`（`CONFIG_RTW88_8822BU`）合并进内核主线的，6.12 之后趋于稳定；Ubuntu 22.04 的 HWE 内核、24.04 默认内核（6.8+）都晚于这个合并时间点，所以在这些系统上插上就能直接用，不需要手动编译
- 但这台 Jetson 用的是 Unitree 官方基于 Ubuntu 20.04 定制的老版本厂商内核（`5.10.104-tegra`），远早于上述合并时间点，内核里没有这颗芯片的驱动，所以仍需要用 `rtl88x2bu`（社区维护、基于 Realtek 官方放出的厂商源码，来自 [cilynx/rtl88x2bu](https://github.com/cilynx/rtl88x2bu)）手动编译安装。内核头文件也已匹配（`/usr/src/linux-headers-5.10.104-tegra-ubuntu20.04_aarch64`）

获取源码：

```bash
git clone https://github.com/cilynx/rtl88x2bu.git /usr/src/rtl88x2bu-5.8.7.1
sudo dkms add -m rtl88x2bu -v 5.8.7.1
```

### 2.3 踩坑：Makefile 平台判断 bug

驱动默认 Makefile 里同时把 `CONFIG_PLATFORM_I386_PC` 和 `CONFIG_PLATFORM_ARM_RPI` 设成了 `y`，导致平台判断逻辑的 `ifeq` 匹配失败，编译时算出的内核路径（`KSRC`）是空的，报错：

```
make[1]: *** M=/var/lib/dkms/.../build: No such file or directory
```

**修复**：编辑 `/usr/src/rtl88x2bu-5.8.7.1/Makefile`，把 `CONFIG_PLATFORM_I386_PC` 改成 `n`（保留 `CONFIG_PLATFORM_ARM_RPI = y`，这个分支同时覆盖树莓派和通用 aarch64 平台）。

```bash
sudo sed -i 's/^CONFIG_PLATFORM_I386_PC = y/CONFIG_PLATFORM_I386_PC = n/' \
    /usr/src/rtl88x2bu-5.8.7.1/Makefile

# 确认改对了：
grep -E '^CONFIG_PLATFORM_(I386_PC|ARM_RPI)' /usr/src/rtl88x2bu-5.8.7.1/Makefile
```

### 2.4 编译安装

```bash
sudo dkms build rtl88x2bu/5.8.7.1
sudo dkms install rtl88x2bu/5.8.7.1
sudo modprobe 88x2bu
```

驱动加载成功后 `wlan0` 出现，`iw list` 确认支持 AP 模式。

---

## 3. 网络架构设计：为什么不能"一个网段搞定"

这是整个折腾过程里最核心的技术点，必须理解清楚。

### 3.1 最初的错误设计

一开始把 `wlan0`（WiFi热点）也配置成 `192.168.123.0/24`（跟 `eth0`、机器人 `.161` 一样的网段），以为这样 WiFi 客户端就能"直接"访问机器人。

**这是错的**，原因：

- `eth0` 和机器人 `.161` 是物理上插在**同一个交换机**上，是真正的同一个广播域，配同网段没问题
- `wlan0` 的 WiFi 客户端是通过**无线电波**连接的，跟 `eth0` 那根网线是完全不同的物理介质。即使配了相同的 IP 网段，客户端的操作系统仍然会认为"同网段=同一根线"，尝试用 ARP 广播直接找 `.161` 的 MAC 地址——但这个广播只在 WiFi 信号范围内传播，永远传不到有线那边，所以**连 ARP 都解析不出来，数据包根本发不出去**

用抓包（`tcpdump -i wlan0 icmp`）验证：60 秒窗口内，客户端 ping 机器人的请求，Jetson 的 WiFi 网卡上一个包都没收到。证实问题出在客户端根本没把包发出来，而不是转发规则的问题。

### 3.2 正确设计：不同网段 + 路由

**结论：IP 网段只是逻辑编号，能不能"同网段直连"取决于物理拓扑是否真的在同一个广播域。跨物理介质（有线 ↔ WiFi）必须用路由（不同网段 + 网关转发），不能靠"配成同一网段"蒙混过关。**

最终方案：

| 接口                      | 网段                                 | 用途                              |
| ------------------------- | ------------------------------------ | --------------------------------- |
| `eth0`                  | `192.168.123.0/24`（静态 `.18`） | 专职连接机器人本体网络            |
| `wlan0`（`go2` 热点） | `192.168.124.0/24`（`.1`）       | WiFi 客户端接入，与机器人网段隔开 |

WiFi 客户端（外部电脑）配置静态 IP `192.168.124.223/24`，网关指向 `192.168.124.1`（Jetson）。这样电脑发往 `192.168.123.161` 的包，会正确地发给网关（Jetson），由 Jetson 路由转发过去，而不是徒劳地在 WiFi 网段里找一个根本不存在的设备。

（备注：本来用二层网桥`br0`把 `eth0` 和 `wlan0` 桥接成真正的同一个广播域是"更正规"的解法，试过，但这个 `rtl88x2bu` 驱动一旦被桥接，AP 模式下客户端 WPA 握手会失败，日志里完全没有握手记录，只能放弃网桥方案，改用路由方案。）

---

## 4. Jetson 端配置

### 4.1 `eth0`：静态 IP，专连机器人

```bash
sudo nmcli connection modify "Wired connection 1" \
  ipv4.method manual ipv4.addresses 192.168.123.18/24 ipv4.gateway 192.168.123.1
sudo nmcli connection up "Wired connection 1"
```

自动连接优先级也调高，避免被另一个残留的 DHCP 连接 profile（`Wired connection 2`，优先级 `-999`）抢走：

```bash
nmcli connection modify "Wired connection 1" connection.autoconnect-priority 10
```

### 4.2 `wlan0`：`go2` 热点，独立新网段

用 `nmcli` 建热点（注意 `ipv4.method` 用 `manual` 而不是默认的 `shared`，这样才能不做 NAT/不跑内置 DHCP，落在指定网段上）：

```bash
nmcli device wifi hotspot ifname wlan0 ssid go2 password 12345678
nmcli connection modify Hotspot ipv4.addresses 192.168.124.1/24
nmcli connection up Hotspot
```

**开机自动生效 + 5GHz 频段**（2.4GHz 默认速度较慢，改成 5GHz 信道 36，非 DFS 信道更稳定）：

```bash
nmcli connection modify Hotspot \
  connection.autoconnect yes connection.autoconnect-priority 100 \
  802-11-wireless.band a 802-11-wireless.channel 36
nmcli connection up Hotspot
```

> 踩坑提示：GNOME 图形界面的"开启 WiFi 热点"开关，只认 `ipv4.method=shared` 的连接，我们这种 `manual` 模式的自定义热点，图形界面会显示成灰色/无法正确识别状态，只能用命令行 `nmcli`/`sg netdev` 管理。

### 4.3 转发 + NAT 规则

Unitree 定制系统上 `iptables` 的 `FORWARD` 链策略是 `DROP`（标准 Linux 默认是 `ACCEPT`），需要显式放行两个网卡之间的转发：

```bash
sudo iptables -I FORWARD -i eth0 -o wlan0 -j ACCEPT
sudo iptables -I FORWARD -i wlan0 -o eth0 -j ACCEPT
```

NAT：让机器人 `.161` 收到的请求看起来像是从 Jetson 自己（`192.168.123.18`）发出的，这样它才知道怎么回包（因为它压根不认识 `192.168.124.0/24` 这个陌生网段）：

```bash
sudo iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
```

### 4.4 上网：走 WiFi 反向桥接电脑

Jetson 添加一条"备用默认路由"，指向电脑在 `go2` 网络里的 IP（网关），metric 设高一点（比如 500），保证不抢现有路由，只在需要时兜底：

```bash
sudo ip route replace default via 192.168.124.223 dev wlan0 metric 500
```

（这条命令里的 `192.168.124.223` 就是外部电脑连 `go2` 之后的静态 IP，见第 5 节。）

### 4.5 全部写进开机自动执行

把上述除了"建热点"以外的关键项汇总进 `/home/unitree/network_fix.sh`：

```bash
#!/bin/bash

# eth0: 静态，专连机器人网络
sudo nmcli connection modify "Wired connection 1" ipv4.method manual ipv4.addresses 192.168.123.18/24 ipv4.gateway 192.168.123.1
sudo nmcli connection up "Wired connection 1"

# wlan0: go2热点，独立网段
sudo nmcli connection modify Hotspot ipv4.addresses 192.168.124.1/24
nmcli connection up Hotspot

# 上网备用路由：走WiFi桥接电脑
sudo ip route replace default via 192.168.124.223 dev wlan0 metric 500

# 转发规则
sudo iptables -C FORWARD -i eth0 -o wlan0 -j ACCEPT 2>/dev/null || sudo iptables -I FORWARD -i eth0 -o wlan0 -j ACCEPT
sudo iptables -C FORWARD -i wlan0 -o eth0 -j ACCEPT 2>/dev/null || sudo iptables -I FORWARD -i wlan0 -o eth0 -j ACCEPT

# NAT
sudo iptables -t nat -C POSTROUTING -o eth0 -j MASQUERADE 2>/dev/null || sudo iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE

# DNS修复：手动(manual)网络没有自动DNS，需要显式指定
sudo nmcli connection modify "Wired connection 1" ipv4.dns "8.8.8.8 1.1.1.1" ipv4.ignore-auto-dns yes
sudo nmcli connection modify Hotspot ipv4.dns "8.8.8.8 1.1.1.1" ipv4.ignore-auto-dns yes
sudo resolvectl dns eth0 8.8.8.8 1.1.1.1
```

> 踩坑提示：`eth0`/`Hotspot` 都是 `ipv4.method=manual`（静态），静态模式下 NetworkManager 不会自动写入 DNS 服务器，`/etc/resolv.conf` 可能是空的或者指向一个不可用的地址，导致域名解析全部失败（能 `ping 8.8.8.8` 但 `ping www.baidu.com` 不通）。需要显式指定 DNS 服务器并关闭自动 DNS 覆盖（`ipv4.ignore-auto-dns yes`）。

再建一个 systemd 服务开机自动跑这个脚本：

```bash
sudo tee /etc/systemd/system/network-fix.service << 'EOF'
[Unit]
Description=Go2 Jetson network fix (static eth0 + go2 AP + wifi internet bridge)
After=NetworkManager.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/home/unitree/network_fix.sh
User=root

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable network-fix.service
```

**开机网络自愈能力总结**：

- `go2` 热点：`autoconnect=yes` + 最高优先级 → 开机必定自动广播，随时可以 WiFi 连 `192.168.124.1`（SSH / NoMachine）
- `eth0` 静态 + 转发 + NAT + 上网路由：靠 `network-fix.service` 开机自动跑，不需要手动执行任何东西

---

## 5. 外部电脑端配置（以 Ubuntu 为例）

电脑本身有线（`enp4s0`）上真实的网，WiFi（`wlo1`）连 `go2`。

### 5.1 WiFi 网卡：新网段静态 IP + 网关

```bash
sudo nmcli connection modify go2 ipv4.method manual ipv4.addresses 192.168.124.223/24 ipv4.gateway 192.168.124.1
sudo nmcli connection up go2
```

### 5.2 共享自己的网络给 Jetson

```bash
sudo sysctl -w net.ipv4.ip_forward=1
sudo iptables -t nat -A POSTROUTING -o enp4s0 -j MASQUERADE
sudo iptables -I FORWARD -i wlo1 -o enp4s0 -j ACCEPT
sudo iptables -I FORWARD -i enp4s0 -o wlo1 -m state --state ESTABLISHED,RELATED -j ACCEPT
```

### 5.3 到机器人网段的静态路由（走 WiFi 网关）

不加这条的话，系统会把 `192.168.123.0/24` 的流量走默认路由（真实上网口）发出去，根本到不了 Jetson：

```bash
sudo ip route replace 192.168.123.0/24 via 192.168.124.1 dev wlo1
```

### 5.4 保存成脚本 + 开机自动执行（可选）

保存为 `~/go2_network_fix.sh`（内容为上面 5.1~5.3 全部命令），然后：

```bash
chmod +x ~/go2_network_fix.sh

sudo tee /etc/systemd/system/go2-network-fix.service << 'EOF'
[Unit]
Description=Go2 network fix (share internet to go2 hotspot)
After=NetworkManager.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/home/daisuke/go2_network_fix.sh
User=root

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable go2-network-fix.service
```

---

## 6. 最终验证结果

| 测试项                                                 | 结果                  |
| ------------------------------------------------------ | --------------------- |
| 电脑 WiFi 连`go2`                                    | ✅                    |
| NoMachine 通过 WiFi 访问 Jetson（连`192.168.124.1`） | ✅                    |
| Jetson 上网（走 WiFi 桥接电脑）                        | ✅`ping 8.8.8.8` 通 |
| Jetson 连机器人`192.168.123.161`                     | ✅                    |
| 电脑（纯 WiFi，不插网线）连机器人`192.168.123.161`   | ✅                    |

**以后 SSH / NoMachine 统一连 `192.168.124.1`**，不再是旧的 `192.168.123.19`。

---

## 7. 已知遗留问题：DDS / SDK 脚本无法通过 WiFi 桥接使用

用 `unitree_sdk2py` 的 `VideoClient`（`ChannelFactoryInitialize`）或 ROS2 的 DDS 话题跨这条 WiFi 桥接链路时，仍然连不上，报错 `send request error` / `VideoClient error code: 3102`。

### 7.1 排查过程

1. 先怀疑是 iptables 挡了 UDP 端口 —— **排除**：`FORWARD` 链没有任何端口限制，全协议放行，且 `ping`（ICMP）、SSH 端口探测（TCP）都正常。
2. 真正原因是 **DDS 依赖多播（Multicast）做参与者发现**，而普通的 `ip_forward=1` + iptables 转发**只处理单播流量**，多播跨路由器转发需要单独的"多播路由"能力（IGMP/PIM 之类），这是 IP 协议本身的设计，不是随便就能绕过的限制。
3. 尝试用 `smcroute`（用户态多播路由守护进程）在 `wlan0`/`eth0` 之间转发 DDS 默认使用的多播组 `239.255.0.1`，结果直接报错：

   ```
   Failed initializing IPv4 multicast routing API: Protocol not available
   Kernel does not support multicast routing.
   ```

   这台 Jetson 的内核（`5.10.104-tegra`）**编译时没有打开 `CONFIG_IP_MROUTE`**（多播路由支持），这是内核级别的能力缺失，任何用户态工具都无法绕过，只能重新编译内核才能解决——对一台正在服役的机器人板载电脑来说风险太高，不建议轻易尝试。
4. 另外还发现，就算多播能过去，现在的 NAT（`MASQUERADE`）方案本身也和 DDS 不兼容：DDS 协议在发现阶段的 payload 里会**嵌入参与者自己的真实地址**，供后续单播数据交换使用；而 NAT 只改包头的源地址，不会改 payload 内容，机器人那边即使收到发现包，后续想直接回连"payload 里记录的地址"时会因为地址被换掉而连不上。

### 7.2 结论

**目前的 WiFi 桥接方案，天生不支持 DDS / SDK 相关脚本（`VideoClient`、`SportClient`、ROS2 话题跨网段订阅等）**，这是内核能力 + NAT 架构的双重限制，不是配置能修的。

**这类需要 DDS 通讯的脚本，暂时只能插着有线网线（`eth0` 直连机器人网络）时才能正常运行**，WiFi 桥接目前只适用于：NoMachine 远程桌面、SSH、上网、`ping` 这类不依赖 DDS 发现协议的场景。

如果以后要彻底解决，可选方向（都有较大代价，未实施）：

- 重新编译 Jetson 内核，打开 `CONFIG_IP_MROUTE`，配合真正的多播路由守护进程
- 把 DDS（CycloneDDS）配置改为纯单播 Peer 模式（跳过多播发现），需要同时改动机器人本体和客户端两侧的 DDS 配置，且机器人本体（`192.168.123.161`）目前 SSH 无法登录（端口拒绝连接），无法做这个改动

---

## 8. 故障排查：重启后 go2 热点能连但访问不了 WAN

### 8.1 现象

重启 Jetson 后，手机/电脑能正常连上 `go2` 热点、能 SSH / NoMachine 进 Jetson，但 Jetson 自己上不了外网（`ping 8.8.8.8` 不通，或者通但网页打不开），必须手动重新执行一遍 `~/network_fix.sh` 才能恢复。

**根因**（排查过程见 8.2）：开机时的 systemd 时序竞争，`network-fix.service` 跑得比 USB WiFi 网卡驱动快。已在 8.3 修复（`network_fix.sh` 加轮询重试 + systemd 加设备依赖），8.4 有验证结果。如果按 8.3 配置之后还复现，说明不是这个原因，需要重新排查。

### 8.2 排查

`journalctl -u network-fix.service -b` 显示服务在开机后很早就跑完了，但中间报了两个错：

```
Error: Connection activation failed: No suitable device found for this connection ...
Cannot find device "wlan0"
```

同时查 `journalctl -b | grep wlan0`：USB WiFi 网卡驱动 `88x2bu`（DKMS 编译）从内核注册到 `wlan0` 设备真正可用（AP 起来、拿到 IP），中间有十几秒的延迟。而 `network-fix.service` 的启动条件只是 `After=NetworkManager.service network-online.target`——这只保证 NetworkManager 本身启动了，不保证这块通过 DKMS 挂进来的 USB 网卡已经枚举完、`wlan0` 设备已经存在。

也就是说，脚本比网卡驱动跑得快：执行到依赖 `wlan0` 的步骤（`nmcli connection up Hotspot`、`ip route ... dev wlan0`）时设备根本还不存在，直接报错退出。

**热点为什么看起来"开机自动生效"了？** 因为 `Hotspot` 连接本身设了 `autoconnect=yes` + 最高优先级（见 4.2 节），NetworkManager 会在 `wlan0` 设备真正就绪后自己独立地把热点带起来——这跟 `network-fix.service` 是两条不相关的路径，一条成功一条失败，所以表现成"热点有、上网没有"。

### 8.3 修复

两处改动：

**(1) `~/network_fix.sh` 里给依赖 `wlan0` 的步骤加轮询重试**（不再是跑一次失败就算完）：

```bash
echo "Waiting for wlan0..."
for i in $(seq 1 60); do
    ip link show wlan0 &>/dev/null && break
    sleep 1
done

echo "Bringing up Hotspot..."
for i in $(seq 1 30); do
    nmcli connection up Hotspot && break
    sleep 2
done

# ...DNS 配置...

echo "Setting default route via wlan0..."
for i in $(seq 1 30); do
    sudo ip route replace default via 192.168.124.223 dev wlan0 metric 500 && break
    sleep 2
done
```

**(2) systemd 服务加一层设备依赖，作为双保险**：

```bash
sudo tee /etc/systemd/system/network-fix.service << 'EOF'
[Unit]
Description=Go2 Jetson network fix (static eth0 + go2 AP + wifi internet bridge)
After=NetworkManager.service network-online.target sys-subsystem-net-devices-wlan0.device
Wants=network-online.target
Requires=sys-subsystem-net-devices-wlan0.device

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/home/unitree/network_fix.sh
TimeoutStartSec=300
User=root

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl restart network-fix.service
```

`sys-subsystem-net-devices-wlan0.device` 是 systemd 自动为每个 udev 网络设备生成的单元，加上 `After`/`Requires` 后，服务会等这个设备节点真正出现才启动——但因为 USB 网卡从"设备节点出现"到"AP 真正激活完成（wpa_supplicant 起来、拿到 IP）"中间还有好几秒，所以这层 systemd 依赖只是缩小等待窗口，脚本内部的轮询重试才是真正兜底的部分。另外把 `TimeoutStartSec` 从默认的 90s 调到 300s，避免重试循环跑得比默认超时还久被 systemd 强杀。

### 8.4 验证

改完之后重启，`journalctl -u network-fix.service -b` 能看到脚本自己打出的等待日志：

```
Waiting for wlan0...
Bringing up Hotspot...
Connection successfully activated ...
Setting default route via wlan0...
```

整个过程在开机后 20 秒左右自动跑完，`ip route` 里能看到 `default via 192.168.124.223 dev wlan0 metric 500` 已经设置好，且这个时间点早于人重新连上 WiFi、打开 NoMachine 的时间——证实这次是真正自动生效的，不再需要手动跑脚本。

**遗留的小尾巴**：`go2` 热点广播出来的时间点，比脚本里配置 DNS（`resolvectl dns eth0 ...`）那一步执行完成的时间点更早。如果开机后一两分钟内立刻打开浏览器，偶尔会遇到"能 `ping` 通 IP 但域名解析不了"的短暂窗口，等脚本剩余步骤跑完（通常几十秒内）会自愈，不是新问题，是同一个时序竞争的余波，目前判断不需要额外处理。

---

## 9. 当前网络架构与数据流详解

结合第 3、4 节的设计，这里把 Jetson 上实际生效的路由 + 转发 + NAT 配置，翻译成三条具体的数据流，方便以后排查问题时对照。

### 9.1 拓扑

```
                 机器人本体网络                          go2 WiFi 网段
              192.168.123.0/24                        192.168.124.0/24

  机器人主控 ────────┐                                ┌──── 外部电脑（WiFi 客户端）
  192.168.123.161    │                                │    192.168.124.223
  （交换机同网段）      │                                │    （真正的 WAN 出口）
                      │                                │
                   eth0（有线）                    wlan0（USB WiFi，AP 模式）
               192.168.123.18/24                  192.168.124.1/24
                      │                                │
                      └──────────── Jetson ────────────┘
                         内核路由 + iptables 转发/NAT
```

两块网卡是两个物理隔离的网段（有线 vs 无线电波），Jetson 靠**路由 + NAT**把它们接起来，不是二层网桥（网桥方案在 3.2 节已经踩坑说明放弃了）。

### 9.2 数据流 1：外部电脑 → SSH / NoMachine 到 Jetson（192.168.124.1）

同一网段（都在 `124.0/24`），直接可达，不需要转发，对应文档开头的"目标一"。

### 9.3 数据流 2：外部电脑 → 访问机器人主控（192.168.123.161）

```
电脑发包，dst=192.168.123.161，网关指向 124.1（Jetson）
  → 到达 Jetson wlan0
  → 命中路由 192.168.123.0/24 dev eth0（Jetson 自己也在这个网段上）
  → iptables FORWARD 链：wlan0→eth0 有显式 ACCEPT
    （Unitree 定制系统上 FORWARD 链策略是 DROP，全靠 4.3 节加的这两条 ACCEPT 规则续命）
  → iptables NAT POSTROUTING：-o eth0 MASQUERADE，把源地址从 192.168.124.223 换成 Jetson 自己的 192.168.123.18
    （必须换，机器人主控根本不认识 124.0/24 这个陌生网段，只认得来自 Jetson 自己的包）
  → 机器人回包给 192.168.123.18，Jetson 靠 conntrack 记录自动把地址换回来，转发回 wlan0 给电脑
```

### 9.4 数据流 3：Jetson 自己上网（对应 4.4 节的备用默认路由）

```
Jetson 查路由表，有两条 default：
  default via 192.168.124.223 dev wlan0 metric 500    ← 优先级高（metric 越小越优先）
  default via 192.168.123.1  dev eth0  metric 20100    ← 几乎是摆设，192.168.123.1 实际 ARP 不通

  → 走 wlan0，下一跳发给 192.168.124.223（外部电脑）
  → 这一跳 Jetson 不做 NAT（POSTROUTING 的 MASQUERADE 规则只对 -o eth0 生效，wlan0 出去不改包头）
  → 包到电脑后，由电脑自己做 ip_forward + MASQUERADE（-o 电脑的真实网口，见 5.2 节），换成电脑的公网地址发出去
  → 回包原路经电脑 NAT 换回、转发回 wlan0，回到 Jetson
```

**关键点：真正连公网的 NAT 发生在外部电脑上，不是 Jetson。** Jetson 对 wlan0 这条链路只是单纯转发数据包，不改包头；Jetson 自己的 MASQUERADE 规则只用在数据流 2（转发去机器人的流量）。

### 9.5 排查用的几条命令

```bash
# 看谁连在两块网卡上
ip neigh show dev wlan0
ip neigh show dev eth0

# 看当前默认路由走的是哪一条（metric 小的优先）
ip route

# 看转发规则是否还在（重启/系统更新有时会重置 iptables 规则）
sudo iptables -L FORWARD -n -v
sudo iptables -t nat -L POSTROUTING -n -v
```

---

*文档生成时间：2026-07-07；2026-07-09 补充第 8、9 节（开机时序竞争踩坑 + 网络架构详解）*

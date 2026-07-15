# Go2 Jetson WiFi Network Setup: Complete Guide

Documenting the complete process of adding a USB WiFi adapter to the Jetson expansion dock on a Unitree Go2 robot dog, to achieve "WiFi wireless connection to NoMachine + bridging internet access through a laptop's wired connection" — including the pitfalls hit along the way and the final solution.

---

## 1. Background and Goals

- Add a USB WiFi adapter (RTL8812BU) to the Jetson (the onboard computer of the Go2 robot itself) so it can broadcast a hotspot named `go2`
- Goal 1: after an external computer connects to the `go2` hotspot over WiFi, it should be able to remotely access the Jetson desktop via NoMachine (without needing an Ethernet cable)
- Goal 2: the Jetson's own internet access should be switched to reverse-"borrow" the network from the external computer via WiFi (the computer has wired internet, the Jetson's WiFi connects to the computer, and the computer shares its network with the Jetson)
- `eth0` (the Jetson's only physical wired port) is dedicated exclusively to the robot's own network (`192.168.123.0/24`, with the robot controller at `192.168.123.161`)

---

## 2. Hardware and Driver: Installing the RTL8812BU Adapter

### 2.1 Hardware Identification

```bash
lsusb
# Bus 001 Device 002: ID 0bda:b812 Realtek Semiconductor Corp. USB3.0 802.11ac 1200M Adapter
```

Chip model `0bda:b812`, i.e. **RTL8812BU / RTL88x2BU**, supporting dual-band 2.4G/5G AC1200.

### 2.2 Driver Situation

- The driver for this chip (`0bda:b812`) was only merged into the Linux mainline kernel around Linux 6.4, as part of `rtw88` (`CONFIG_RTW88_8822BU`), and became stable after 6.12; Ubuntu 22.04's HWE kernel and 24.04's default kernel (6.8+) both postdate this merge point, so on those systems it works out of the box once plugged in, with no need for manual compilation
- However, this Jetson runs Unitree's official vendor kernel — an older release (`5.10.104-tegra`) customized on top of Ubuntu 20.04 — which predates the above merge point by a wide margin. The kernel has no built-in driver for this chip, so it still needs to be manually compiled and installed using `rtl88x2bu` (community-maintained, based on Realtek's official vendor source release, from [cilynx/rtl88x2bu](https://github.com/cilynx/rtl88x2bu)). The matching kernel headers are already present (`/usr/src/linux-headers-5.10.104-tegra-ubuntu20.04_aarch64`)

Fetching the source:

```bash
git clone https://github.com/cilynx/rtl88x2bu.git /usr/src/rtl88x2bu-5.8.7.1
sudo dkms add -m rtl88x2bu -v 5.8.7.1
```

### 2.3 Pitfall: Makefile Platform Detection Bug

The driver's default Makefile sets both `CONFIG_PLATFORM_I386_PC` and `CONFIG_PLATFORM_ARM_RPI` to `y` at the same time, which breaks the `ifeq` matching in the platform-detection logic. As a result, the kernel path computed during the build (`KSRC`) ends up empty, producing the error:

```
make[1]: *** M=/var/lib/dkms/.../build: No such file or directory
```

**Fix**: edit `/usr/src/rtl88x2bu-5.8.7.1/Makefile` and change `CONFIG_PLATFORM_I386_PC` to `n` (keep `CONFIG_PLATFORM_ARM_RPI = y` — this branch covers both Raspberry Pi and generic aarch64 platforms).

```bash
sudo sed -i 's/^CONFIG_PLATFORM_I386_PC = y/CONFIG_PLATFORM_I386_PC = n/' \
    /usr/src/rtl88x2bu-5.8.7.1/Makefile

# Confirm the change took effect:
grep -E '^CONFIG_PLATFORM_(I386_PC|ARM_RPI)' /usr/src/rtl88x2bu-5.8.7.1/Makefile
```

### 2.4 Building and Installing

```bash
sudo dkms build rtl88x2bu/5.8.7.1
sudo dkms install rtl88x2bu/5.8.7.1
sudo modprobe 88x2bu
```

Once the driver loads successfully, `wlan0` appears; `iw list` confirms AP mode support.

---

## 3. Network Architecture Design: Why "One Subnet for Everything" Doesn't Work

This is the most central technical point in the entire process, and it's essential to understand it clearly.

### 3.1 The Initial Flawed Design

Initially, `wlan0` (the WiFi hotspot) was also configured on `192.168.123.0/24` (the same subnet as `eth0` and the robot's `.161`), on the assumption that this would let WiFi clients "directly" reach the robot.

**This is wrong**, for the following reasons:

- `eth0` and the robot at `.161` are physically plugged into **the same switch** — a genuinely shared broadcast domain, so configuring them on the same subnet works fine
- WiFi clients on `wlan0` connect over **radio waves**, a completely different physical medium from the Ethernet cable on `eth0`. Even with the same IP subnet configured, the client's operating system still assumes "same subnet = same wire" and tries to find `.161`'s MAC address via ARP broadcast — but that broadcast only propagates within WiFi signal range and never reaches the wired side. As a result, **even ARP resolution fails, and the packet never gets sent out at all**

Verified via packet capture (`tcpdump -i wlan0 icmp`): over a 60-second window, the client's ping requests to the robot never produced a single packet received on the Jetson's WiFi adapter. This confirmed the problem was that the client never sent the packet out in the first place — not a forwarding-rule issue.

### 3.2 Correct Design: Different Subnets + Routing

**Conclusion: an IP subnet is just a logical label — whether "same-subnet direct connection" works depends on whether the physical topology is actually the same broadcast domain. Crossing physical media (wired ↔ WiFi) requires routing (different subnets + gateway forwarding); you cannot fake it by "configuring the same subnet."**

Final design:

| Interface                 | Subnet                                | Purpose                                     |
| -------------------------- | -------------------------------------- | -------------------------------------------- |
| `eth0`                   | `192.168.123.0/24` (static `.18`) | Dedicated to the robot's own network         |
| `wlan0` (`go2` hotspot) | `192.168.124.0/24` (`.1`)         | WiFi client access, isolated from the robot's subnet |

The WiFi client (external computer) is configured with a static IP `192.168.124.223/24`, with its gateway pointing at `192.168.124.1` (the Jetson). This way, packets the computer sends to `192.168.123.161` are correctly handed off to the gateway (the Jetson), which routes them onward — instead of futilely searching the WiFi subnet for a device that doesn't exist there at all.

(Note: bridging `eth0` and `wlan0` into a true Layer-2 broadcast domain via a bridge `br0` would in principle be the "more proper" solution, and it was tried — but once this `rtl88x2bu` driver is bridged, client WPA handshakes in AP mode fail completely, with no handshake record at all in the logs. This bridging approach had to be abandoned in favor of the routing-based solution.)

---

## 4. Jetson-Side Configuration

### 4.1 `eth0`: Static IP, Dedicated to the Robot

```bash
sudo nmcli connection modify "Wired connection 1" \
  ipv4.method manual ipv4.addresses 192.168.123.18/24 ipv4.gateway 192.168.123.1
sudo nmcli connection up "Wired connection 1"
```

Also raise the autoconnect priority, to prevent this connection from being displaced by a leftover DHCP connection profile (`Wired connection 2`, priority `-999`):

```bash
nmcli connection modify "Wired connection 1" connection.autoconnect-priority 10
```

### 4.2 `wlan0`: The `go2` Hotspot, on Its Own Separate Subnet

Create the hotspot with `nmcli` (note: use `ipv4.method` set to `manual` rather than the default `shared`, so that it doesn't do NAT or run a built-in DHCP server, and lands on the specified subnet instead):

```bash
nmcli device wifi hotspot ifname wlan0 ssid go2 password 12345678
nmcli connection modify Hotspot ipv4.addresses 192.168.124.1/24
nmcli connection up Hotspot
```

**Making it take effect automatically at boot + 5GHz band** (2.4GHz is slower by default; switch to 5GHz channel 36, a non-DFS channel, for better stability):

```bash
nmcli connection modify Hotspot \
  connection.autoconnect yes connection.autoconnect-priority 100 \
  802-11-wireless.band a 802-11-wireless.channel 36
nmcli connection up Hotspot
```

> Pitfall note: GNOME's graphical "Turn On WiFi Hotspot" toggle only recognizes connections with `ipv4.method=shared`. For our kind of custom `manual`-mode hotspot, the GUI shows a greyed-out / incorrectly-recognized status, so it can only be managed via the `nmcli` / `sg netdev` command line.

### 4.3 Forwarding + NAT Rules

On the Unitree customized system, the `iptables` `FORWARD` chain policy is `DROP` (standard Linux defaults to `ACCEPT`), so forwarding between the two adapters must be explicitly allowed:

```bash
sudo iptables -I FORWARD -i eth0 -o wlan0 -j ACCEPT
sudo iptables -I FORWARD -i wlan0 -o eth0 -j ACCEPT
```

NAT: make requests received by the robot at `.161` appear as if they came from the Jetson itself (`192.168.123.18`), so it knows how to send the reply back (since it has no idea what to do with an unfamiliar subnet like `192.168.124.0/24`):

```bash
sudo iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
```

### 4.4 Internet Access: Reverse-Bridging Through the Computer via WiFi

Add a "fallback default route" on the Jetson, pointing at the computer's IP on the `go2` network (the gateway), with a higher metric (e.g. 500) so it doesn't compete with existing routes and only kicks in as a fallback when needed:

```bash
sudo ip route replace default via 192.168.124.223 dev wlan0 metric 500
```

(The `192.168.124.223` in this command is the static IP the external computer gets after connecting to `go2` — see Section 5.)

### 4.5 Wiring Everything into Boot-Time Automatic Execution

Consolidate all of the above key steps (except "creating the hotspot" itself) into `/home/unitree/network_fix.sh`:

```bash
#!/bin/bash

# eth0: static IP, dedicated to the robot network
sudo nmcli connection modify "Wired connection 1" ipv4.method manual ipv4.addresses 192.168.123.18/24 ipv4.gateway 192.168.123.1
sudo nmcli connection up "Wired connection 1"

# wlan0: go2 hotspot, separate subnet
sudo nmcli connection modify Hotspot ipv4.addresses 192.168.124.1/24
nmcli connection up Hotspot

# Fallback internet route: reverse-bridge through the computer via WiFi
sudo ip route replace default via 192.168.124.223 dev wlan0 metric 500

# Forwarding rules
sudo iptables -C FORWARD -i eth0 -o wlan0 -j ACCEPT 2>/dev/null || sudo iptables -I FORWARD -i eth0 -o wlan0 -j ACCEPT
sudo iptables -C FORWARD -i wlan0 -o eth0 -j ACCEPT 2>/dev/null || sudo iptables -I FORWARD -i wlan0 -o eth0 -j ACCEPT

# NAT
sudo iptables -t nat -C POSTROUTING -o eth0 -j MASQUERADE 2>/dev/null || sudo iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE

# DNS fix: manual (static) network connections don't get automatic DNS, so it must be set explicitly
sudo nmcli connection modify "Wired connection 1" ipv4.dns "8.8.8.8 1.1.1.1" ipv4.ignore-auto-dns yes
sudo nmcli connection modify Hotspot ipv4.dns "8.8.8.8 1.1.1.1" ipv4.ignore-auto-dns yes
sudo resolvectl dns eth0 8.8.8.8 1.1.1.1
```

> Pitfall note: both `eth0` and `Hotspot` use `ipv4.method=manual` (static). In static mode, NetworkManager does not automatically populate DNS servers — `/etc/resolv.conf` may end up empty or pointing at an unreachable address, causing all domain name resolution to fail (you can `ping 8.8.8.8` but not `ping www.baidu.com`). DNS servers must be explicitly specified and automatic DNS override must be disabled (`ipv4.ignore-auto-dns yes`).

Then create a systemd service to run this script automatically at boot:

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

**Summary of self-healing boot-time network behavior**:

- The `go2` hotspot: `autoconnect=yes` + highest priority → guaranteed to broadcast automatically at boot, ready for WiFi connection to `192.168.124.1` (SSH / NoMachine) at any time
- Static `eth0` + forwarding + NAT + internet route: handled automatically at boot by `network-fix.service`, with nothing needing to be run manually

---

## 5. External Computer Configuration (Using Ubuntu as an Example)

The computer itself has real internet access over Ethernet (`enp4s0`), while WiFi (`wlo1`) connects to `go2`.

### 5.1 WiFi Adapter: Static IP + Gateway on the New Subnet

```bash
sudo nmcli connection modify go2 ipv4.method manual ipv4.addresses 192.168.124.223/24 ipv4.gateway 192.168.124.1
sudo nmcli connection up go2
```

### 5.2 Sharing Its Own Network with the Jetson

```bash
sudo sysctl -w net.ipv4.ip_forward=1
sudo iptables -t nat -A POSTROUTING -o enp4s0 -j MASQUERADE
sudo iptables -I FORWARD -i wlo1 -o enp4s0 -j ACCEPT
sudo iptables -I FORWARD -i enp4s0 -o wlo1 -m state --state ESTABLISHED,RELATED -j ACCEPT
```

### 5.3 Static Route to the Robot's Subnet (via the WiFi Gateway)

Without this route, the system would send traffic for `192.168.123.0/24` out through the default route (the real internet-facing port), and it would never reach the Jetson:

```bash
sudo ip route replace 192.168.123.0/24 via 192.168.124.1 dev wlo1
```

### 5.4 Saving as a Script + Automatic Boot-Time Execution (Optional)

Save as `~/go2_network_fix.sh` (containing all the commands from 5.1–5.3 above), then:

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

## 6. Final Verification Results

| Test item                                                       | Result                     |
| ----------------------------------------------------------------- | --------------------------- |
| Computer's WiFi connects to `go2`                                | ✅                          |
| NoMachine accesses the Jetson over WiFi (connecting to `192.168.124.1`) | ✅                    |
| Jetson has internet access (via WiFi bridge through the computer) | ✅ `ping 8.8.8.8` succeeds |
| Jetson connects to the robot at `192.168.123.161`                | ✅                          |
| Computer (WiFi only, no Ethernet cable) connects to the robot at `192.168.123.161` | ✅          |

**Going forward, SSH / NoMachine should uniformly connect to `192.168.124.1`**, no longer the old `192.168.123.19`.

---

## 7. Known Remaining Issue: DDS / SDK Scripts Don't Work Over the WiFi Bridge

Using `unitree_sdk2py`'s `VideoClient` (`ChannelFactoryInitialize`) or ROS2 DDS topics across this WiFi bridge link still fails to connect, with errors like `send request error` / `VideoClient error code: 3102`.

### 7.1 Troubleshooting Process

1. First suspected iptables was blocking UDP ports — **ruled out**: the `FORWARD` chain has no port restrictions at all, allows all protocols, and both `ping` (ICMP) and SSH port probing (TCP) work fine.
2. The real cause is that **DDS relies on Multicast for participant discovery**, while plain `ip_forward=1` + iptables forwarding **only handles unicast traffic**. Forwarding multicast across routers requires separate "multicast routing" capability (things like IGMP/PIM) — this is a limitation baked into the design of the IP protocol itself, not something that can be casually worked around.
3. Tried using `smcroute` (a userspace multicast routing daemon) to forward the multicast group `239.255.0.1`, which DDS uses by default, between `wlan0`/`eth0`, and got an immediate error:

   ```
   Failed initializing IPv4 multicast routing API: Protocol not available
   Kernel does not support multicast routing.
   ```

   This Jetson's kernel (`5.10.104-tegra`) **was not compiled with `CONFIG_IP_MROUTE`** (multicast routing support) enabled. This is a kernel-level capability gap that no userspace tool can work around — the only fix is recompiling the kernel, which carries too much risk for a robot's onboard computer that's in active service, and is not recommended to attempt lightly.
4. Additionally, it turns out that even if multicast could get through, the current NAT (`MASQUERADE`) approach is itself fundamentally incompatible with DDS: during the discovery phase, the DDS protocol **embeds the participant's own real address inside the payload**, for use in subsequent unicast data exchange. NAT only rewrites the source address in the packet header, not the payload contents — so even if the robot side receives the discovery packet, when it later tries to connect directly back to "the address recorded in the payload," that connection will fail because the actual address has been rewritten.

### 7.2 Conclusion

**The current WiFi bridge design fundamentally does not support DDS / SDK-related scripts (`VideoClient`, `SportClient`, ROS2 topic subscription across subnets, etc.)** — this is a dual limitation of kernel capability and NAT architecture, and is not something that can be fixed through configuration.

**Scripts that require DDS communication can, for now, only run correctly with the Ethernet cable plugged in (`eth0` directly connected to the robot network)**. The WiFi bridge is currently only suitable for: NoMachine remote desktop, SSH, internet access, `ping`, and other scenarios that don't rely on the DDS discovery protocol.

If this needs to be fully resolved in the future, possible directions (all carry significant cost, none implemented):

- Recompile the Jetson kernel with `CONFIG_IP_MROUTE` enabled, paired with a real multicast routing daemon
- Reconfigure DDS (CycloneDDS) into pure unicast Peer mode (skipping multicast discovery), which would require changing the DDS configuration on both the robot itself and the client side — and the robot controller (`192.168.123.161`) currently cannot be logged into via SSH (connection refused on the port), making this change impossible to carry out

---

## 8. Troubleshooting: After Reboot, the go2 Hotspot Connects but Cannot Reach the WAN

### 8.1 Symptom

After rebooting the Jetson, phones/computers can connect to the `go2` hotspot normally and SSH / NoMachine into the Jetson just fine, but the Jetson itself has no internet access (`ping 8.8.8.8` fails, or succeeds but web pages won't load). It has to be fixed by manually re-running `~/network_fix.sh`.

**Root cause** (see 8.2 for the troubleshooting process): a systemd timing race at boot — `network-fix.service` runs faster than the USB WiFi adapter driver loads. Fixed in 8.3 (`network_fix.sh` now has polling retries + systemd now has a device dependency added), with verification results in 8.4. If this recurs even after applying the 8.3 configuration, it means this isn't the cause and further troubleshooting is needed.

### 8.2 Troubleshooting

`journalctl -u network-fix.service -b` showed the service finished running very early after boot, but two errors were logged in the middle:

```
Error: Connection activation failed: No suitable device found for this connection ...
Cannot find device "wlan0"
```

Also checking `journalctl -b | grep wlan0`: there's a delay of over ten seconds between the USB WiFi adapter driver `88x2bu` (compiled via DKMS) registering with the kernel and `wlan0` actually becoming usable (AP up, IP obtained). Meanwhile `network-fix.service`'s start condition is only `After=NetworkManager.service network-online.target` — this only guarantees NetworkManager itself has started, not that this DKMS-installed USB adapter has finished enumerating and that the `wlan0` device already exists.

In other words, the script runs faster than the adapter driver: by the time it reaches the steps depending on `wlan0` (`nmcli connection up Hotspot`, `ip route ... dev wlan0`), the device doesn't exist yet, and it errors out immediately.

**So why did the hotspot appear to "come up automatically at boot" anyway?** Because the `Hotspot` connection itself was set to `autoconnect=yes` with the highest priority (see Section 4.2), NetworkManager independently brings the hotspot up on its own once the `wlan0` device is actually ready — this is an entirely separate path from `network-fix.service`, with one succeeding and the other failing, which is why the symptom manifests as "hotspot works, internet doesn't."

### 8.3 Fix

Two changes:

**(1) Add polling retries in `~/network_fix.sh` for the steps that depend on `wlan0`** (no longer failing outright after a single attempt):

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

# ...DNS configuration...

echo "Setting default route via wlan0..."
for i in $(seq 1 30); do
    sudo ip route replace default via 192.168.124.223 dev wlan0 metric 500 && break
    sleep 2
done
```

**(2) Add a device dependency to the systemd service, as a second layer of insurance**:

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

`sys-subsystem-net-devices-wlan0.device` is a unit systemd automatically generates for each udev network device. Adding `After`/`Requires` on it makes the service wait until this device node actually appears before starting — but since there's still a gap of several seconds between "the device node appears" and "the AP is actually fully activated (wpa_supplicant up, IP obtained)" for a USB adapter, this systemd dependency only narrows the waiting window; the polling retries inside the script are what actually provide the real safety net. Additionally, `TimeoutStartSec` was raised from the default 90s to 300s, to prevent the retry loop from running longer than the default timeout and getting forcibly killed by systemd.

### 8.4 Verification

After making these changes and rebooting, `journalctl -u network-fix.service -b` shows the script's own waiting log output:

```
Waiting for wlan0...
Bringing up Hotspot...
Connection successfully activated ...
Setting default route via wlan0...
```

The entire process finishes automatically about 20 seconds after boot; `ip route` shows `default via 192.168.124.223 dev wlan0 metric 500` already set, and this happens earlier than the point at which a person would reconnect to WiFi and open NoMachine — confirming this now genuinely takes effect automatically, with no more need to manually run the script.

**A small remaining loose end**: the point at which the `go2` hotspot starts broadcasting is earlier than the point at which the script's DNS configuration step (`resolvectl dns eth0 ...`) finishes executing. If a browser is opened immediately within a minute or two of boot, there's occasionally a brief window where you can `ping` an IP but domain names won't resolve. This self-heals once the script's remaining steps finish (usually within tens of seconds) — it's not a new issue, just an aftereffect of the same timing race, and is judged not to need any additional handling at this time.

---

## 9. Current Network Architecture and Data Flow, In Detail

Combining the design from Sections 3 and 4, this section translates the routing + forwarding + NAT configuration actually in effect on the Jetson into three concrete data flows, for easy reference during future troubleshooting.

### 9.1 Topology

```
                 Robot's own network                    go2 WiFi subnet
              192.168.123.0/24                        192.168.124.0/24

  Robot controller ──┐                                ┌──── External computer (WiFi client)
  192.168.123.161    │                                │    192.168.124.223
  (same subnet, on switch) │                          │    (the real WAN egress)
                      │                                │
                   eth0 (wired)                   wlan0 (USB WiFi, AP mode)
               192.168.123.18/24                  192.168.124.1/24
                      │                                │
                      └──────────── Jetson ────────────┘
                         Kernel routing + iptables forwarding/NAT
```

The two adapters are two physically isolated subnets (wired vs. radio waves); the Jetson connects them via **routing + NAT**, not a Layer-2 bridge (the bridge approach was already tried and abandoned as documented in Section 3.2).

### 9.2 Data Flow 1: External Computer → SSH / NoMachine to the Jetson (192.168.124.1)

Same subnet (both on `124.0/24`), directly reachable, no forwarding needed — this corresponds to "Goal 1" at the top of the document.

### 9.3 Data Flow 2: External Computer → Accessing the Robot Controller (192.168.123.161)

```
Computer sends a packet, dst=192.168.123.161, gateway points at 124.1 (Jetson)
  → arrives at Jetson's wlan0
  → matches route 192.168.123.0/24 dev eth0 (Jetson is also on this subnet itself)
  → iptables FORWARD chain: wlan0→eth0 has an explicit ACCEPT
    (on the Unitree customized system, the FORWARD chain's policy is DROP; it only survives thanks to the two ACCEPT rules added in Section 4.3)
  → iptables NAT POSTROUTING: -o eth0 MASQUERADE, rewrites the source address from 192.168.124.223 to the Jetson's own 192.168.123.18
    (this rewrite is mandatory — the robot controller has no idea what the unfamiliar 124.0/24 subnet is, and only recognizes packets coming from the Jetson itself)
  → the robot sends its reply back to 192.168.123.18; the Jetson automatically rewrites the address back using its conntrack records, and forwards it back out wlan0 to the computer
```

### 9.4 Data Flow 3: The Jetson's Own Internet Access (Corresponding to the Fallback Default Route in Section 4.4)

```
Jetson checks its routing table, which has two default routes:
  default via 192.168.124.223 dev wlan0 metric 500    ← higher priority (lower metric wins)
  default via 192.168.123.1  dev eth0  metric 20100    ← essentially vestigial, 192.168.123.1 doesn't actually respond to ARP

  → traffic goes out via wlan0, next hop is 192.168.124.223 (the external computer)
  → the Jetson does no NAT on this hop (the POSTROUTING MASQUERADE rule only applies to -o eth0; packets going out wlan0 have their headers left untouched)
  → once the packet reaches the computer, the computer does its own ip_forward + MASQUERADE (-o the computer's real network port, see Section 5.2), rewriting it to the computer's public address before sending it out
  → the reply comes back through the computer's NAT rewrite, gets forwarded back out over wlan0, and returns to the Jetson
```

**Key point: the NAT that actually connects to the public internet happens on the external computer, not on the Jetson.** For this wlan0 link, the Jetson simply forwards packets without touching the headers; the Jetson's own MASQUERADE rule is only used in Data Flow 2 (traffic forwarded to the robot).

### 9.5 Useful Commands for Troubleshooting

```bash
# See who's connected on each adapter
ip neigh show dev wlan0
ip neigh show dev eth0

# See which route is currently the active default (lower metric wins)
ip route

# Check whether the forwarding rules are still in place (reboots/system updates sometimes reset iptables rules)
sudo iptables -L FORWARD -n -v
sudo iptables -t nat -L POSTROUTING -n -v
```

---

*Document generated: 2026-07-07; sections 8–9 added 2026-07-09 (boot-time race condition fix + network architecture deep dive)*

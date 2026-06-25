# Unitree Go2 Expansion Dock Upgrade: Orin Nano 8G → Orin NX 16G

## Two Expansion Dock Variants

The Unitree Go2 Expansion Dock comes in two configurations, each equipped with a different NVIDIA Jetson Orin module:

|              | **Jetson Orin Nano 8GB**  | **Jetson Orin NX 16GB** |
| ------------ | ------------------------- | ----------------------- |
| AI Compute   | 40 TOPS                   | 100 TOPS                |
| Memory       | 8 GB                      | 16 GB                   |
| CPU          | 6-core Arm Cortex-A78AE   | 8-core Arm Cortex-A78AE |
| Max TDP      | 15W                       | 25W                     |

Two Expansion Dock variants

The NX 16G delivers **2.5×** more AI inference performance than the Nano 8G, making it better suited for running more complex perception or control models on the robot. This guide documents the complete procedure for replacing the Nano 8G module with the NX 16G.

Since a significant amount of development work had already been done on the Nano 8G (environment setup, dependencies, custom code, etc.), reinstalling everything from scratch on the NX 16G was not desirable. The core approach of this guide is therefore: **keep the original Nano 8G SSD and OS intact, and only downgrade the NX 16G's QSPI firmware and update a few config files so that the existing system can drive the NX 16G hardware correctly**.

---

## Why You Cannot Simply Swap the Module

A brand-new Jetson Orin NX 16G module ships with **JetPack 6.2** (NVIDIA Jetson Linux 36.4.3), while the Unitree factory Expansion Dock runs **JetPack 5.1.1** (NVIDIA Jetson Linux 35.3.1).

|                        | JetPack Version | Jetson Linux Version |
| ---------------------- | --------------- | -------------------- |
| Unitree factory SSD    | JetPack 5.1.1   | 35.3.1               |
| New NX 16G module      | JetPack 6.2     | 36.4.3               |

Upgrading from JetPack 5.x to JetPack 6.x is a major version jump, with low-level changes spanning the kernel, driver stack, and BSP structure. More critically, **the Jetson module contains a dedicated QSPI-NOR Flash**, which stores QSPI firmware (also known as Bootloader / MB2 / CBoot components) that must match the version of Jetson Linux being run.

NVIDIA's official documentation explicitly states that the QSPI firmware for Jetson Linux 35.x (JetPack 5.x) and Jetson Linux 36.x (JetPack 6.x) are incompatible with each other. If the QSPI firmware version does not match the OS version on the SSD, the Jetson will fail to boot — the boot chain cannot complete its handshake, resulting in a **boot loop** with no way to enter the system.

> Reference: [Flashing Support — NVIDIA Jetson Linux 36.4.4 Developer Guide](https://docs.nvidia.com/jetson/archives/r36.4.4/DeveloperGuide/SD/FlashingSupport.html) (section: Updating Jetson Orin Nano Devkit from JetPack 5 to JetPack 6)
>
> Official quote: "The halt is because of a mismatch between the bootloader in the QSPI and the file system in the SD card. The bootloader version is JetPack 6, and the file system is JetPack 5. JetPack 6 bootloader does not support the JetPack 5 file system."

### Why Downgrade Instead of Upgrade?

Since version incompatibility is the core problem, a natural question is: why not go the other direction — upgrade the SSD's OS to JetPack 6.x so it matches the NX 16G module's factory QSPI firmware?

In theory, the NX 16G paired with JetPack 6.2 can unlock **MAXN SUPER mode** with up to **157 TOPS** of AI compute; even the Nano 8G reaches **67 TOPS** after upgrading to JetPack 6.2. However, this is not viable on the Go2: **the Go2's thermal design and power delivery are built around the power envelope of JetPack 5.1.1**. Running at higher performance modes causes severe overheating and current overload, with real risk of hardware damage.

Furthermore, Unitree only provides factory system images for the Go2 based on **JetPack 5.1.1** — there is no official JetPack 6.x image for this platform.

The correct approach is therefore to **downgrade** the NX 16G module's QSPI firmware to match JetPack 5.1.1, rather than upgrading the OS.

---

## Solution

### Step 1: Downgrade the QSPI Firmware on the NX 16G Module

Before inserting the NX 16G module into the Unitree Expansion Dock, you must first downgrade its QSPI firmware.

#### Required Hardware

- A **Jetson Carrier Board** (to put the NX 16G into Force Recovery flashing mode)
- A USB Type-C or Micro-USB cable (depending on the carrier board model)
- A Linux host machine running Ubuntu

#### Steps to Flash the QSPI Firmware

1. Install the NX 16G module onto the Jetson Carrier Board (**do not insert the Unitree SSD at this point**)
2. Follow the carrier board instructions to enter **Force Recovery Mode** (typically by holding the Recovery button while powering on)
3. Download the **[NVIDIA Jetson Linux 35.3.1 Driver Package (BSP)](https://developer.nvidia.com/embedded/jetson-linux-r3531)** on the Linux host
4. Flash only the QSPI — do not flash the rootfs, so there is no need to download the Sample Root Filesystem

For the exact QSPI-only flash command, refer to the following guide (it uses a JetPack 6 downgrade as the example, but the approach is identical — just substitute the corresponding BSP version):

> Reference: [GR00T JetPack Flashing Guide](https://nvlabs.github.io/GR00T-WholeBodyControl/references/jetpack6.html)

Consult your carrier board's documentation to confirm the exact method for entering Recovery Mode and the correct cable connections.

---

### Step 2: Set Up the NX 16G Linux Environment

Once the QSPI firmware downgrade is complete, choose one of the following two options depending on whether you need to preserve your existing development environment:

#### Option A: Keep the Existing System, Update Config Files

Insert the NX 16G module into the Unitree Expansion Dock and boot from the original SSD. The system will come up, but the kernel will still be loading Nano 8G hardware descriptors and power management will be constrained to the Nano 8G profile. Three files need to be replaced so the system correctly identifies the NX 16G hardware.

**Source of replacement files**: Mount the NX 16G's Unitree factory image SSD on the current system (e.g. at `/media/unitree/7073f027-1f76-471e-8386-b7ac9f58e0e6/`) and copy the files directly from it.

##### 1. Replace the Power Management Config `nvpmodel.conf`

| Field          | Detail                                                                  |
| -------------- | ----------------------------------------------------------------------- |
| **Source** | `/media/unitree/7073f027-.../etc/nvpmodel.conf` (NX 16G factory SSD)   |
| **Target** | `/etc/nvpmodel.conf` (current running system)                           |
| **Backup** | Back up the original as `/etc/nvpmodel.conf.nano8g.bak`                 |
| **Before** | Only two power modes: 15W / 7W                                          |
| **After**  | Four power modes available: MAXN / 10W / 15W / 25W                      |

```bash
sudo cp /etc/nvpmodel.conf /etc/nvpmodel.conf.nano8g.bak
sudo cp /media/unitree/7073f027-.../etc/nvpmodel.conf /etc/nvpmodel.conf
```

##### 2. Replace the Device Tree Blob (DTB)

The kernel uses the DTB (Device Tree Blob) to identify hardware. The Nano 8G and NX 16G use different DTB files; copy the correct file from the NX 16G factory SSD to overwrite the one in the current system.

| Field      | Detail                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| **Source** | `/media/unitree/7073f027-.../boot/dtb/kernel_tegra234-p3767-0000-p3768-0000-a0.dtb` (NX 16G factory SSD)       |
| **Target** | `/boot/dtb/kernel_tegra234-p3767-0000-p3768-0000-a0.dtb` (current system)                                      |

```bash
sudo cp /media/unitree/7073f027-.../boot/dtb/kernel_tegra234-p3767-0000-p3768-0000-a0.dtb \
    /boot/dtb/kernel_tegra234-p3767-0000-p3768-0000-a0.dtb
```

##### 3. Update the Boot Config `extlinux.conf`

The `FDT` line in `/boot/extlinux/extlinux.conf` tells the kernel which DTB to load at boot. The Nano 8G and NX 16G DTB filenames differ by only one number segment:

| Field          | Detail                                                                              |
| -------------- | ----------------------------------------------------------------------------------- |
| **File**   | `/boot/extlinux/extlinux.conf`                                                      |
| **Backup** | Back up as `/boot/extlinux/extlinux.conf.nano8g.bak`                                |
| **Before** | `FDT /boot/dtb/kernel_tegra234-p3767-0003-p3768-0000-a0.dtb` (Nano 8G)         |
| **After**  | `FDT /boot/dtb/kernel_tegra234-p3767-0000-p3768-0000-a0.dtb` (NX 16G)          |

```bash
sudo cp /boot/extlinux/extlinux.conf /boot/extlinux/extlinux.conf.nano8g.bak
sudo sed -i 's/p3767-0003-p3768/p3767-0000-p3768/g' /boot/extlinux/extlinux.conf
```

After editing, verify that the `FDT` line in the file points to the `p3767-0000` DTB.

After completing all three steps, reboot:

```bash
sudo reboot
```

After rebooting, the kernel will load the NX 16G hardware descriptors. The system platform will correctly identify as **Orin NX**, power management will unlock the 25W and MaxN modes, and any EMC (memory controller) related errors will be gone.

Verify with the following commands:

```bash
# Check module model
cat /proc/device-tree/model

# Check available power modes
sudo nvpmodel -q
```

---

#### Option B: Clean Install with the Unitree Official NX Image

If there is no need to preserve an existing development environment and you just want a clean factory system, you can **use an M.2 reader to write the Unitree official NX 16G image directly to the M.2 SSD**, skipping the config file edits above.

##### Required Materials

- An **M.2 NVMe reader** (USB to M.2 adapter)
- A Linux machine
- The Unitree official NX 16G system image: `go2_nx_Jetpack5.1.1_20250930.img.bz2`, download link available from the [Unitree Module Upgrade Documentation](https://support.unitree.com/home/en/developer/module_update) (Google Drive)

##### Steps

1. Extract the image:

```bash
bzip2 -d go2_nx_Jetpack5.1.1_20250930.img.bz2
```

2. Connect the SSD via the M.2 reader and confirm the device path:

```bash
lsblk
```

3. Write the image (replace `/dev/nvmeXn1` with the actual path — **verify the device path before running**):

```bash
sudo dd if=go2_nx_Jetpack5.1.1_20250930.img \
    of=/dev/nvmeXn1 \
    bs=64M \
    status=progress \
    oflag=direct
```

4. Once the write is complete, install the SSD back into the Expansion Dock and insert the NX 16G module (with QSPI firmware already downgraded) — it will boot directly

---

## References

- [Unitree Module Upgrade Official Documentation](https://support.unitree.com/home/en/developer/module_update)
- [NVIDIA JetPack Archive](https://developer.nvidia.com/embedded/jetpack-archive)
- [NVIDIA Jetson Linux 35.3.1 Developer Guide](https://docs.nvidia.com/jetson/archives/r35.3.1/DeveloperGuide/index.html)
- [GR00T JetPack Flashing Reference (QSPI firmware flashing procedure)](https://nvlabs.github.io/GR00T-WholeBodyControl/references/jetpack6.html)

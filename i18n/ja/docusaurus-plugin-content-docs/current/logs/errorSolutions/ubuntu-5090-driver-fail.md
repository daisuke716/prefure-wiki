# Installing NVIDIA RTX 5090 Drivers on Ubuntu 24.04 LTS (April 2025)

## Problem

When I first tried to install the official NVIDIA `.run` driver package (`570.181` / `580.76.05`) on **Ubuntu 24.04.2 LTS**, I ran into serious issues:

- After installation, the system **booted only into a TTY (command line)** — no GUI.  
- `nvidia-smi` reported **“No devices were found”**, meaning the RTX 5090 was not recognized.  
- Removing the driver allowed me to log into the desktop again (falling back to AMD iGPU / software rendering), but **the RTX 5090 was completely unusable**.

This happens because the current official NVIDIA Linux driver builds do **not yet fully support the RTX 5090 PCI ID**. The installer forces Xorg to use the unsupported GPU and crashes GNOME.  

---

## Solution (Working)

Thanks to a [Reddit post](https://www.reddit.com/r/Ubuntu/comments/1imxojb/ubuntu_2404_and_nvidia_rtx_5090/) by *safety_lock_off*, there’s a workaround that actually works on Ubuntu 24.04.

👉 Instead of using the `.run` installer, use Ubuntu’s **graphics-drivers PPA**.

### Steps

1. Add the PPA:
   ```bash
   sudo add-apt-repository ppa:graphics-drivers/ppa
   sudo apt update
   ```

2. Check available drivers:
   ```bash
   ubuntu-drivers devices
   ```
   Look for:
   ```
   nvidia-driver-570-open
   ```
   ⚠️ **Important:** The **open** variant works. The non-open one does **not**.

3. Try installing:
   ```bash
   sudo apt install nvidia-driver-570-open
   ```
   You might see an error about conflicts with existing 550/570 packages.

4. Clean up old drivers:
   ```bash
   sudo apt purge 'nvidia*'
   sudo apt autoremove --purge
   ```

5. Install again:
   ```bash
   sudo apt install nvidia-driver-570-open
   ```

6. Reboot:
   ```bash
   sudo reboot
   ```

That’s it. After reboot, the RTX 5090 should be recognized, and you can run:
```bash
nvidia-smi
```
to confirm.

---

## Notes

- **Ubuntu 24.04 LTS does not ship out-of-the-box drivers for the RTX 5090 (as of April 2025).**  
- Only one of my DisplayPort outputs worked initially — keep that in mind if your monitor stays black.  
- This is basically using an “earlybird” PPA channel where NVIDIA driver support lands first.  

---

## References
- Reddit: [Ubuntu 24.04 and NVIDIA RTX 5090](https://www.reddit.com/r/Ubuntu/comments/1imxojb/ubuntu_2404_and_nvidia_rtx_5090/) by *safety_lock_off*  

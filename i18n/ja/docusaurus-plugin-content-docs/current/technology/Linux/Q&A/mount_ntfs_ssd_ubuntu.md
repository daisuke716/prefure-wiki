# Fix: Unable to Mount NTFS M.2 SSDs on Ubuntu

If you're using Ubuntu and your additional M.2 SSDs (formatted as NTFS) cannot be mounted via the GUI file manager, this guide walks you through temporary and permanent solutions to make them accessible.

---

## 🧯 Problem Summary

When clicking the drive in the file manager, you may see an error like:

```
Unable to access location
Error mounting /dev/nvme2n1p1 at /media/...
wrong fs type, bad option, bad superblock, or other error
```

This is usually caused by:

- NTFS partitions not properly shut down from Windows  
- Missing or incomplete NTFS driver support  
- Ubuntu refusing to auto-mount due to **Windows Fast Startup / Hibernate** leaving the drive in a "dirty" state

> 💡 **Why Fast Startup causes this**  
> **Windows Fast Startup** and **Hibernate** save system state to disk without fully unmounting the filesystem.  
> This leaves the NTFS partition with a hibernation flag. Linux detects this and blocks mounting to prevent corruption.

---

## ✅ Step 1: Ensure NTFS Support Is Installed

Ubuntu uses `ntfs-3g` to mount NTFS partitions. Install (or confirm) it:

```bash
sudo apt update
sudo apt install ntfs-3g
```

---

## ✅ Step 2: Check and Fix the NTFS Partition

Use `ntfsfix` to repair the partition and clear Windows dirty/hibernation flags:

```bash
sudo ntfsfix /dev/nvme2n1p1
```

Expected output (if successful):

```
NTFS partition /dev/nvme2n1p1 was processed successfully.
```

---

## 🔧 Temporary Fix — Method 1: Mount to `/media/username/WorkSpace`

The Ubuntu file manager only displays drives mounted under `/media/username`.

### 1. Create a visible mount point:

```bash
sudo mkdir -p /media/$(whoami)/WorkSpace
```

### 2. Mount the drive manually:

```bash
sudo mount -t ntfs-3g /dev/nvme2n1p1 /media/$(whoami)/WorkSpace
```

Now you can access the drive in the file manager under **Other Locations** or `/media/yourname/WorkSpace`.

Optional: Add a desktop shortcut:

```bash
ln -s /media/$(whoami)/WorkSpace ~/Desktop/
```

---

## 🔁 Permanent Fix 1 — Auto-Mount on Boot (`/etc/fstab`)

### 1. Get the UUID of the partition:

```bash
sudo blkid /dev/nvme2n1p1
```

Example output:

```
/dev/nvme2n1p1: UUID="0F280D1E7801D770" TYPE="ntfs"
```

### 2. Edit the fstab file:

```bash
sudo nano /etc/fstab
```

Add the following line at the bottom (replace `yourname`):

```
UUID=0F280D1E7801D770 /media/yourname/WorkSpace ntfs-3g defaults 0 0
```

### 3. Create the mount point and apply:

```bash
sudo mkdir -p /media/yourname/WorkSpace
sudo mount -a
```

If there's no error, it means auto-mounting is now working.

---

## 🛠 Permanent Fix 2 — Disable Windows Fast Startup & Hibernate

If you want a permanent solution and avoid running `ntfsfix` repeatedly, disable Windows Fast Startup and Hibernate so that NTFS volumes are fully unmounted when shutting down.

### 1. Disable Fast Startup in Windows  
- Open **Control Panel → Power Options → Choose what the power buttons do**  
- Click **Change settings that are currently unavailable**  
- Uncheck **Turn on fast startup (recommended)**  
- Save changes

### 2. Disable Hibernate (Optional)  
Open **Command Prompt (Admin)** and run:

```cmd
powercfg /h off
```

### 3. Fully Shut Down Windows After Changes  
Run in Command Prompt:

```cmd
shutdown /s /f /t 0
```

Once Fast Startup is disabled, Windows will fully unmount NTFS volumes on shutdown, and Ubuntu can mount them without errors.

---

## 🧩 Notes

- If the partition is still not mountable, try fully shutting down Windows using:
  ```cmd
  shutdown /s /f /t 0
  ```
- **Disable Windows Fast Startup** if dual-booting is frequent.
- Do **not** run `fsck` on NTFS drives — use `ntfsfix` instead.

---

## ✅ Conclusion

You can use these methods to:  
- Quickly mount NTFS partitions from additional SSDs;  
- Make the drives visible in GUI;  
- Permanently prevent mount errors by disabling Windows Fast Startup / Hibernate;  
- Set up auto-mount at boot for long-term stability across reboots.
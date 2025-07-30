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
- Ubuntu refusing to auto-mount due to hibernation or "dirty" state


## ✅ Step 1: Ensure NTFS Support Is Installed

Ubuntu uses `ntfs-3g` to mount NTFS partitions. Install (or confirm) it:

```bash
sudo apt update
sudo apt install ntfs-3g
```

---

## ✅ Step 2: Check and Fix the NTFS Partition

Use `ntfsfix` to repair the partition and clear Windows dirty flags:

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

## 🔁 Permanent Fix — Auto-Mount on Boot (`/etc/fstab`)

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

## 🧩 Notes

- If the partition is still not mountable, try fully shutting down Windows:
  ```cmd
  shutdown /s /f /t 0
  ```
- Disable Windows Fast Startup (optional but recommended).
- Do **not** run `fsck` on NTFS drives — use `ntfsfix` instead.

---

## ✅ Conclusion

You can use these methods to:
- Quickly mount NTFS partitions from additional SSDs;
- Make the drives visible in GUI;
- Set up permanent auto-mount at boot.

This approach ensures both temporary access and long-term stability across reboots.


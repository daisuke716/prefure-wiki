# Fixing Fractal Adjust Pro Hub LED Control on Ubuntu via WebHID

Recently, I encountered an issue where my **Fractal Adjust Pro Hub** could not be controlled through the official web interface ([adjust.fractal-design.com](https://adjust.fractal-design.com)) on **Ubuntu**.  
Although the device appeared in the connection popup, clicking **Connect** failed to establish a working link.

After some debugging, I found that the root cause was **insufficient permissions to access the USB HID device** from the browser.  
Here's the full breakdown of the problem and solution.

---

## Problem Symptoms

- Device shows up as *"Paired"* in the WebHID connection dialog but cannot actually connect.
- Occurs in Ubuntu (and other Linux distros) due to restrictive default permissions on `/dev/hidraw*` devices.
- WebHID API in Chrome/Chromium requires the browser to have permission to read/write HID devices.

---

## Step 1 – Identify the Device

First, connect your Fractal Adjust Pro Hub and run:

```bash
lsusb
```

You should see an entry like:

```
Bus 003 Device 004: ID 36bc:1001 Fractal Adjust Pro Hub
```

Here:
- **Vendor ID (VID)** = `36bc`
- **Product ID (PID)** = `1001`

---

## Step 2 – Create a udev Rule for Permissions

By default, only `root` can access `/dev/hidraw*`.  
We need to grant access to users in the `plugdev` group.

Run:

```bash
# 1) Create the udev rule
echo 'SUBSYSTEM=="hidraw", ATTRS{idVendor}=="36bc", ATTRS{idProduct}=="1001", GROUP="plugdev", MODE="0660"' | sudo tee /etc/udev/rules.d/99-fractal-adjust-pro.rules

# 2) Add your user to plugdev group
sudo usermod -aG plugdev "$USER"

# 3) Reload rules and re-trigger udev
sudo udevadm control --reload-rules
sudo udevadm trigger
```

---

## Step 3 – Reconnect the Device

1. **Log out and log back in** (or reboot) to apply the group change.  
2. Unplug and re-plug the Fractal Adjust Pro Hub.  
3. Verify that your user has permission:

```bash
ls -l /dev/hidraw* | grep plugdev
```

Expected output:

```
crw-rw---- 1 root plugdev 239, 0 Aug  9 00:00 /dev/hidraw0
```

---

## Step 4 – Browser Requirements

- Use **Google Chrome** or **Chromium** (Firefox does not yet support WebHID).
- If using **Chromium Snap** version, connect these permissions:

```bash
sudo snap connect chromium:raw-usb
sudo snap connect chromium:hardware-observe
```

- **Enable WebHID support in Chrome** (if not already enabled):
  1. Open Chrome and go to:  
     `chrome://flags/#enable-experimental-web-platform-features`
  2. Set **Experimental Web Platform features** to **Enabled**
  3. Restart the browser

---

## Step 5 – Connect via Fractal's Web Interface

1. Go to [adjust.fractal-design.com](https://adjust.fractal-design.com)  
2. Click **Add Fractal USB Device**
3. Select **Fractal Adjust Pro Hub – Paired**
4. Click **Connect**

If all steps were done correctly, the LED and fan controls should now work in Ubuntu directly from the browser.

---

## Final Notes

- If the device still won't connect, check for other software that might be locking the HID device (e.g., OpenRGB).
- You can debug WebHID in Chrome's DevTools console with:
```js
await navigator.hid.getDevices()
```
- Permissions must be set **every time** you add a new HID device, so repeat the udev rule creation for other devices.

---

✅ **With these steps, the Fractal Adjust Pro Hub can now be controlled directly from Ubuntu's Chrome browser without root access.**
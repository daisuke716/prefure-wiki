# Connecting Kobuki Robot via USB on Ubuntu

When connecting the **Kobuki base** to Ubuntu through USB (e.g., `/dev/ttyUSB0`), you may encounter a **permission error** when launching the ROS/robot control node.

## Temporary Fix (Every Time)
You can temporarily give all users read & write permissions to the USB device with:

```bash
sudo chmod 666 /dev/ttyUSB0
```

- `666` means **read & write for everyone**.
- However, this setting only lasts until the device is disconnected.
- **Reason**: `/dev/ttyUSB0` is a dynamically created device file managed by `udev`.  
  When you unplug and replug the robot, the old file is destroyed and a new one is created, which resets its permissions.

⚠️ This means you have to run `chmod 666` **every time you reconnect the robot**, which is very inconvenient.

---

## Permanent Fix (Recommended)
A better solution is to add your user to the **dialout group**, which already has access to serial devices by default.

Run this command once:

```bash
sudo usermod -aG dialout $USER
```

Then **log out and log back in** (or reboot).  
After that, you can access `/dev/ttyUSB0` without running `chmod` again.

---

✅ **Summary**:  
- `chmod 666` works but is temporary and insecure.  
- Adding your user to the `dialout` group is the **permanent and secure solution**.

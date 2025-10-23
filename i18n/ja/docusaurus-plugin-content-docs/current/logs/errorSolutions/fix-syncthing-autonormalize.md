# Fixing "Error renaming ... while normalizing UTF8 encoding" in Syncthing on macOS

# Problem Description

At first, I noticed that many files on my Mac would **automatically gain a `.temp` suffix** — even after I manually renamed them back to their original names, the `.temp` extension would soon reappear.  
This behavior happened repeatedly and **seriously affected normal use**.

After checking the **Syncthing control panel**, I found multiple error messages such as:

```
Error renaming "... .ipynb.tmp" to "... .ipynb" while normalizing UTF8 encoding: file does not exist. You will want to rename this file back manually.
```

This indicated that **Syncthing attempted to rename temporary `.tmp` files** created during **UTF-8 filename normalization** but failed to do so, leaving the `.tmp` files behind and generating warnings.

The issue mainly occurred in project folders containing files with:
- **Japanese characters (日本語ファイル名)**
- **Spaces**
- **Very long paths**

These conditions often lead to **encoding inconsistencies on macOS file systems**, which caused Syncthing to mis-handle file renaming operations.

---

## 🔍 Root Cause

Syncthing automatically performs **UTF-8 normalization** when syncing files between systems that use different Unicode formats.

- macOS uses **NFD (Normalization Form D)**  
- Windows and Linux use **NFC (Normalization Form C)**  

When Syncthing detects a filename that needs “normalization,” it:
1. Creates a temporary file like `filename.ext.tmp`
2. Tries to rename it back to the normalized version

However, on macOS this often fails because:
- The file is being indexed by Finder or iCloud Drive
- The system’s Unicode normalization conflicts with Syncthing’s
- The filename is too long or contains special characters

Hence the log:
> `Error renaming ... while normalizing UTF8 encoding: file does not exist`

---

## ⚙️ Solution — Disable Auto Normalization

You can stop Syncthing from automatically renaming filenames by disabling the **autoNormalize** option.

### Steps:
1. Open the **Web GUI** → `Actions → Advanced`
2. Go to the **Folders** section
3. Select the folder that triggers the error
4. Scroll down to find:
   ```
   autoNormalize: true
   ```
5. Change it to:
   ```
   autoNormalize: false
   ```
6. Click **Save** and restart Syncthing.

> 📍 The full path in the GUI is:
> `Actions → Advanced → Folders → [Your Folder] → autoNormalize`

After this change, Syncthing will stop renaming files during UTF-8 normalization.  
No more `.tmp` suffixes or rename failures.

---

## ⚠️ Potential Side Effects

Disabling UTF-8 normalization can lead to **hidden filename conflicts** when syncing across different operating systems.

For example:
- A filename that appears identical on macOS and Windows might have **different internal encodings** (NFD vs NFC).  
- Syncthing will treat them as **different files**, resulting in **duplicates** or **sync loops**.

So while this fix prevents Syncthing from renaming your files automatically, it **shifts the burden of filename consistency** onto you.  
If you sync between macOS and Windows/Linux, you’ll need to ensure that filenames are consistent and avoid mixed Unicode characters.

---

## ✅ Summary

- **Issue:** Syncthing fails to rename `.tmp` files due to UTF-8 normalization on macOS.  
- **Fix:** Disable `autoNormalize` in `Advanced → Folders`.  
- **Risk:** May cause invisible filename encoding mismatches across systems.

In my case, since all devices are macOS-based and share the same filesystem encoding, turning off `autoNormalize` completely resolved the problem without side effects.

---

*Posted on: 2025-10-23*  
*Environment: macOS + Syncthing v1.29+*

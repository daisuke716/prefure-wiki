# Syncthing -- Building a Private OneDrive, Centered on NAS via Docker Desktop

If you want a self-hosted, cross-platform synchronization solution like OneDrive, Syncthing is a powerful tool. This guide walks through how I used **Docker Desktop** and a **NAS** as the central hub to keep documents synchronized across Windows, macOS, and other devices.

---

## 📦 What is Syncthing?

[Syncthing](https://syncthing.net/) is an open-source, continuous file synchronization program. It synchronizes files between two or more computers in real time, safely protected from prying eyes.

---

## 🧩 System Structure

- **NAS (QNAP / ZimaBoard / etc.)**: Runs the core Syncthing instance in Docker.
- **Windows PC & MacBook**: Each runs Syncthing and syncs through the NAS.
- **Private network or Internet**: All communication is peer-to-peer via QUIC/TCP/relay.

---

## 🐳 Deploying Syncthing on NAS via Docker Desktop

On your NAS (or PC acting as central node), use Docker Desktop to run the container:

### Docker Image

```
linuxserver/syncthing:latest
```

### Ports Mapping

| Container Port | Host Port | Purpose                       |
|----------------|-----------|-------------------------------|
| 21027/udp      | 21027     | Local discovery broadcast     |
| 22000/tcp      | 22000     | Main sync traffic via TCP     |
| 22000/udp      | 22000     | Sync traffic via QUIC         |
| 8384/tcp       | 8384      | Web GUI                       |

> You can map different ports if you like, but remember to forward or open them in your NAS/router firewall.

### Volume Mounts

| Host Path                          | Container Path |
|-----------------------------------|----------------|
| `E:\Docker\syncthing\config`   | `/config`      |
| `E:\daisuke`                      | `/data`        |

Ensure both paths are granted permission in Docker Desktop → Settings → *Resources* → *File sharing*.

---

## 🛠️ First Launch Issues

### Common Errors & Fixes

#### 1. `permission denied` errors

```log
mkdir /run/s6-rc: permission denied
```

→ Make sure Docker Desktop has access to the folder (Windows: File sharing enabled + Admin privileges).

#### 2. Folder path missing

```log
Error on folder "Windows-Documents": folder path missing
```

→ Check the folder path in Syncthing settings. Ensure the actual path exists and is shared with Docker.

#### 3. `setting permissions: operation not permitted`

→ This usually happens on Windows. Disable these in folder settings:
- "Send Ownership"
- "Sync Ownership"
- "Send Extended Attributes"
- "Sync Extended Attributes"

---

## ⚙️ Autostart Syncthing Container

To make the container auto-start on reboot, use Docker Compose or set the `--restart unless-stopped` option in `docker run`.  
Docker Desktop GUI doesn’t offer this toggle directly.

If you're using CLI:

```bash
docker run -d \
  --name=syncthing \
  --restart unless-stopped \
  -p 8384:8384 -p 22000:22000 -p 22000:22000/udp -p 21027:21027/udp \
  -v E:/Docker/syncthing/config:/config \
  -v E:/daisuke:/data \
  linuxserver/syncthing:latest
```

---

## 🧩 Sharing Strategy (Recommended Setup)

- Let NAS share folders to **Windows** and **Mac**.
- On Syncthing GUI:
  - NAS adds folders.
  - Windows/Mac are just "receive & send" devices.
- Only NAS should be shared with both endpoints; avoid direct sync between Mac and Windows to reduce conflict.

---

## ✅ Tips for Better Stability

- Use NTFS or ext4 for mounted folders, avoid FAT/exFAT.
- Disable permission syncing on non-Linux hosts.
- Use fixed folder paths and avoid renaming folders after setup.
- Always check for `.stfolder` inside shared folders (used by Syncthing to mark valid sync).

---

## 🎉 Result

Now I have a fully private, real-time, cross-device syncing system that works just like OneDrive — but it’s 100% under my control.

Happy syncing!


::: tip
If you file always automatically gain a `.temp` suffix, or there's a ```
Error renaming "... .ipynb.tmp" to "... .ipynb" while normalizing UTF8 encoding: file does not exist. You will want to rename this file back manually.
```
warning on your control panel, please refer to [this blog](logs/errorSolutions/fix-syncthing-autonormalize.md)
:::

> Written by daisuke — powered by NAS + Docker + Syncthing 🚀

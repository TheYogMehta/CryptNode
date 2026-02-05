# Deployment Guide

This document provides comprehensive deployment instructions for all platforms, environment configuration, and CI/CD recommendations.

## Environment Overview

The application supports three deployment environments:

| Environment     | Purpose         | Server URL                  | Client Build     |
| --------------- | --------------- | --------------------------- | ---------------- |
| **Development** | Local testing   | `ws://localhost:9000`       | Development mode |
| **Production**  | Live deployment | `wss://chat.yourserver.com` | Production build |

## Platform-Specific Builds

### 1. Desktop Application (Electron)

#### Production Build

**1. Install Dependencies**:

```bash
cd Client
npm install
cd electron
npm install
cd ..
```

**2. Build Web Assets**:

```bash
npm run build
```

**3. Build Electron App**:

```bash
cd electron
npm run electron:make
```

Output: `Client/electron/dist/chatapp.AppImage`
Output: `Client/electron/dist/chatapp.exe`

### 2. Android Application

#### Prerequisites

- Android Studio installed
- Java JDK 11+
- Android SDK 24+

#### Build Steps

**1. Install Dependencies**:

```bash
cd Client
npm install
```

**2. Build Web Assets**:

```bash
npm run build
```

**3. Open in Android Studio**:

```bash
npx cap open android
```

**4. Build Release APK**:

```bash
cd android
./gradlew assembleRelease
```

Output: `Client/android/app/build/outputs/apk/release/app-release.apk`

## Server Deployment

**1. Install Go**:

```bash
wget https://go.dev/dl/go1.21.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.21.linux-amd64.tar.gz
export PATH=$PATH:/usr/local/go/bin
```

**2. Clone Repository**:

```bash
git clone https://github.com/TheYogMehta/chatapp.git
cd chatapp/Server
```

**3. Build Server**:

```bash
go build -o chatapp-server socket.go
```

**4. Create Systemd Service**:

```ini
# /etc/systemd/system/chatapp.service
[Unit]
Description=ChatApp Relay Server
After=network.target

[Service]
Type=simple
User=chatapp
WorkingDirectory=/home/chatapp/Server
ExecStart=/home/chatapp/Server/chatapp-server
Restart=always
Environment="PORT=9000"
Environment="HMAC_SECRET=your-secret-key"

[Install]
WantedBy=multi-user.target
```

**5. Enable and Start**:

```bash
sudo systemctl enable chatapp
sudo systemctl start chatapp
sudo systemctl status chatapp
```

## SSL/TLS Configuration

**Let's Encrypt** (for `wss://`):

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d chat.yourserver.com
sudo certbot renew --dry-run
```

## Scaling Considerations

### Current Limitations

- **Single server**: All sessions in memory
- **No persistence**: Server restart = all disconnections
- **No load balancing**: Cannot distribute across servers

## Backup & Recovery

### Client Data

- **Automatic**: None (local only)
- **Manual**: Users can export database via settings

### Server Data

- **No persistent data**: Server holds no long-term data
- **Logs**: Rotate and backup connection logs for security audit

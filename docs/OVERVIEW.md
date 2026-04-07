# Application Overview

## What is the Secure Chat Application?

The Secure Chat Application is an **end-to-end encrypted, privacy-first messaging platform** designed for users who require secure, peer-to-peer communication without server-side data persistence. Unlike traditional messaging apps, this application ensures that all messages, files, and calls remain encrypted from sender to recipient, with the server acting solely as a relay that cannot decrypt or store any user data.

## Core Principles

1. **Privacy by Design**: No message content is ever stored on the server
2. **End-to-End Encryption**: All communication uses cryptographic protocols (ECDH + AES-GCM)
3. **Device-Bound Security**: Each device maintains its own cryptographic identity
4. **Cross-Platform**: Runs on Android, and Desktop (Electron)
5. **Offline-First**: Messages and media are stored locally in encrypted SQLite databases

## Target Users

### Primary Users

- **Privacy-Conscious Individuals**: Users who prioritize secure communication over convenience features
- **Security Professionals**: IT security teams requiring verified encryption for sensitive discussions
- **Remote Teams**: Distributed teams needing secure file sharing and voice communication
- **Journalists & Activists**: Users in high-risk environments requiring protection from surveillance

### Secondary Users

- **Developers**: Technical users who want to audit and understand the security implementation
- **Organizations**: Companies requiring on-premise or self-hosted secure communication

## Key Features

### 1. Secure Messaging

- **End-to-end encrypted** text messages using AES-GCM-256
- **Offline message queue**: Unsent messages are stored locally and sent when peer comes online
- **Message status tracking**: Pending, Delivered indicators
- **Reply threading**: Quote and respond to specific messages in conversations

### 2. Encrypted File Sharing

- **Chunked file transfer**: Large files split into 250KB encrypted chunks for efficient transfer
- **Progress tracking**: Real-time upload/download progress indicators
- **Media preview**: Thumbnail generation for images and videos
- **Automatic encryption**: All files encrypted before transmission using session keys

### 3. Voice & Video Calls

- **End-to-end encrypted**: WebRTC with DTLS-SRTP for media streams
- **Encrypted signaling**: SDP + ICE candidates encrypted with session AES-GCM key before relay
- **TURN support**: Ephemeral TURN credentials for NAT traversal
- **Audio & Video modes**: Toggle between audio-only and video calls
- **Call status tracking**: Incoming, Outgoing, Connected, Busy states
- **Call duration logging**: Track call history with timestamps
- **Multi-device awareness**: Accepting/ending a call on one device notifies own linked devices

### 4. Secure Vault

- **Password storage**: Encrypted local vault for storing passwords
- **File storage**: Secure storage for sensitive documents
- **End-to-end encrypted**: Vault data encrypted with user passphrase
- **Local-only storage**: Vault data never leaves the device

### 5. Multi-Account Support

- **Multiple identities**: Switch between different accounts seamlessly
- **Isolated databases**: Each account has a separate encrypted SQLite database
- **Session Lock**: Lock the app and return to the account selector without losing your session token
- **Two-phase switch**: UI unlocks immediately from local DB; server authentication runs in background
- **Profile management**: Custom display names and avatars per account

### 6. Cross-Platform Deployment

- **Android Application**: Native Android app via Capacitor
- **Desktop Application**: Electron-based desktop app for Windows, macOS, Linux

## Technology Stack Overview

### Frontend

- **React 18**: Modern component-based UI framework
- **TypeScript**: Type-safe development
- **Ionic Framework**: Cross-platform UI components
- **Capacitor**: Native bridge for mobile and desktop

### Backend

- **Go (Golang)**: Lightweight, high-performance relay server
- **Gorilla WebSocket**: WebSocket implementation for real-time communication

### Storage

- **SQLite**: Local encrypted database for message history
- **Capacitor Secure Storage**: Native keychain/keystore for cryptographic keys
- **Filesystem API**: Encrypted file storage for media

### Cryptography

- **Web Crypto API**: Browser-native cryptographic primitives
- *z**: Elliptic curve key exchange
- **AES-GCM-256**: Symmetric encryption for messages and files
- **HMAC-SHA256**: Server session token validation

### Authentication

- **Google OAuth 2.0**: Third-party identity verification
- **Custom Session Tokens**: HMAC-signed tokens for session management

## Use Cases

### 1. Secure Team Communication

**Scenario**: A remote development team needs to share API keys and sensitive configuration data.

**Flow**:

1. Team members install the app and authenticate with Google
2. Team lead creates connections with each team member
3. Sensitive credentials are shared via encrypted messages
4. Files containing private keys are transferred with encryption
5. All communication is logged locally but never stored on the server

### 2. Confidential File Sharing

**Scenario**: A lawyer needs to share confidential documents with a client.

**Flow**:

1. Both parties install and authenticate
2. Lawyer initiates connection with client's email
3. Client accepts the connection request
4. Lawyer sends encrypted PDF files
5. Files are transferred in chunks and decrypted only on client's device
6. No trace of the file content exists on the relay server

### 3. Private Voice Discussions

**Scenario**: Security researchers need to discuss vulnerabilities without eavesdropping risk.

**Flow**:

1. Researchers establish encrypted connection
2. Initiator starts a voice call
3. Audio is captured, encrypted per chunk, and streamed
4. Peer decrypts and plays audio in real-time
5. No audio data is stored or accessible to the server

## System Goals

### Security Goals

- **Confidentiality**: Ensure only intended recipients can read messages
- **Integrity**: Detect any tampering of messages in transit
- **Forward Secrecy**: Session keys are ephemeral (note: currently device-bound, not perfect forward secrecy)
- **Minimal Attack Surface**: Server has no ability to decrypt or access user data

### Performance Goals

- **Low Latency**: Sub-second message delivery in optimal network conditions
- **Efficient File Transfer**: Chunked transfer prevents memory overflow for large files
- **Minimal Battery Drain**: Optimized for mobile devices

### Usability Goals

- **Simple Onboarding**: One-click Google Sign-In
- **Intuitive UI**: Familiar chat interface patterns
- **Offline Support**: Queue messages when peer is offline

## Architectural Philosophy

### "Thick Client, Thin Server"

The application follows a **thick client** architecture where:

- **Client**: Handles all encryption, decryption, storage, and business logic
- **Server**: Acts only as a stateless relay for encrypted payloads

This design ensures:

- Server cannot be compelled to hand over message content (it doesn't have it)
- Server compromise doesn't expose historical messages
- Users retain full control over their data

### Privacy-First Design Decisions

1. **No Server Persistence**: Messages are never stored on the server
2. **Hashed Logging**: Connection logs use SHA-256 hashed emails, not plaintext
3. **Device-Bound Keys**: Identity keys never leave the device's secure storage
4. **Local Storage Only**: All chat history resides in encrypted local databases

## Comparison to Other Platforms

| Feature              | This App | Signal | WhatsApp | Telegram |
| -------------------- | -------- | ------ | -------- | -------- |
| E2E Encryption       | ✅       | ✅     | ✅       | ⚠️       |
| Zero Server Storage  | ✅       | ❌     | ❌       | ❌       |
| Open Source          | ✅       | ✅     | ❌       | ❌       |
| Self-Hostable Server | ✅       | ❌     | ❌       | ❌       |
| Google Auth Only     | ✅       | ❌     | ❌       | ❌       |
| File Encryption      | ✅       | ✅     | ✅       | ⚠️       |
| Voice Calls E2E      | ✅       | ✅     | ✅       | ❌       |

## Project Status

**Current Version**: 1.0

**Platform Support**:

- ✅ Android
- ✅ Desktop (Electron - Windows/macOS/Linux)
- ❌ iOS (Not implemented)

**Key Limitations**:

- **No Perfect Forward Secrecy**: Session keys are long-lived (device-bound identity keys). If an identity private key were ever extracted from the OS keystore (extremely difficult on modern hardware), stored messages could be decrypted. A Double Ratchet (Signal Protocol) implementation would be needed for PFS.
- **Best-Effort Cross-Device Sync**: Messages are synchronized via the MANIFEST protocol when both devices are online simultaneously. Very long offline gaps may result in incomplete history on a new/reinstalled device — use Backup & Restore for guaranteed migration.
- **Single Relay Server**: No federation or distributed relay architecture (can be self-hosted)
- **Google OAuth Dependency**: No alternative authentication methods currently supported


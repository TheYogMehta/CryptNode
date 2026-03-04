# Features Documentation

This document provides a detailed breakdown of all features in the Secure Chat Application, including purpose, user flows, backend logic, API interactions, data models, and error handling.

## Feature Index

1. [Text Messaging](#1-text-messaging)
2. [File Sharing](#2-file-sharing)
3. [Voice Calls](#3-voice-calls)
4. [Secure Vault](#4-secure-vault)
5. [Profile Management](#5-profile-management)
6. [Session Management](#6-session-management)
7. [Multi-Account Support](#7-multi-account-support)
8. [Local AI Assistant](#8-local-ai-assistant)
9. [Secure Vault Multi-Factor Authentication (MFA)](#9-secure-vault-multi-factor-authentication-mfa)
10. [Multi-Device Support](#10-multi-device-support)
11. [Cross-Device Chat Syncing](#11-cross-device-chat-syncing)

---

## 1. Text Messaging

### Text Messaging Purpose

Enable users to send and receive end-to-end encrypted text messages in real-time.

### Text Messaging User Flow

1. User selects a peer from session list
2. User types message in input field
3. User presses Send or Enter
4. Message appears immediately in chat (optimistic UI)
5. Status changes from "sending" → "delivered" → "read"

### Text Messaging Backend Flow

![Text Messaging Backend Flow](./images/text-messaging-backend-flow.svg)

### Text Messaging API Interactions

**WebSocket Frame**:

```json
{
  "t": "MSG",
  "sid": "session_id",
  "data": {
    "payload": "encrypted_base64_string"
  }
}
```

**Decrypted Payload**:

```json
{
  "t": "MSG",
  "data": {
    "text": "Hello!",
    "id": "uuid-1234",
    "timestamp": 1704067200000,
    "replyTo": null
  }
}
```

### Text Messaging Data Models

**Database (SQLite)**:

```sql
INSERT INTO messages (id, sid, sender, text, type, timestamp, status, is_read)
VALUES ('uuid-1234', 'session_id', 'me', 'Hello!', 'text', 1704067200000, 1, 0);
```

**In-Memory (ChatClient)**:

```typescript
interface ChatMessage {
  id: string;
  sessionId: string;
  sender: "me" | "other";
  text: string;
  timestamp: number;
  status: 1 | 2 | 3; // Pending | Delivered | Read
}
```

### Advanced Messaging Features

**GIF Support**:

- **Tenor Integration**: Support for Tenor GIF URLs via `LinkPreview`.
- **Display**: GIFs are rendered cleanly using an `imageOnly` mode in the link previewer, removing metadata cards for a native feel.

**Message Deletion**:

- **Hard Delete**: Messages are permanently removed from the local database (no "message deleted" placeholder).
- **Local-Only Deletion**: Deleting a message sent by _another user_ removes it only from the local device; no network packet is sent.
- **Unsend (Retraction)**: Deleting _your own_ message performs a local hard delete AND sends a `DELETE` packet to the peer to remove it from their device.

### Text Messaging Error Handling

| Error                  | Cause                          | Recovery                                   |
| ---------------------- | ------------------------------ | ------------------------------------------ |
| **Peer offline**       | No active WebSocket connection | Queue locally, auto-retry on `PEER_ONLINE` |
| **Encryption failure** | Missing session key            | Show error, prompt reconnection            |
| **Network timeout**    | Socket closed mid-send         | Auto-reconnect, resend from queue          |
| **Invalid session**    | Session not found in DB        | Show error, navigate to session list       |

---

## 2. File Sharing

### File Sharing Purpose

Allow users to securely share images, videos, audio, and documents with encryption.

### File Sharing User Flow

1. User clicks attach icon (📎)
2. Native file picker opens
3. User selects file
4. File is previewed (if image)
5. User confirms send
6. File uploads in chunks
7. Peer sees file preview with download button
8. Peer clicks download
9. File transfers in chunks with progress bar
10. File available for viewing/saving

### File Sharing Backend Flow

**Sender Side**:

![File Sharing Sender Flow](./images/file-sharing-sender-flow.svg)

**Receiver Side**:

![File Sharing Receiver Flow](./images/file-sharing-receiver-flow.svg)

### File Sharing API Interactions

**FILE_INFO Frame** (encrypted in MSG):

```json
{
  "t": "FILE_INFO",
  "data": {
    "name": "vacation.jpg",
    "size": 2048576,
    "type": "image/jpeg",
    "thumbnail": "data:image/png;base64,...",
    "messageId": "uuid-5678"
  }
}
```

**FILE_REQ_CHUNK**:

```json
{
  "t": "FILE_REQ_CHUNK",
  "data": {
    "messageId": "uuid-5678",
    "chunkIndex": 0
  }
}
```

**FILE_CHUNK**:

```json
{
  "t": "FILE_CHUNK",
  "data": {
    "messageId": "uuid-5678",
    "chunkIndex": 0,
    "payload": "base64-data",
    "isLast": false
  }
}
```

### File Sharing Data Models

**messages table**:

```sql
INSERT INTO messages (id, sid, sender, text, type, timestamp, status)
VALUES ('uuid-5678', 'session_id', 'me', '{"filename":"vacation.jpg","size":2048576}', 'image', timestamp, 1);
```

**media table**:

```sql
INSERT INTO media (filename, original_name, file_size, mime_type, message_id, status, thumbnail)
VALUES ('vault_abc123', 'vacation.jpg', 2048576, 'image/jpeg', 'uuid-5678', 'pending', 'data:...');
```

### File Sharing Error Handling

| Error               | Cause                        | Recovery                          |
| ------------------- | ---------------------------- | --------------------------------- |
| **Read failure**    | File permissions             | Show error toast                  |
| **Chunk timeout**   | Network drop during transfer | Resume from last successful chunk |
| **Vault full**      | Storage limit reached        | Show "Storage full" error         |
| **Corrupted chunk** | Network corruption           | Request chunk again               |

---

## 3. Voice Calls

### Voice Calls Purpose

Enable real-time, end-to-end encrypted voice and video communication between peers using WebRTC.

### Voice Calls User Flow

1. User clicks phone icon in chat
2. Peer receives incoming call notification
3. Peer accepts call
4. Both users connected (bidirectional audio)
5. Either user hangs up
6. Call duration logged

### Voice & Video Calls Backend Flow

1. **Signaling**: Peers exchange SDP offers/answers and ICE candidates via the WebSocket server (encrypted).
2. **P2P Connection**: Browsers establish a direct P2P connection (or relay via TURN if NAT traversal fails).
3. **Media Stream**: Audio and Video flow directly between peers (DTLS-SRTP encrypted).

### Voice & Video Calls API Interactions

**RTC_OFFER / RTC_ANSWER**:

```json
{
  "t": "RTC_OFFER", // or RTC_ANSWER
  "sid": "session_id",
  "data": {
    "payload": "encrypted_sdp_json"
  }
}
```

**RTC_ICE**:

```json
{
  "t": "RTC_ICE",
  "sid": "session_id",
  "data": {
    "payload": "encrypted_candidate_json"
  }
}
```

### Voice & Video Calls Data Models

**Call Logs**:

```sql
INSERT INTO messages (id, sid, sender, text, type, timestamp)
VALUES ('uuid-call', 'session_id', 'me', '{"duration": 120, "mode": "video"}', 'call', timestamp);
```

### Voice Calls Error Handling

| Error                     | Cause               | Recovery                         |
| ------------------------- | ------------------- | -------------------------------- |
| **Mic permission denied** | User denied prompt  | Show error, disable call button  |
| **Stream failure**        | MediaRecorder error | Auto-terminate call, notify peer |
| **Network drop**          | WebSocket closed    | Auto-hang up, show "Call ended"  |

---

## 4. Secure Vault

### Secure Vault Purpose

Provide encrypted local storage for passwords, notes, and sensitive files.

### Secure Vault User Flow

1. User clicks vault icon
2. User is presented with the Secure Vault MFA challenge
3. User enters the 6-digit TOTP code
4. Code validates against local secure storage
5. Master Key (mnemonic) retrieved from secure storage
6. Vault encryption key derived from Master Key
7. Items decrypted and displayed

### Secure Vault Backend Flow

![Secure Vault Backend Flow](./images/secure-vault-backend-flow.svg)

### Encryption

**Key Derivation**:

```typescript
// 1. Verify MFA (Access Control)
const isValidMfa = await mfaService.verifyUserToken(email, mfaToken);
if (!isValidMfa) throw new Error("Invalid MFA Code");

// 2. Retrieve Master Key (Encryption Key Source)
const mnemonic = await getKeyFromSecureStorage("MASTER_KEY");

// 3. Derive Vault Key
const salt = getStoredSalt();
const vaultKey = await crypto.subtle.deriveKey(
  { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
  await importKey(mnemonic),
  { name: "AES-GCM", length: 256 },
  false,
  ["encrypt", "decrypt"],
);
```

### Secure Vault Data Models

**Vault Item**:

```typescript
interface VaultItem {
  id: string;
  type: "password" | "note" | "file";
  title: string;
  encryptedData: string; // Base64 encrypted JSON
  createdAt: number;
}
```

**Storage**: Separate from main database, stored in Capacitor SecureStorage or Vault-specific file.

### Secure Vault Error Handling

| Error                | Cause              | Recovery                             |
| -------------------- | ------------------ | ------------------------------------ |
| **Wrong passphrase** | Decryption failure | Show "Invalid passphrase" error      |
| **Vault corrupted**  | File corruption    | Show error, offer reset vault option |
| **Storage full**     | Disk space         | Show error, suggest deleting items   |

---

## 5. Profile Management

### Profile Management Purpose

Allow users to set display name and avatar.

### Profile Management User Flow

1. User opens settings/profile
2. Edit display name or upload avatar
3. Increment version number
4. Broadcast `PROFILE_VERSION` to all sessions
5. Peers see "Profile updated" notification
6. Peers request `GET_PROFILE`
7. User sends `PROFILE_DATA`
8. Peer updates local cache

### Profile Management Backend Flow

![profile_version](./images/profile-management-flow.svg)

### Profile Management API Interactions

**PROFILE_VERSION**:

```json
{
  "t": "PROFILE_VERSION",
  "data": {
    "name_version": 2,
    "avatar_version": 1
  }
}
```

**PROFILE_DATA**:

```json
{
  "t": "PROFILE_DATA",
  "data": {
    "name": "Yog Mehta",
    "avatar": "data:image/png;base64,...",
    "name_version": 2,
    "avatar_version": 1
  }
}
```

### Profile Management Data Models

**me table**:

```sql
UPDATE me SET public_name = 'Yog Mehta', name_version = name_version + 1;
```

**sessions table** (peer's device):

```sql
UPDATE sessions SET peer_name = 'Yog Mehta', peer_name_ver = 2 WHERE sid = ?;
```

---

## 6. Session Management

### Session Management Purpose

Manage active peer connections, online/offline status, and reconnection.

### Session Management User Flow

1. User views session list
2. Sessions show online/offline indicators
3. Click session to open chat
4. If peer offline, messages queued
5. When peer comes online, queue syncs automatically

### Session Management Backend Flow

**Session Creation**:

- Triggered by `CONNECT_REQ` + `JOIN_ACCEPT`
- Session ID generated: `timestamp_random`
- ECDH key exchange completes
- Session row inserted into SQLite

**Reconnection**:

- On app restart, load all sessions from DB
- Send `REATTACH` frame for each session
- Server associates client with sessions
- Receive `PEER_ONLINE` if peer is connected

### Session Management Data Models

```sql
SELECT sid, peer_name, peer_email, keyJWK FROM sessions ORDER BY sid DESC;
```

## 7. Multi-Account Support

### Multi-Account Purpose

Allow users to sign in with multiple Google accounts and switch between them.

### Multi-Account User Flow

1. User clicks "Add Account" in settings
2. Google sign-in flow
3. New account added to account list
4. User clicks "Switch Account"
5. App lock screen shows account list
6. Select account → Enter PIN/biometric
7. App switches to selected account's database and sessions

### Multi-Account Backend Flow

```typescript
async function switchAccount(email: string) {
  // 1. Close current WebSocket
  await ChatClient.disconnect();

  // 2. Switch database
  const dbName = await getDbName(email);
  await switchDatabase(dbName);

  // 3. Load account credentials
  const token = await getKeyFromSecureStorage(`${email}_auth_token`);

  // 4. Reconnect WebSocket
  await ChatClient.login(token);

  // 5. Reload UI
  emit("account_switched");
}
```

### Multi-Account Data Models

**SafeStorage**:

```json
{
  "chatapp_accounts": [
    {
      "email": "work@company.com",
      "token": "sess:...",
      "lastActive": 1704067200000
    },
    {
      "email": "personal@gmail.com",
      "token": "sess:...",
      "lastActive": 1703980800000
    }
  ]
}
```

---

## 8. Local AI Assistant

### Local AI Purpose

Provide privacy-preserving, on-device AI capabilities using the Qwen 3.5 0.8B model without sending data to external servers.

### Local AI Features

1. **Smart Compose**: Polishes and professionalizes drafted messages before sending.
2. **Quick Replies**: Generates contextually relevant short replies (Positive, Negative, Interrogative) based on recent chat history.
3. **Summarize**: Provides concise, bulleted summaries of a chat conversation.

### Local AI Execution Environments

- **Web/Desktop**: Uses WebAssembly (WASM) via Web Workers (`qwen.worker.ts`) for non-blocking inference.
- **Native (Android/iOS)**: Uses `@cantoo/capacitor-llama` to map to native C++ implementations, offering significantly better performance and lower memory usage on mobile devices.

### Local AI Error Handling

| Error                  | Cause                             | Recovery                                           |
| ---------------------- | --------------------------------- | -------------------------------------------------- |
| **Download Failed**    | Network drop or no disk space     | Prompt user to retry the 500MB+ download.          |
| **Native Init Failed** | Unsupported device architecture   | Fallback disabled; notify user device unsupported. |
| **Generation Timeout** | Process takes too long/Out of RAM | Cancel context and notify user.                    |

---

## 9. Secure Vault Multi-Factor Authentication (MFA)

### Secure Vault MFA Purpose

Enhance local Secure Vault security by requiring a dynamically generated 6-digit code to view encrypted passwords and files.

### Secure Vault MFA Flow

1. **Requirement**: When the user opens the Secure Vault, the client-side app (`SecureChatWindow`) checks local storage to see if MFA is provisioned.
2. **Prompt**: If provisioned, the user is presented with a local MFA challenge screen before they can unlock the vault.
3. **Verification**: The user enters the 6-digit code from their authenticator app.
4. **Acceptance**: The local app verifies the code against the stored secret returning access to the Secure Vault. **The server is completely unaware of and uninvolved in this process.**

### Secure Vault MFA Implementation

- **Algorithm**: Time-Based One-Time Password (TOTP) based on HMAC-SHA1.
- **Parameters**: 6 digits, 30-second period.
- **Storage**: The MFA secret is maintained securely in the device's native keychain (via `SafeStorage`), completely locally.

### MFA Error Handling

| Error              | Cause                           | Recovery                                  |
| ------------------ | ------------------------------- | ----------------------------------------- |
| **Invalid Code**   | Code expired, or typed wrongly. | Warn user to retry immediately.           |
| **Desynchronized** | Device clock is out of sync.    | Code verifies via sliding Window (+/- 1). |

---

## 10. Multi-Device Support

### Multi-Device Purpose

Enable users to access their account securely across multiple authenticated devices (e.g., Phone and Desktop) without explicit device-to-device linking protocols.

### Key Management

- Instead of single device keys, sessions now construct robust key pools involving arrays of `ownPubKeys` and `peerPubKeys`.
- Every authenticated device generates its own keys. On connecting to the server, the client shares its own public key to the server. The backend then routes encrypted payloads directly to all applicable devices for a user.

### Multi-Device Message & Presence Flow

1. **User 1 (Device A)** comes online and sends its public key to the server.
2. **User 1 (Device B)** comes online and sends its public key to the server.
3. **User 2 (Device A)** comes online and sends its public key to the server.
4. The server sends an online frame for **User 1 (Device A)** to **User 2 (Device A)**, and vice versa.
5. The server sends an online frame for **User 1 (Device B)** to **User 2 (Device A)**, and vice versa.
6. **User 2** sends a message ("Hi"). The client encrypts the payload separately for **User 1 (Device A)** as well as **User 1 (Device B)**.
7. If **User 1 (Device A)** goes offline, the server sends an offline packet to **User 1 (Device B)** and **User 2 (Device A)**.

---

## 11. Cross-Device Chat Syncing

### Chat Sync Purpose

Seamlessly synchronize chat history when a device has been offline, fetching histories from the user's other devices or the peer's devices.

### Chat Sync Flow

1. **Detection**: The `SyncManager` compares local message counts against a broadcasted state (`SYNC_STATE_BROADCAST`), or iterates through missing data chronologically on boot.
2. **Request Information**: Device sends `SYNC_INFO_REQ` to determine the total messages held by the peer/other linked device.
3. **Transfer Chunks**: The device requests batches of message history using `SYNC_REQ` (in ASC or DESC order).
4. **Acknowledge and Store**: The device imports `SYNC_ACK` payloads to local SQLite storage without duplicate conflicts.

### Sync Prioritization

- **Own Devices First**: When syncing a session, `SyncManager` will aggressively try to target the user's _other_ own linked devices (e.g., pulling missed Desktop messages from the mobile app) before falling back to querying the peer's device.

---

# WebSocket Protocol Specification

This document defines the complete WebSocket protocol used for communication between clients and the relay server.

## Protocol Overview

- **Transport**: WebSocket (RFC 6455)
- **Encoding**: JSON
- **Encryption**: Payload-level AES-GCM (E2E), TLS for transport (production)
- **Frame Structure**: All messages follow a standardized frame format

## Frame Structure

All WebSocket messages use this JSON structure:

```typescript
interface Frame {
  t: string; // Frame type (e.g., "AUTH", "MSG", "FRIEND_REQUEST")
  sid?: string; // Session ID (optional, used for session-specific frames)
  c?: boolean; // Confirmation flag (optional, if true server sends DELIVERED or DELIVERED_FAILED)
  sh?: string; // Sender hash (optional, injected by server on relaying MSG frames)
  targetPubKey?: string; // Target public key (optional, for routing RTC frames to specific devices)
  data?: any; // Frame-specific payload
}
```

**Example**:

```json
{
  "t": "MSG",
  "sid": "1704067200000_a3f7d2e1",
  "data": {
    "payload": "YWJjZGVmZ2hpams..." // Base64 encrypted content
  }
}
```

## Frame Types Reference Table

| Frame Type             | Direction       | Purpose                         | Requires Auth | Requires SID |
| ---------------------- | --------------- | ------------------------------- | ------------- | ------------ |
| `AUTH`                 | Client → Server | Authenticate with Google token  | No            | No           |
| `AUTH_SUCCESS`         | Server → Client | Confirm authentication          | N/A           | No           |
| `FRIEND_REQUEST`       | Bidirectional   | Encrypted friend request        | Yes           | No           |
| `REQUEST_SENT`         | Server → Client | Confirm request successfully    | Yes           | No           |
| `FRIEND_ACCEPT`        | Client → Server | Accept friend request           | Yes           | No           |
| `FRIEND_ACCEPTED`      | Server → Client | Peer accepted your request      | N/A           | No           |
| `FRIEND_ACCEPTED_ACK`  | Server → Client | Confirm you accepted request    | N/A           | No           |
| `FRIEND_DENY`          | Client → Server | Deny friend request             | Yes           | No           |
| `FRIEND_DENIED`        | Server → Client | Peer denied your request        | N/A           | No           |
| `BLOCK_USER`           | Client → Server | Block user                      | Yes           | No           |
| `USER_BLOCKED`         | Server → Client | Block acknowledged by server    | N/A           | No           |
| `USER_BLOCKED_EVENT`   | Server → Client | Peer blocked you                | N/A           | No           |
| `PENDING_REQUESTS`     | Server → Client | Received stored offline reqs    | N/A           | No           |
| `GET_DEVICES`          | Client → Server | Fetch all registered devices    | Yes           | No           |
| `DEVICE_LIST`          | Server → Client | List of registered devices      | N/A           | No           |
| `UPDATE_PUBKEY`        | Client → Server | Update active device public key | Yes           | No           |
| `GET_PUBLIC_KEY`       | Client → Server | Look up public key by email     | Yes           | No           |
| `PUBLIC_KEY`           | Server → Client | Respond with peer's public key  | N/A           | No           |
| `DELETE_ACCOUNT`       | Client → Server | Delete account & wipe memory    | Yes           | No           |
| `SESSION_LIST`         | Server → Client | Provide user's active sessions  | N/A           | No           |
| `REATTACH`             | Client → Server | Reconnect to existing session   | Yes           | Yes          |
| `MSG`                  | Bidirectional   | Encrypted message/command       | Yes           | Yes          |
| `RTC_OFFER`            | Bidirectional   | WebRTC SDP Offer                | Yes           | Yes          |
| `RTC_ANSWER`           | Bidirectional   | WebRTC SDP Answer               | Yes           | Yes          |
| `RTC_ICE`              | Bidirectional   | WebRTC ICE Candidate            | Yes           | Yes          |
| `PEER_ONLINE`          | Server → Client | Notify peer came online         | N/A           | Yes          |
| `PEER_OFFLINE`         | Server → Client | Notify peer went offline        | N/A           | Yes          |
| `DELIVERED`            | Server → Client | Confirm message delivery        | N/A           | Yes          |
| `DELIVERED_FAILED`     | Server → Client | Message delivery failed         | N/A           | Yes          |
| `ERROR`                | Server → Client | Error notification              | N/A           | No           |
| `PING`                 | Server → Client | Heartbeat                       | N/A           | No           |

## Frame Type Specifications

### 1. Authentication Frames

#### `AUTH` (Client → Server)

**Purpose**: Authenticate with the relay server using Google ID token or session token.

**Request**:

```json
{
  "t": "AUTH",
  "data": {
    "token": "eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...", // Google ID token or session token
    "publicKey": "YjY3ZDlmOWUyZmQ0..." // Base64-encoded Device Identity Key
  }
}
```

**Server Logic**:

1. Check if token starts with `"sess:"` (session token) or is Google ID token
2. Validate token (HMAC for session, Google API for ID token)
3. Extract email from token
4. Check if email is already connected on another client
5. If yes, reject new client
6. If no, register client and respond with `AUTH_SUCCESS`

#### `AUTH_SUCCESS` (Server → Client)

**Purpose**: Confirm successful authentication and provide session token.

**Response**:

```json
{
  "t": "AUTH_SUCCESS",
  "data": {
    "email": "user@example.com",
    "token": "sess:1735689600:user@example.com:a3d5f7e9..." // HMAC session token
  }
}
```

**Client Action**:

- Save session token to SecureStorage
- Initialize/switch SQLite database
- Load identity keys
- Emit `auth_success` event to UI
- Receive `SESSION_LIST` and automated `PENDING_REQUESTS` push immediately afterwards

### 2. Connection Establishment Frames

#### `FRIEND_REQUEST` (Client → Server → Target Client)

**Purpose**: Request to connect with another user by email, establishing a persistent contact and sharing device keys.

**Client Request**:

```json
{
  "t": "FRIEND_REQUEST",
  "data": {
    "targetEmail": "peer@example.com",
    "encryptedPacket": "ivb64.cipherb64" // Profile info encrypted with shared derived key
  }
}
```

**Server Logic**:

1. Validate payload. Lookup `targetEmail`.
2. Save request to `requests` SQLite table for offline delivery.
3. If target sockets are online, forward the `FRIEND_REQUEST` payload along with sender pub keys.
4. If delivered successfully online, delete from `requests` table.
5. Send `REQUEST_SENT` back to client.

**Server Forwarding**:

```json
{
  "t": "FRIEND_REQUEST",
  "data": {
    "senderHash": "a3f...",
    "encryptedPacket": "ivb64.cipherb64",
    "publicKeys": ["YjY3ZDlmOWUyZmQ0..."],
    "publicKey": "YjY3ZDlmOWUyZmQ0..."
  }
}
```

#### `FRIEND_ACCEPT` (Client → Server → Requester)

**Purpose**: Accept incoming connection and complete key exchange.

**Request**:

```json
{
  "t": "FRIEND_ACCEPT",
  "data": {
    "targetEmail": "requester@example.com",
    "encryptedPacket": "ivb64.cipherb64" // Acceptor's encrypted profile info
  }
}
```

**Server Logic**:

1. Insert relationship into `friends` table including the deterministic Session ID.
2. Remove from `requests` table.
3. Relay payload as `FRIEND_ACCEPTED` to online peers of the requester.
4. Acknowledge with `FRIEND_ACCEPTED_ACK` to acceptor.

#### `FRIEND_DENY` (Client → Server → Target Client)

**Purpose**: Reject incoming connection request.

**Request**:

```json
{
  "t": "FRIEND_DENY",
  "data": { "targetEmail": "requester@example.com" }
}
```

**Server Logic**:

- Deletes the stored request.
- Forwards `FRIEND_DENIED` to target socket, or queues in `offline_notifications` table.

#### `BLOCK_USER` (Client → Server → Target Client)

**Purpose**: Blacklist a user. The server does NOT mutate the friendship DB; it simply relays the event so the target client can handle it. **Unblocking is now a local-only operation** — it updates the local `blocked_users` table and propagates the change to own linked devices via the `MANIFEST` frame (see below); no `UNBLOCK_USER` frame is sent to the server.

**Request**:

```json
{
  "t": "BLOCK_USER",
  "data": { "targetEmail": "requester@example.com" }
}
```

**Server Logic**:

- Emits `USER_BLOCKED_EVENT` to the peer (queues if offline).
- Acknowledges with `USER_BLOCKED` to the initiator.

### 3. Session & Sync Management Frames

#### `SESSION_LIST` (Server → Client)

**Purpose**: Lists active connections and status upon login. Sent immediately after `AUTH_SUCCESS`.

**Notification**:

```json
{
  "t": "SESSION_LIST",
  "data": [
    {
      "sid": "a3f...",
      "online": true,
      "peerHash": "b6a...",
      "peerPubKeys": ["..."],
      "ownPubKeys": ["..."]
    }
  ]
}
```

#### `REATTACH` (Client → Server)

**Purpose**: Reconnect to an existing session after disconnect/restart.

**Request**:

```json
{
  "t": "REATTACH",
  "sid": "1704067200000_a3f7d2e1"
}
```

**Server Logic**:

1. Check if session exists in memory
2. If not, create new session with this client
3. Add client to session
4. Notify other clients via `PEER_ONLINE`

**Use Case**: App restart, network reconnection

#### `PEER_ONLINE` (Server → Client)

**Purpose**: Notify that a peer in the session came online.

**Notification**:

```json
{
  "t": "PEER_ONLINE",
  "sid": "1704067200000_a3f7d2e1"
}
```

**Client Action**:

- Update UI (show "online" indicator)
- Trigger pending message sync
- Send `MANIFEST` to sync own-device state if applicable

#### `PEER_OFFLINE` (Server → Client)

**Purpose**: Notify that a peer disconnected.

**Notification**:

```json
{
  "t": "PEER_OFFLINE",
  "sid": "1704067200000_a3f7d2e1"
}
```

**Client Action**:

- Update UI (show "offline" indicator)
- Stop auto-retry for pending messages

### 4. Messaging Frames

#### `MSG` (Bidirectional)

**Purpose**: Send encrypted message or command.

**Client → Server**:

```json
{
  "t": "MSG",
  "sid": "1704067200000_a3f7d2e1",
  "data": {
    "payload": "iv+ciphertext in Base64" // Encrypted with session AES key
  }
}
```

**Server Logic**:

1. Ensure session exists (create if needed)
2. Add sender to session if not already present
3. Relay `payload` to all other clients in session
4. If delivery successful, respond with `DELIVERED`
5. If no recipients, respond with `DELIVERED_FAILED`

**Decrypted Payload Types**:

The payload, when decrypted, contains a JSON object with its own type:

```typescript
// Text message
{
  "t": "MSG",
  "data": {
    "text": "Hello, world!",
    "id": "uuid-1234",
    "timestamp": 1704067200000,
    "replyTo": {...}  // Optional
  }
}

// File metadata
{
  "t": "FILE_INFO",
  "data": {
    "name": "document.pdf",
    "size": 1048576,
    "type": "application/pdf",
    "thumbnail": "data:image/png;base64,...",
    "messageId": "uuid-5678"
  }
}

// File chunk request
{
  "t": "FILE_REQ_CHUNK",
  "data": {
    "messageId": "uuid-5678",
    "chunkIndex": 0
  }
}

// File chunk response
{
  "t": "FILE_CHUNK",
  "data": {
    "messageId": "uuid-5678",
    "chunkIndex": 0,
    "payload": "base64-encoded-data",
    "isLast": false
  }
}

// Call signaling
{
  "t": "CALL_START",
  "data": {
    "type": "Audio"
  }
}

{
  "t": "CALL_ACCEPT"
}

{
  "t": "CALL_END"
}

{
  "t": "CALL_BUSY"
}

// Profile sync
{
  "t": "PROFILE_VERSION",
  "data": {
    "name_version": 2,
    "avatar_version": 1
  }
}

{
  "t": "GET_PROFILE"
}

{
  "t": "PROFILE_DATA",
  "data": {
    "name": "Yog Mehta",
    "avatar": "data:image/png;base64,...",
    "name_version": 2,
    "avatar_version": 1
  }
}

// Message Deletion
{
  "t": "MSG",
  "data": {
    "type": "DELETE",
    "id": "uuid-1234",
    "timestamp": 1704067200000
  }
}

// Cross-Device State Sync (MANIFEST)
// Sent encrypted to own linked devices whenever local state changes.
// Each section is merged independently (last-write-wins by timestamp).
{
  "t": "MSG",
  "data": {
    "type": "MANIFEST",
    "manifest": {
      "blocks": [
        { "email": "blocked@example.com", "action": "block", "timestamp": 1704067200000 },
        { "email": "unblocked@example.com", "action": "unblock", "timestamp": 1704067300000 }
      ],
      "requests": [
        {
          "email": "peer@example.com",
          "name": "Peer Name",
          "avatar": "data:image/png;base64,...",
          "publicKey": "YjY3ZD...",
          "senderHash": "a3f...",
          "action": "pending",
          "timestamp": 1704067200000
        }
      ],
      "aliases": [
        { "sid": "session_id", "aliasName": "Work Friend", "aliasAvatar": "", "timestamp": 1704067200000 }
      ],
      "profile": {
        "name": "Yog Mehta",
        "avatar": "data:image/png;base64,...",
        "nameVersion": 2,
        "avatarVersion": 1
      },
      "messages": [
        // Recent ChatMessage objects for new-device bootstrap
      ]
    }
  }
}
```

#### `DELIVERED` (Server → Client)

**Purpose**: Confirm message was delivered to peer.

**Notification**:

```json
{
  "t": "DELIVERED",
  "sid": "1704067200000_a3f7d2e1"
}
```

**Client Action**:

- Update message status in SQLite (status = 2)
- Show checkmark in UI

#### `DELIVERED_FAILED` (Server → Client)

**Purpose**: Notify that message could not be delivered (no online peers).

**Notification**:

```json
{
  "t": "DELIVERED_FAILED",
  "sid": "1704067200000_a3f7d2e1"
}
```

**Client Action**:

- Keep message in pending state
- Retry when `PEER_ONLINE` received

### 5. WebRTC Signaling Frames

#### `RTC_OFFER` (Bidirectional)

**Purpose**: Send WebRTC Session Description Protocol (SDP) offer.

**Frame**:

```json
{
  "t": "RTC_OFFER",
  "sid": "1704067200000_a3f7d2e1",
  "data": {
    "payload": "encrypted_sdp_offer_json"
  }
}
```

#### `RTC_ANSWER` (Bidirectional)

**Purpose**: Send WebRTC SDP answer.

**Frame**:

```json
{
  "t": "RTC_ANSWER",
  "sid": "1704067200000_a3f7d2e1",
  "data": {
    "payload": "encrypted_sdp_answer_json"
  }
}
```

#### `RTC_ICE` (Bidirectional)

**Purpose**: Send WebRTC ICE candidate.

**Frame**:

```json
{
  "t": "RTC_ICE",
  "sid": "1704067200000_a3f7d2e1",
  "data": {
    "payload": "encrypted_ice_candidate_json"
  }
}
```

**Server Logic**:

- Relay payload to the peer in the session.
- No inspection of the encrypted payload.

**Client Logic**:

- Decrypt payload.
- Pass SDP/Candidate to `RTCPeerConnection`.

### 6. Error & Control Frames

#### `ERROR` (Server → Client)

**Purpose**: Notify client of errors.

**Notification**:

```json
{
  "t": "ERROR",
  "data": {
    "message": "Authentication required"
  }
}
```

**Common Error Messages**:

- `"Auth failed"`: Invalid token
- `"Authentication required"`: Tried to use protected endpoint without auth
- `"User not online"`: Target user not connected
- `"Already logged in on another device"`: Email in use

**Client Action**:

- If auth error, trigger logout
- Show notification to user

#### `PING` (Server → Client)

**Purpose**: Heartbeat to keep connection alive.

**Frame**:

```json
{
  "t": "PING"
}
```

**Frequency**: Every 10 seconds

**Client Action**: None (WebSocket layer handles it)

#### `GET_TURN_CREDS` (Client → Server)

**Purpose**: Request ephemeral TURN credentials for media relay (Voice Calls).

**Request**:

```json
{
  "t": "GET_TURN_CREDS"
}
```

#### `TURN_CREDS` (Server → Client)

**Purpose**: Return TURN credentials.

**Response**:

```json
{
  "t": "TURN_CREDS",
  "data": {
    "urls": ["turn:turn.example.com:3478?transport=udp"],
    "username": "1704999999:user",
    "credential": "base64_password",
    "ttl": 600
  }
}
```

## Connection Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Connecting: Client Opens WS
    Connecting --> Connected: WS Open
    Connected --> Authenticating: Send AUTH
    Authenticating --> Failed: Invalid Token
    Authenticating --> Authenticated: AUTH_SUCCESS
    Authenticated --> Authenticated: SESSION_LIST Data Restores Local Cache

    Failed --> Connecting: Retry

    Authenticated --> SessionActive: FRIEND_REQUEST / FRIEND_ACCEPT
    SessionActive --> SessionActive: MSG, STREAM
    SessionActive --> PeerOffline: PEER_OFFLINE
    PeerOffline --> SessionActive: PEER_ONLINE

    SessionActive --> Disconnected: WS Close
    Authenticated --> Disconnected: WS Close
    Disconnected --> Connecting: Auto-Reconnect

    Disconnected --> [*]: Manual Close
```

## Error Handling

### Connection Errors

| Error Condition    | Server Behavior                    | Client Behavior     |
| ------------------ | ---------------------------------- | ------------------- |
| Invalid JSON       | Close connection                   | Show error, retry   |
| Unknown frame type | Ignore frame                       | N/A                 |
| Missing SID        | Ignore frame                       | N/A                 |
| Session not found  | Create session (for MSG) or ignore | Retry or show error |
| Unauthorized       | Send ERROR frame                   | Logout              |

### Message Delivery Guarantees

- **At-most-once**: Server relays each MSG frame exactly once
- **No persistence**: Messages not queued if peer offline
- **Client responsibility**: Client queues messages locally and resends

## Rate Limiting

**Implemented Limits**:

- **MSG Frames**: Max 100 messages/second per client (burst protection)
- **CONNECT_REQ**: Max 1 request per 5 seconds per client
- **AUTH Attempts**: Max 3 attempts per minute per IP address

**Action on Limit Exceeded**:

- Server sends `ERROR` frame with specific message
- Excess messages are dropped/ignored
- Repeated Auth violations result in temporary IP block (1 minute)

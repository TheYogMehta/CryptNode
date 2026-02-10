# Security Protocol & Cryptography

## 1. Encryption Standards

The application uses standard Web Crypto API primitives. No proprietary crypto algorithms are used.

| Component         | standard    | Parameters        | Usage                                    |
| ----------------- | ----------- | ----------------- | ---------------------------------------- |
| **Identity Keys** | **ECDH**    | Curve: `P-256`    | Generating shared secrets between peers. |
| **Session Keys**  | **AES-GCM** | Length: `256-bit` | Encrypting messages and files.           |
| **Signatures**    | **HMAC**    | SHA-256           | Server-side session token validation.    |
| **File Keys**     | **AES-GCM** | Length: `256-bit` | Derived per session for file encryption. |

## 2. Identity Management (Device-Bound)

Identity is **Device-Bound**.

1. When a user logs in on a new device, a **NEW** ECDH Identity KeyPair is generated.
2. The Private Key is stored in the device's Secure Storage (Keystore/Keychain).
3. The Public Key is exchanged during the `CONNECT_REQ` handshake.

> [!NOTE]
> There is currently no mechanism to share identity keys between devices. Each device is effectively a distinct "cryptographic user" linked to the same email.

### Threat Model & Security Guarantees

**What is Protected:**

- ✅ **Network Eavesdropping**: Passive attackers intercepting network traffic see only encrypted payloads
- ✅ **Server Compromise**: Server breach reveals no message content (server never stores plaintext)
- ✅ **Man-in-the-Middle (MITM)**: ECDH key exchange prevents impersonation (assuming initial public key exchange is trusted)
- ✅ **Message Tampering**: AES-GCM provides authenticated encryption with integrity checks
- ✅ **Database Breach**: Local SQLite database is encrypted; requires both database access AND device keystore compromise

**What is NOT Protected (Theoretical Risks):**

- ⚠️ **Physical Device Compromise**: If an attacker gains physical access to an unlocked device or extracts keys from the native keystore (extremely difficult on modern Android/iOS), they could:
  - Decrypt messages stored on that specific device
  - Impersonate the user in future conversations

**Why Device-Bound Keys Are Still Secure:**

1. **Native Keystore Protection**: Private keys are stored in Android Keystore / iOS Keychain, which provides hardware-backed encryption on modern devices
2. **No Server-Side Risk**: Unlike cloud-based systems, compromising the server doesn't compromise historical messages
3. **Local-Only Storage**: Messages never leave the device unencrypted, eliminating the largest attack surface
4. **High Attack Cost**: Extracting keys from a modern device requires:
   - Physical access to the device
   - Bypassing OS-level security (PIN/biometric)
   - Advanced forensic tools or OS exploits
   - This is far beyond the capability of typical attackers

## 3. The Handshake (ECDH)

When User A connects to User B:

1. **User A**: `GenerateKey(ECDH, P-256)` -> `PrivA`, `PubA`.
2. **User A** -> Server -> **User B**: Sends `PubA`.
3. **User B**: `GenerateKey(ECDH, P-256)` -> `PrivB`, `PubB`.
4. **User B**:
   - Derives `SharedSecret` = `PrivB` + `PubA`.
   - Derives `SessionKey` = AES-GCM-256 from `SharedSecret`.
5. **User B** -> Server -> **User A**: Sends `PubB`.
6. **User A**:
   - Derives `SharedSecret` = `PrivA` + `PubB`.
   - Derives `SessionKey` = AES-GCM-256 from `SharedSecret`.

**Result**: Both parties now possess identical `SessionKey`. The Server only saw `PubA` and `PubB`, so it cannot derive the key.

## 4. Message Encryption (AES-GCM)

Every message follows this format:

```typescript
// Encrypted Payload Structure
Uint8Array [
  ...IV (12 bytes),          // Random Initialization Vector
  ...Ciphertext (N bytes) // The encrypted JSON data
]
```

### Protocol

1. **IV Generation**: A fresh 12-byte random IV is generated for _every_ message.
2. **Encryption**: `crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data)`.
3. **Transmission**: The IV is prepended to the ciphertext and Base64 encoded before sending.

## 5. Media Security

### File Transfer

- Files are **chunked** (64KB chunks).
- Each chunk is encrypted independently using the `SessionKey`.
- High memory efficiency: The entire file is never loaded into RAM at once; it is streamed from disk -> encrypted -> sent.

### Audio/Video Calls

- **WebRTC**: The app uses standard WebRTC for peer-to-peer audio and video calls.
- **Signaling Encryption**: All signaling messages (SDP offers/answers, ICE candidates) are end-to-end encrypted using the existing WebSocket secure channel (`AES-GCM`).
- **Media Encryption**: Media streams are encrypted using standard WebRTC security protocols (**DTLS-SRTP**).
- **Peer Connection**: Direct P2P connection is established when possible. A TURN server is available for NAT traversal if direct connection fails.

# Security Protocol & Cryptography

## 1. Encryption Standards

The application uses standard Web Crypto API primitives exclusively. No proprietary or custom cryptographic algorithms are implemented.

| Component | Algorithm | Parameters | Usage |
|---|---|---|---|
| **Identity Keys** | **ECDH** | Curve: `P-256` | Deriving shared secrets during session establishment |
| **Session Keys** | **AES-GCM** | Key length: `256-bit`, IV: `12 bytes (random)` | Encrypting all messages, files, and inner commands |
| **Backup Keys** | **AES-GCM + PBKDF2** | `256-bit`, 100,000 iterations, SHA-256 | Encrypting backup files with a user passphrase |
| **Vault Keys** | **AES-GCM + PBKDF2** | `256-bit`, 100,000 iterations, SHA-256 | Encrypting vault items with the master key |
| **Server Tokens** | **HMAC** | SHA-256 | Signing session tokens (server-side) |
| **Database Keys** | **BIP39 Mnemonic** | 128-bit entropy (12 words) | Symmetric key for SQLite encryption |
| **Email Hashing** | **SHA-256** | — | Hashing emails for comparison without revealing them in protocol |

## 2. Identity Management (Device-Bound)

Identity is **device-bound** by design.

1. On first login on a new device, a **new** ECDH P-256 identity key pair is generated:
   ```typescript
   const keyPair = await crypto.subtle.generateKey(
     { name: "ECDH", namedCurve: "P-256" },
     true,
     ["deriveKey"]
   );
   ```
2. The private key is stored in `SafeStorage` under the key `identity_priv_<sha256(email)>` (Android Keystore / encrypted electron-store).
3. **The private key is never transmitted** — only the raw public key (Base64-encoded `crypto.subtle.exportKey("raw", publicKey)`) is shared with the server and peers.
4. Each device is unique because the key pair is freshly generated on first use and stored locally. Two devices on the same Google account will generate different key pairs independently — there is no device ID mixed into key generation or storage.

> [!NOTE]
> There is no mechanism to share identity private keys between devices. Each device is a distinct cryptographic identity, linked only by the shared Google account email.

### Threat Model & Security Guarantees

**Protections:**

- ✅ **Network Eavesdropping**: Passive attackers see only AES-GCM ciphertext; TLS adds transport-level encryption
- ✅ **Server Compromise**: Server holds no message content, no session keys, and no user private keys
- ✅ **Man-in-the-Middle (MITM)**: ECDH key exchange is established during the friend request handshake, which is protected by Google identity verification
- ✅ **Message Tampering**: AES-GCM provides authenticated encryption — any bit flip in the ciphertext will cause decryption failure
- ✅ **Database Breach**: SQLite is encrypted; requires both the encrypted DB file AND the BIP39 mnemonic from the OS keystore to decrypt
- ✅ **Server-Side Logging**: Server only logs SHA-256 hashed emails, never plaintext

**Residual Risks:**

- ⚠️ **Physical Device Compromise**: An attacker with physical access to an unlocked device, and the ability to bypass OS-level security, could theoretically extract keys from the keystore. This requires advanced forensic tools far beyond typical attackers.
- ⚠️ **No Perfect Forward Secrecy**: Session keys are long-lived (device-bound identity keys, static per peer pair). A compromised identity private key could decrypt all messages stored locally. PFS via Double Ratchet (like Signal Protocol) is not currently implemented.
- ⚠️ **Google Auth Dependency**: The system relies on Google for identity binding. A Google account compromise allows server authentication but not decryption of existing messages (the attacker would also need the device's private key).

---

## 3. The Handshake (ECDH Key Exchange)

### Multi-Device ECDH

When User A connects with User B (who has 2 devices):

```
User A (Device 1)  ──── pubA ────►  Server  ──────────────────────────► User B (Device 1)
                                                                          User B (Device 2)

User B (Device 1) generates: SharedKey_B1 = ECDH(privB1, pubA)
User B (Device 2) generates: SharedKey_B2 = ECDH(privB2, pubA)
User A generates:             SharedKey_A_B1 = ECDH(privA, pubB1)
                              SharedKey_A_B2 = ECDH(privA, pubB2)

SharedKey_A_B1 === SharedKey_B1  (identical AES key for A↔B1 communication)
SharedKey_A_B2 === SharedKey_B2  (identical AES key for A↔B2 communication)
```

### Key Derivation Code

```typescript
// Derive AES-GCM session key from ECDH shared secret
private async deriveSharedKey(peerPubB64: string): Promise<CryptoKey> {
    const raw = Uint8Array.from(atob(peerPubB64), c => c.charCodeAt(0));
    const peerPubKey = await crypto.subtle.importKey(
        "raw", raw, { name: "ECDH", namedCurve: "P-256" }, false, []
    );
    return crypto.subtle.deriveKey(
        { name: "ECDH", public: peerPubKey },
        this.authService.identityKeyPair.privateKey,
        { name: "AES-GCM", length: 256 },
        true,               // extractable (needed for JWK serialization to SQLite)
        ["encrypt", "decrypt"]
    );
}
```

### Session Key Persistence

Derived session keys are exported as JWK and stored in the `sessions` table's `keyJWK` column (which is inside the encrypted SQLite database). On app restart, keys are imported back:

```typescript
const key = await crypto.subtle.importKey(
    "jwk", jwk, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]
);
```

---

## 4. Message Encryption (AES-GCM)

Every message payload uses:
- A **fresh, cryptographically random 12-byte IV** for every message
- **AES-GCM-256** for authenticated encryption (provides both confidentiality and integrity)

```typescript
// Encrypted Payload Binary Layout:
// [ IV (12 bytes) ][ Ciphertext (N bytes) ]

const iv = crypto.getRandomValues(new Uint8Array(12));
const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    sessionKey,
    new TextEncoder().encode(JSON.stringify(innerPayload))
);

// Transmission: prepend IV, Base64 encode
const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
combined.set(iv, 0);
combined.set(new Uint8Array(ciphertext), iv.byteLength);
const payload = btoa(String.fromCharCode(...combined));
```

**Multi-Device MSG Frame**: When a session has multiple peer devices, the same plaintext is encrypted independently for each device:

```typescript
// data.payloads = { [devicePubKey]: base64(IV + Ciphertext) }
const payloads: Record<string, string> = {};
for (const [pubKey, sessionKey] of Object.entries(session.cryptoKeys)) {
    payloads[pubKey] = await encrypt(plaintext, sessionKey);
}
```

---

## 5. File Security

### File Transfer Encryption

- Files are split into **250KB chunks** (~256,000 bytes) before transmission
- Each chunk is encrypted with the session's AES-GCM key (with a unique IV per chunk)
- The sender streams from disk → encrypt → send; the full file is never loaded into RAM
- The receiver writes chunks to a local vault file; the complete file is re-assembled only during download

### Friend Request Encryption

During the handshake, the friend request profile packet is also encrypted:

```typescript
// Temporary key: ECDH(myPriv, targetDevicePub) → AES-GCM key
const sharedKey = await deriveSharedKey(targetDevicePubB64);
const iv = crypto.getRandomValues(new Uint8Array(12));
const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, sharedKey, new TextEncoder().encode(profile)
);
const packet = `${btoa(iv)}.${btoa(encrypted)}`;
```

This means the friend request profile (name, avatar, email) is never readable by the server.

---

## 6. WebRTC Call Security

Audio and video calls use standard WebRTC with:

- **Signaling Channel (E2E encrypted)**: All SDP offers/answers and ICE candidates are end-to-end encrypted using the session's existing AES-GCM key before being sent over the WebSocket relay. The relay server cannot read the signaling data.
- **Media Stream (DTLS-SRTP)**: WebRTC mandates DTLS-SRTP for all media streams. This provides encryption, authentication, and integrity for the audio/video data flowing directly between peers.
- **TURN Server**: Ephemeral credentials with short TTL (10 minutes) are generated via HMAC-SHA256 for NAT traversal. TURN traffic is encrypted end-to-end via DTLS-SRTP.

---

## 7. Secure Vault Security

The Secure Vault is a separate subsystem from the main chat, with its own access control:

### Access Gate: TOTP MFA

Before the vault is opened, the `mfa.service.ts` verifies a 6-digit TOTP code locally:
```typescript
// TOTP: RFC 6238 — HMAC-SHA1, 6 digits, 30-second window
// Verifies with a ±1 window tolerance for clock skew
const isValid = await mfaService.verifyUserToken(email, code);
```

The MFA secret is stored in `SafeStorage`. **The relay server is completely unaware of MFA.**

### Vault Encryption

Vault items are encrypted with a key derived from the user's BIP39 master key via PBKDF2:

```typescript
const vaultKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    await crypto.subtle.importKey("raw", masterKeyBytes, { name: "PBKDF2" }, false, ["deriveKey"]),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
);
```

---

## 8. Backup File Security

Encrypted backup files use the following format:

```
[ Salt (16 bytes) ][ IV (12 bytes) ][ AES-GCM-256 Ciphertext (N bytes) ]
```

The encryption key is derived via PBKDF2 (100,000 iterations, SHA-256) from a user-chosen passphrase. Without the correct passphrase, the backup file is unreadable.

---

## 9. Hashed Logging

The server never logs plaintext emails. Connection attempts are logged using SHA-256 hashed emails:

```go
hashedEmail := sha256.Sum256([]byte(email))
logger.Printf("New connection: %x", hashedEmail)
```

---

## 10. Attack Mitigations Summary

| Threat | Mitigation |
|---|---|
| Token replay | Session tokens bound to email + HMAC-signed; short-lived (30-day expiry) |
| Man-in-the-Middle (transport) | TLS (`wss://`) in production |
| Man-in-the-Middle (E2E) | ECDH key exchange bound to Google identity; keys exchanged at handshake |
| Token theft | `SafeStorage` uses OS-level hardware-backed encryption (Keychain/Keystore) |
| Brute-force auth | Google OAuth handles rate limiting; HMAC signature prevents forgery |
| Server compromise | Server has zero message content; no session keys; only hashed emails in logs |
| Blocked user evading block | Block is enforced pre-decryption by `senderHash` check |
| Untrusted message injection | Every `MSG` frame validated against known peer's email hash before processing |
| Replay attacks (messages) | AES-GCM with per-message random IV; UUID message IDs with local dedup |

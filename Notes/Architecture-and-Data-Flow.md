# Architecture and Data Flow Documentation

## 1. Project Overview

This project implements a real-time, End-to-End Encrypted (E2E) messaging protocol using **WebSockets** for communication, **Diffie-Hellman (DH)** for key exchange, and **AES-256-GCM** for data encryption. The core philosophy is that the central server acts only as a relay ("Signaling Server") and never possesses the raw decryption keys.

---

## 2. Technical Stack

- **Signaling Server:** Go (Golang) using the `gorilla/websocket` library.
- **Client Implementation:** Node.js using the `ws` and `crypto` modules.
- **Encryption Standard:** AES-256-GCM (Galois/Counter Mode).
- **Key Exchange:** Diffie-Hellman Group 14 (2048-bit MODP).

---

## 3. Data Flow Overview

The communication lifecycle is divided into three distinct phases: **Signaling**, **Handshake**, and **Encrypted Messaging**.

### Phase A: Signaling & Session Creation

1. **Client 1** requests a `CREATE_SESSION` from the Go server.
2. The server generates a unique **Session ID (SID)** and returns it.
3. **Client 1** generates DH parameters (Prime, Generator, and Public Key) and sends an `INVITE_CREATE` frame to the server.
4. The server generates a short **Invite Code** and maps it to Client 1's parameters.

### Phase B: The Cryptographic Handshake

1. **Client 2** provides the Invite Code via a `JOIN` frame.
2. The server relays Client 1’s DH parameters to **Client 2**.
3. **Client 2** generates their own Public Key and sends it back.
4. The server sends **Client 2’s** Public Key to **Client 1**.
5. **Computation:** Both clients now possess their own Private Key and the other's Public Key. They independently compute the **Shared Secret**.

### Phase C: Encrypted Messaging (The Data Plane)

Once the Shared Secret is derived:

1. **Encryption:** Before sending, the sender creates a random 12-byte **Initialization Vector (IV)**. The message is encrypted using **AES-256-GCM**.
2. **Transmission:** The sender transmits a hex string containing: `IV + AuthTag + Ciphertext`.
3. **Relay:** The Go server receives the `MSG` frame and broadcasts it to the other SID members. The server cannot decrypt this string because it lacks the Shared Secret.
4. **Decryption:** The receiver extracts the IV and AuthTag, verifies the integrity, and restores the plaintext.

---

## 4. State Persistence & Resumption

To ensure the system is production-ready, it supports **Session Resumption**:

- **Local Storage:** Clients store their derived keys and SIDs in `state-[Name].json`.
- **Reattachment:** Upon restarting, if a client finds an existing key, it sends a `REATTACH` frame.
- **Server Logic:** The Go server re-links the new WebSocket connection to the existing session memory, allowing communication to continue without a new handshake.

---

## 5. Security Analysis

- **Man-in-the-Middle (MITM) Protection:** By using DH MODP14, the work required to intercept the key is computationally infeasible for standard hardware.
- **Integrity Assurance:** AES-GCM provides an authentication tag. If an attacker (or the server) modifies a single bit of the encrypted message, the receiver’s decryption will fail, alerting the user to a security breach.
- **Zero-Knowledge:** The server logic in `main.go` only reads the `sid` and `t` (type) fields; the `data.payload` remains an opaque string to the Go runtime.

import { EventEmitter } from "events";
import { queryDB, dbInit } from "./sqliteService";
import {
  setKeyFromSecureStorage,
  getKeyFromSecureStorage,
} from "./SafeStorage";
import socket from "./SocketManager";

interface ServerFrame {
  t: string;
  sid: string;
  data: any;
}

interface ChatSession {
  cryptoKey: CryptoKey;
  online: boolean;
}

class ChatClient extends EventEmitter {
  private static instance: ChatClient;
  public sessions: Record<string, ChatSession> = {};
  private identityKeyPair: CryptoKeyPair | null = null;

  static getInstance() {
    if (!ChatClient.instance) ChatClient.instance = new ChatClient();
    return ChatClient.instance;
  }

  async init() {
    await dbInit();
    await this.loadIdentity();
    await this.loadSessions();

    this.emit("session_updated");

    // Connect to the WebSocket server
    // await socket.connect("ws://162.248.100.69:9000");
    await socket.connect(
      "ws://xtyftvyhce22nmvxy22b5pjoeiuziiai5ug7p7pbbr43eezotzfw2cad.onion"
    );

    socket.on("WS_CONNECTED", () => {
      this.emit("status", true);
      Object.keys(this.sessions).forEach((sid) =>
        this.send({ t: "REATTACH", sid })
      );
    });
    socket.on("message", (frame: ServerFrame) => this.handle(frame));
  }

  // --- TRIGGER ACTIONS ---
  public createInvite() {
    this.send({ t: "CREATE_SESSION" });
  }

  public async joinByCode(code: string) {
    const myPub = await this.exportPub();
    this.emit("waiting_for_accept", true);
    this.send({ t: "JOIN", data: { code, publicKey: myPub } });
  }

  public async acceptFriend(sid: string, remotePub: string) {
    const myPub = await this.exportPub();
    this.send({ t: "JOIN_ACCEPT", sid, data: { publicKey: myPub } });
    await this.finalizeSession(sid, remotePub);
  }

  public denyFriend(sid: string) {
    this.send({ t: "JOIN_DENY", sid });
  }

  // --- INTERNAL HANDLERS ---
  private async handle(frame: ServerFrame) {
    const { t, sid, data } = frame;

    switch (t) {
      case "INVITE_CODE":
        this.emit("invite_ready", data.code);
        break;
      case "JOIN_REQUEST":
        this.emit("inbound_request", { sid, publicKey: data.publicKey });
        break;
      case "JOIN_ACCEPT":
        await this.finalizeSession(sid, data.publicKey);
        this.emit("waiting_for_accept", false);
        this.emit("joined_success", sid);
        break;
      case "JOIN_DENIED":
        this.emit("waiting_for_accept", false);
        this.emit("error", "Request was declined by the host.");
        break;
      case "ERROR":
        this.emit("waiting_for_accept", false);
        this.emit("error", data.message || "Unknown error");
        break;
      case "MSG":
        await this.decryptAndStore(sid, data.payload);
        this.send({ t: "MSG_READ", sid });
        break;
      case "PEER_ONLINE":
        if (!this.sessions[sid]) return;
        this.sessions[sid].online = true;
        this.emit("presence_update", { sid, online: true });
        break;
      case "PEER_OFFLINE":
        if (!this.sessions[sid]) return;
        this.sessions[sid].online = false;
        this.emit("presence_update", { sid, online: false });
        break;
      case "DELIVERED":
        if (this.sessions[sid]) {
          this.emit("message_delivered", sid);
        }
        break;
      case "MSG_READ":
        if (this.sessions[sid]) {
          this.emit("message_read", sid);
        }
        break;
      default:
        break;
    }
  }

  private async finalizeSession(sid: string, remotePubB64: string) {
    const sharedKey = await this.deriveSharedKey(remotePubB64);
    this.sessions[sid] = {
      cryptoKey: sharedKey,
      online: false,
    };
    const jwk = await window.crypto.subtle.exportKey("jwk", sharedKey);
    await queryDB(
      "INSERT OR REPLACE INTO sessions (sid, keyJWK) VALUES (?, ?)",
      [sid, JSON.stringify(jwk)]
    );
    this.emit("session_updated");
  }

  private async decryptAndStore(sid: string, payload: string) {
    if (!this.sessions[sid]) return;
    try {
      const combined = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
      const dec = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: combined.slice(0, 12) },
        this.sessions[sid].cryptoKey,
        combined.slice(12)
      );
      const text = new TextDecoder().decode(dec);
      await queryDB(
        "INSERT INTO messages (sid, sender, text) VALUES (?, 'other', ?)",
        [sid, text]
      );
      this.emit("message", { sid, text, sender: "other" });
    } catch (e) {
      console.error("Decryption failed", e);
    }
  }

  // --- HELPERS ---
  public send(f: any) {
    socket.send(f);
  }

  // Identity & crypto
  private async loadIdentity() {
    const privJWK = await getKeyFromSecureStorage("identity_priv");
    const pubJWK = await getKeyFromSecureStorage("identity_pub");

    if (privJWK && pubJWK) {
      this.identityKeyPair = {
        privateKey: await window.crypto.subtle.importKey(
          "jwk",
          JSON.parse(privJWK),
          { name: "ECDH", namedCurve: "P-256" },
          true,
          ["deriveKey"]
        ),
        publicKey: await window.crypto.subtle.importKey(
          "jwk",
          JSON.parse(pubJWK),
          { name: "ECDH", namedCurve: "P-256" },
          true,
          []
        ),
      };
    } else {
      this.identityKeyPair = await window.crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey"]
      );
      await setKeyFromSecureStorage(
        "identity_priv",
        JSON.stringify(
          await window.crypto.subtle.exportKey(
            "jwk",
            this.identityKeyPair.privateKey
          )
        )
      );
      await setKeyFromSecureStorage(
        "identity_pub",
        JSON.stringify(
          await window.crypto.subtle.exportKey(
            "jwk",
            this.identityKeyPair.publicKey
          )
        )
      );
    }
  }

  private async loadSessions() {
    const rows = await queryDB("SELECT * FROM sessions");
    for (const row of rows) {
      this.sessions[row.sid] = {
        cryptoKey: await window.crypto.subtle.importKey(
          "jwk",
          JSON.parse(row.keyJWK),
          { name: "AES-GCM" },
          false,
          ["encrypt", "decrypt"]
        ),
        online: false,
      };
    }
  }

  public async exportPub() {
    const raw = await window.crypto.subtle.exportKey(
      "raw",
      this.identityKeyPair!.publicKey
    );
    return btoa(String.fromCharCode(...new Uint8Array(raw)));
  }

  private async deriveSharedKey(pubB64: string) {
    const raw = Uint8Array.from(atob(pubB64), (c) => c.charCodeAt(0));
    const pub = await window.crypto.subtle.importKey(
      "raw",
      raw,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      []
    );
    return await window.crypto.subtle.deriveKey(
      { name: "ECDH", public: pub },
      this.identityKeyPair!.privateKey,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
  }

  public async sendMessage(sid: string, text: string) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const enc = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      this.sessions[sid].cryptoKey,
      new TextEncoder().encode(text)
    );
    const combined = new Uint8Array(12 + enc.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(enc), 12);
    this.send({
      t: "MSG",
      sid,
      data: { payload: btoa(String.fromCharCode(...combined)) },
    });
    await queryDB(
      "INSERT INTO messages (sid, sender, text) VALUES (?, 'me', ?)",
      [sid, text]
    );
  }
}

export default ChatClient.getInstance();

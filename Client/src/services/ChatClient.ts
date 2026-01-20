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
  private audioContext: AudioContext | null = null;

  static getInstance() {
    if (!ChatClient.instance) ChatClient.instance = new ChatClient();
    return ChatClient.instance;
  }

  // Initialize DB, identity, sessions, and socket
  async init() {
    await dbInit();
    await this.loadIdentity();
    await this.loadSessions();
    this.emit("session_updated");

    await socket.connect("ws://162.248.100.69:9000");

    socket.on("WS_CONNECTED", () => {
      this.emit("status", true);
      Object.keys(this.sessions).forEach((sid) =>
        this.send({ t: "REATTACH", sid }),
      );
    });

    socket.on("message", (frame: ServerFrame) => this.handleFrame(frame));
  }

  // --- Actions ---
  public createInvite() {
    this.send({ t: "CREATE_SESSION" });
  }

  public async joinByCode(code: string) {
    const pub = await this.exportPub();
    this.emit("waiting_for_accept", true);
    this.send({ t: "JOIN", data: { code, publicKey: pub } });
  }

  public async acceptFriend(sid: string, remotePub: string) {
    const pub = await this.exportPub();
    this.send({ t: "JOIN_ACCEPT", sid, data: { publicKey: pub } });
    await this.finalizeSession(sid, remotePub);
  }

  public denyFriend(sid: string) {
    this.send({ t: "JOIN_DENY", sid });
  }

  public async sendMessage(sid: string, text: string) {
    if (!this.sessions[sid]) throw new Error("Session not found");

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      this.sessions[sid].cryptoKey,
      new TextEncoder().encode(JSON.stringify({ t: "MSG", data: text })),
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
      [sid, text],
    );
  }

  public async startCall(sid: string, mode: "Audio" | "Video" = "Audio") {
    try {
      if (!this.sessions[sid]) throw new Error("Session not found");

      const status = await navigator.permissions.query({
        name: "microphone" as any,
      });

      if (status.state === "denied") {
        this.emit(
          "error",
          "Microphone access denied. Please enable it in your browser settings.",
        );
        return;
      }

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(
          mode === "Audio" ? { audio: true } : { audio: true, video: true },
        );
      } catch (err) {
        console.error("getUserMedia failed", err);
        this.emit("error", "Microphone access is required to start the call.");
      }

      if (!stream) return;

      if (!this.audioContext) this.audioContext = new AudioContext();
      await this.audioContext.audioWorklet.addModule(
        "audioWorkletProcessor.js",
      );
      const source = this.audioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(
        this.audioContext,
        "call-processor",
      );
      source.connect(workletNode);
      workletNode.connect(this.audioContext.destination);

      workletNode.port.onmessage = async (event) => {
        const pcmBuffer = event.data as ArrayBuffer;
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv },
          this.sessions[sid].cryptoKey,
          pcmBuffer,
        );

        this.send({
          t: "CALL_AUDIO",
          sid,
          data: {
            payload: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
            iv: btoa(String.fromCharCode(...iv)),
          },
        });
      };
    } catch (err) {
      console.error("Could not start call:", err);
      this.emit(
        "error",
        "Call could not start. Make sure microphone access is allowed.",
      );
    }
  }

  public async acceptCall(sid: string) {
    this.send({ t: "CALL_ACCEPT", sid });
    this.emit("call_started", { sid, status: "connected" });
  }

  public rejectCall(sid: string) {
    this.send({ t: "CALL_REJECT", sid });
    this.emit("call_ended", sid);
  }

  public endCall(sid: string) {
    this.send({ t: "CALL_END", sid });
    this.emit("call_ended", sid);
  }

  public stopCall(sid: string) {
    this.send({ t: "CALL_END", sid });
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.emit("call_ended", sid);
  }

  // --- Internal Handlers ---
  private async handleFrame(frame: ServerFrame) {
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
        await this.handleMsg(sid, data.payload);
        break;
      case "PEER_ONLINE":
        if (this.sessions[sid]) this.sessions[sid].online = true;
        this.emit("presence_update", { sid, online: true });
        break;
      case "PEER_OFFLINE":
        if (this.sessions[sid]) this.sessions[sid].online = false;
        this.emit("presence_update", { sid, online: false });
        break;
      default:
        console.warn("Unknown frame type:", t);
        break;
    }
  }

  private async handleMsg(sid: string, payload: string) {
    if (!this.sessions[sid]) return;

    try {
      const combined = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
      const dec = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: combined.slice(0, 12) },
        this.sessions[sid].cryptoKey,
        combined.slice(12),
      );
      const { t, data } = JSON.parse(new TextDecoder().decode(dec));

      if (t === "MSG") await this.decryptAndStore(sid, data);
    } catch (e) {
      console.error("Failed to decrypt message", e);
    }
  }

  // --- Helpers ---
  public send(f: any) {
    socket.send(f);
  }

  private async finalizeSession(sid: string, remotePubB64: string) {
    const sharedKey = await this.deriveSharedKey(remotePubB64);
    this.sessions[sid] = { cryptoKey: sharedKey, online: false };
    const jwk = await crypto.subtle.exportKey("jwk", sharedKey);
    await queryDB(
      "INSERT OR REPLACE INTO sessions (sid, keyJWK) VALUES (?, ?)",
      [sid, JSON.stringify(jwk)],
    );
    this.emit("session_updated");
  }

  private async loadIdentity() {
    const privJWK = await getKeyFromSecureStorage("identity_priv");
    const pubJWK = await getKeyFromSecureStorage("identity_pub");

    if (privJWK && pubJWK) {
      this.identityKeyPair = {
        privateKey: await crypto.subtle.importKey(
          "jwk",
          JSON.parse(privJWK),
          { name: "ECDH", namedCurve: "P-256" },
          true,
          ["deriveKey"],
        ),
        publicKey: await crypto.subtle.importKey(
          "jwk",
          JSON.parse(pubJWK),
          { name: "ECDH", namedCurve: "P-256" },
          true,
          [],
        ),
      };
    } else {
      this.identityKeyPair = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey"],
      );
      await setKeyFromSecureStorage(
        "identity_priv",
        JSON.stringify(
          await crypto.subtle.exportKey("jwk", this.identityKeyPair.privateKey),
        ),
      );
      await setKeyFromSecureStorage(
        "identity_pub",
        JSON.stringify(
          await crypto.subtle.exportKey("jwk", this.identityKeyPair.publicKey),
        ),
      );
    }
  }

  private async loadSessions() {
    const rows = await queryDB("SELECT * FROM sessions");
    for (const row of rows) {
      this.sessions[row.sid] = {
        cryptoKey: await crypto.subtle.importKey(
          "jwk",
          JSON.parse(row.keyJWK),
          { name: "AES-GCM" },
          false,
          ["encrypt", "decrypt"],
        ),
        online: false,
      };
    }
  }

  public async exportPub() {
    const raw = await crypto.subtle.exportKey(
      "raw",
      this.identityKeyPair!.publicKey,
    );
    return btoa(String.fromCharCode(...new Uint8Array(raw)));
  }

  private async deriveSharedKey(pubB64: string) {
    const raw = Uint8Array.from(atob(pubB64), (c) => c.charCodeAt(0));
    const pub = await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );
    return crypto.subtle.deriveKey(
      { name: "ECDH", public: pub },
      this.identityKeyPair!.privateKey,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
  }

  private async decryptAndStore(sid: string, payload: string) {
    if (!this.sessions[sid]) return;
    try {
      const combined = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
      const dec = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: combined.slice(0, 12) },
        this.sessions[sid].cryptoKey,
        combined.slice(12),
      );
      const text = new TextDecoder().decode(dec);

      await queryDB(
        "INSERT INTO messages (sid, sender, text) VALUES (?, 'other', ?)",
        [sid, text],
      );
      this.emit("message", { sid, text, sender: "other" });
    } catch (e) {
      console.error("Failed to decrypt and store message", e);
    }
  }
}

export default ChatClient.getInstance();

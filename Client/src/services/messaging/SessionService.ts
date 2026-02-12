import { EventEmitter } from "events";
import { AuthService } from "../auth/AuthService";
import { queryDB, executeDB } from "../storage/sqliteService";
import { WorkerManager } from "../core/WorkerManager";
import socket from "../core/SocketManager";

export interface ChatSession {
  cryptoKey: CryptoKey;
  online: boolean;
  peerEmail?: string;
  peer_name_ver?: number;
  peer_avatar_ver?: number;
}

export class SessionService extends EventEmitter {
  private authService: AuthService;
  public sessions: Record<string, ChatSession> = {};

  constructor(authService: AuthService) {
    super();
    this.authService = authService;
  }

  public async encrypt(
    sid: string,
    data: string | Uint8Array | ArrayBuffer,
    priority: number,
  ): Promise<string> {
    const buffer =
      data instanceof Uint8Array ? (data.buffer as ArrayBuffer) : data;
    return WorkerManager.getInstance().encrypt(sid, buffer, priority);
  }

  public async decrypt(
    sid: string,
    payload: string,
    priority: number,
  ): Promise<ArrayBuffer | null> {
    try {
      return await WorkerManager.getInstance().decrypt(sid, payload, priority);
    } catch (e) {
      console.warn("[SessionService] Worker decryption failed:", e);
      return null;
    }
  }

  public async loadSessions() {
    this.sessions = {};
    const rows = await queryDB("SELECT * FROM sessions");
    for (const row of rows) {
      try {
        this.sessions[row.sid] = {
          cryptoKey: await crypto.subtle.importKey(
            "jwk",
            JSON.parse(row.keyJWK),
            { name: "AES-GCM" },
            false,
            ["encrypt", "decrypt"],
          ),
          online: false,
          peerEmail: row.peer_email,
        };
        const jwk = JSON.parse(row.keyJWK);
        await WorkerManager.getInstance().initSession(row.sid, jwk);
      } catch (e) {
        console.error("Failed to load session", row.sid, e);
      }
    }
  }

  public async finalizeSession(
    sid: string,
    remotePubB64: string,
    peerEmail?: string,
  ) {
    const sharedKey = await this.deriveSharedKey(remotePubB64);
    this.sessions[sid] = { cryptoKey: sharedKey, online: true, peerEmail };
    const jwk = await crypto.subtle.exportKey("jwk", sharedKey);
    await WorkerManager.getInstance().initSession(sid, jwk);
    await executeDB(
      "INSERT OR REPLACE INTO sessions (sid, keyJWK, peer_email) VALUES (?, ?, ?)",
      [sid, JSON.stringify(jwk), peerEmail || null],
    );
    this.emit("session_created", sid);
  }

  private async deriveSharedKey(pubB64: string) {
    if (!this.authService.identityKeyPair) {
      throw new Error("Identity not loaded");
    }
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
      this.authService.identityKeyPair.privateKey,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
  }

  public async connectToPeer(targetEmail: string) {
    if (!this.authService.userEmail) {
      throw new Error("Must be logged in to connect");
    }
    const pub = await this.authService.exportPub();
    socket.send({
      t: "CONNECT_REQ",
      data: { targetEmail, publicKey: pub },
      c: true,
      p: 0,
    });
  }

  public async acceptFriend(sid: string, remotePub: string) {
    const pub = await this.authService.exportPub();
    socket.send({
      t: "JOIN_ACCEPT",
      sid,
      data: { publicKey: pub },
      c: true,
      p: 0,
    });
    await this.finalizeSession(sid, remotePub);
  }

  public denyFriend(sid: string) {
    socket.send({ t: "JOIN_DENY", sid, c: true, p: 0 });
  }

  public getSession(sid: string) {
    return this.sessions[sid];
  }

  public setPeerOnline(sid: string, online: boolean) {
    if (this.sessions[sid]) {
      this.sessions[sid].online = online;
    }
  }
}

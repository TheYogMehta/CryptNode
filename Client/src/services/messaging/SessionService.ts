import { EventEmitter } from "events";
import { AuthService } from "../auth/AuthService";
import { AccountService } from "../auth/AccountService";
import { queryDB, executeDB } from "../storage/sqliteService";
import { WorkerManager } from "../core/WorkerManager";
import socket from "../core/SocketManager";
import { sha256 } from "../../utils/crypto";
import { StorageService } from "../storage/StorageService";

export interface ChatSession {
  cryptoKey: CryptoKey;
  online: boolean;
  peerEmail?: string;
  peerEmailHash?: string;
  peerName?: string;
  peerAvatar?: string;
  peer_name_ver?: number;
  peer_avatar_ver?: number;
  isConnected?: boolean;
}

export class SessionService extends EventEmitter {
  private authService: AuthService;
  public sessions: Record<string, ChatSession> = {};
  public connectedSids: Set<string> = new Set();
  private static readonly MAX_HANDSHAKE_AVATAR_B64 = 160 * 1024;

  constructor(authService: AuthService) {
    super();
    this.authService = authService;
  }

  private normalizeEmail(email?: string | null): string {
    return (email || "").trim().toLowerCase();
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
    const previousSessions = this.sessions;
    this.sessions = {};
    const rows = await queryDB("SELECT * FROM sessions");
    for (const row of rows) {
      try {
        const normalizedPeerEmail = this.normalizeEmail(row.peer_email);
        const peerEmailHash =
          row.peer_hash ||
          (normalizedPeerEmail ? await sha256(normalizedPeerEmail) : undefined);
        this.sessions[row.sid] = {
          cryptoKey: await crypto.subtle.importKey(
            "jwk",
            JSON.parse(row.keyJWK),
            { name: "AES-GCM" },
            false,
            ["encrypt", "decrypt"],
          ),
          online: previousSessions[row.sid]?.online || false,
          peerEmail: normalizedPeerEmail || undefined,
          peerEmailHash,
          peerName: row.peer_name || undefined,
          peerAvatar: row.peer_avatar || undefined,
          peer_name_ver: row.peer_name_ver || 0,
          peer_avatar_ver: row.peer_avatar_ver || 0,
          isConnected: this.connectedSids.has(row.sid),
        };
        const jwk = JSON.parse(row.keyJWK);
        await WorkerManager.getInstance().initSession(row.sid, jwk);
      } catch (e) {
        console.error("Failed to load session", row.sid, e);
      }
    }
  }

  private async getLocalProfileForHandshake() {
    const rows = await queryDB(
      "SELECT public_name, public_avatar, name_version, avatar_version FROM me WHERE id = 1",
    );
    const me = rows?.[0] || {
      public_name: undefined,
      public_avatar: undefined,
      name_version: 1,
      avatar_version: 1,
    };

    let avatarData: string | undefined = undefined;
    if (me.public_avatar) {
      if (
        typeof me.public_avatar === "string" &&
        me.public_avatar.startsWith("data:")
      ) {
        avatarData = me.public_avatar;
      } else if (
        typeof me.public_avatar === "string" &&
        (me.public_avatar.startsWith("http://") ||
          me.public_avatar.startsWith("https://"))
      ) {
        avatarData = me.public_avatar;
      } else {
        try {
          const fileSrc = await StorageService.getFileSrc(
            me.public_avatar,
            "image/jpeg",
          );
          if (fileSrc) avatarData = fileSrc;
        } catch (_e) {}
      }
    }

    let displayName = me.public_name || undefined;
    if (!displayName || !avatarData) {
      try {
        const currentEmail = this.normalizeEmail(
          this.authService.userEmail || "",
        );
        const accounts = await AccountService.getAccounts();
        const account = accounts.find(
          (acc) => this.normalizeEmail(acc.email) === currentEmail,
        );
        if (!displayName && account?.displayName) {
          displayName = account.displayName;
        }
        if (!avatarData && account?.avatarUrl) {
          if (
            account.avatarUrl.startsWith("data:") ||
            account.avatarUrl.startsWith("http://") ||
            account.avatarUrl.startsWith("https://")
          ) {
            avatarData = account.avatarUrl;
          } else {
            const fileSrc = await StorageService.getFileSrc(
              account.avatarUrl,
              "image/jpeg",
            );
            if (fileSrc) avatarData = fileSrc;
          }
        }
      } catch (_e) {}
    }

    if (
      avatarData &&
      avatarData.length > SessionService.MAX_HANDSHAKE_AVATAR_B64
    ) {
      avatarData = undefined;
    }

    return {
      name: displayName,
      avatar: avatarData,
      nameVersion: Number(me.name_version || 1),
      avatarVersion: Number(me.avatar_version || 1),
    };
  }

  public async finalizeSession(
    sid: string,
    remotePubB64: string,
    peerEmail?: string,
    peerEmailHash?: string,
    peerName?: string,
    peerAvatar?: string,
    peerNameVer?: number,
    peerAvatarVer?: number,
  ) {
    const sharedKey = await this.deriveSharedKey(remotePubB64);
    const normalizedPeerEmail = this.normalizeEmail(peerEmail);
    const resolvedPeerEmailHash =
      peerEmailHash ||
      (normalizedPeerEmail ? await sha256(normalizedPeerEmail) : undefined);

    let peerAvatarFile: string | undefined = undefined;
    if (peerAvatar) {
      let avatarBase64 = peerAvatar;
      if (peerAvatar.startsWith("data:")) {
        avatarBase64 = peerAvatar.split(",")[1] || "";
      }
      if (avatarBase64.length > 256) {
        try {
          peerAvatarFile = await StorageService.saveProfileImage(
            avatarBase64,
            sid,
          );
        } catch (_e) {
          peerAvatarFile = undefined;
        }
      } else {
        peerAvatarFile = peerAvatar;
      }
    }

    const resolvedPeerNameVer = peerName ? Number(peerNameVer || 0) : 0;
    const resolvedPeerAvatarVer = peerAvatarFile
      ? Number(peerAvatarVer || 0)
      : 0;

    this.sessions[sid] = {
      cryptoKey: sharedKey,
      online: true,
      peerEmail: normalizedPeerEmail || undefined,
      peerEmailHash: resolvedPeerEmailHash,
      peerName: peerName || undefined,
      peerAvatar: peerAvatarFile || undefined,
      peer_name_ver: resolvedPeerNameVer,
      peer_avatar_ver: resolvedPeerAvatarVer,
      isConnected: true,
    };
    const jwk = await crypto.subtle.exportKey("jwk", sharedKey);
    await WorkerManager.getInstance().initSession(sid, jwk);
    await executeDB(
      "INSERT OR IGNORE INTO sessions (sid, keyJWK) VALUES (?, ?)",
      [sid, JSON.stringify(jwk)],
    );
    await executeDB(
      `UPDATE sessions
       SET keyJWK = ?,
           peer_email = COALESCE(?, peer_email),
           peer_hash = COALESCE(?, peer_hash),
           peer_name = COALESCE(?, peer_name),
           peer_avatar = COALESCE(?, peer_avatar),
           peer_name_ver = CASE
             WHEN ? > COALESCE(peer_name_ver, 0) THEN ?
             ELSE COALESCE(peer_name_ver, 0)
           END,
           peer_avatar_ver = CASE
             WHEN ? > COALESCE(peer_avatar_ver, 0) THEN ?
             ELSE COALESCE(peer_avatar_ver, 0)
           END
       WHERE sid = ?`,
      [
        JSON.stringify(jwk),
        normalizedPeerEmail || null,
        resolvedPeerEmailHash || null,
        peerName || null,
        peerAvatarFile || null,
        resolvedPeerNameVer,
        resolvedPeerNameVer,
        resolvedPeerAvatarVer,
        resolvedPeerAvatarVer,
        sid,
      ],
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
    // Step 1: Get Public Key
    socket.send({
      t: "GET_PUBLIC_KEY",
      data: {
        targetEmail: this.normalizeEmail(targetEmail),
      },
      c: true,
      p: 0,
    });
  }

  public async sendFriendRequest(targetEmail: string, remotePubB64: string) {
    try {
      if (!this.authService.userEmail) throw new Error("Not logged in");

      const sharedKey = await this.deriveSharedKey(remotePubB64);
      const profile = await this.getLocalProfileForHandshake();

      const packetData = JSON.stringify({
        email: this.normalizeEmail(this.authService.userEmail),
        name: profile.name,
        avatar: profile.avatar,
        nameVersion: profile.nameVersion,
        avatarVersion: profile.avatarVersion,
        timestamp: Date.now(),
      });

      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        sharedKey,
        new TextEncoder().encode(packetData),
      );

      // Format: Base64(IV) + "." + Base64(Cipher)
      const ivB64 = btoa(String.fromCharCode(...new Uint8Array(iv)));
      const cipherB64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
      const encryptedPacket = `${ivB64}.${cipherB64}`;

      socket.send({
        t: "FRIEND_REQUEST",
        data: {
          targetEmail: this.normalizeEmail(targetEmail),
          encryptedPacket,
        },
        c: true,
        p: 0,
      });
      return true;
    } catch (e) {
      console.error("Failed to send friend request", e);
      throw e;
    }
  }

  public async acceptFriend(
    targetEmail: string,
    remotePubB64: string,
    senderHash: string,
  ) {
    try {
      const sharedKey = await this.deriveSharedKey(remotePubB64);
      const profile = await this.getLocalProfileForHandshake();

      const packetData = JSON.stringify({
        email: this.normalizeEmail(this.authService.userEmail),
        name: profile.name,
        avatar: profile.avatar,
        nameVersion: profile.nameVersion,
        avatarVersion: profile.avatarVersion,
        timestamp: Date.now(),
      });

      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        sharedKey,
        new TextEncoder().encode(packetData),
      );

      const ivB64 = btoa(String.fromCharCode(...new Uint8Array(iv)));
      const cipherB64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
      const encryptedPacket = `${ivB64}.${cipherB64}`;

      // Derive SID deterministically
      const myEmail = this.normalizeEmail(this.authService.userEmail);
      const otherEmail = this.normalizeEmail(targetEmail);
      const [u1, u2] = [myEmail, otherEmail].sort();
      const sid = await sha256(u1 + ":" + u2);

      await this.finalizeSession(
        sid,
        remotePubB64,
        targetEmail,
        undefined,
        undefined,
        undefined,
      );

      socket.send({
        t: "FRIEND_ACCEPT",
        data: {
          targetEmail,
          encryptedPacket,
        },
        c: true,
        p: 0,
      });

      return sid;
    } catch (e) {
      console.error("Failed to accept friend", e);
      throw e;
    }
  }

  public denyFriend(targetEmail: string) {
    socket.send({
      t: "FRIEND_DENY",
      data: { targetEmail },
      c: true,
      p: 0,
    });
  }

  public blockUser(targetEmail: string) {
    socket.send({
      t: "BLOCK_USER",
      data: { targetEmail },
      c: true,
      p: 0,
    });
  }

  public getSession(sid: string) {
    return this.sessions[sid];
  }

  public async decryptFriendRequest(
    encryptedPacket: string,
    remotePubB64: string,
  ) {
    try {
      const sharedKey = await this.deriveSharedKey(remotePubB64);
      const [ivB64, cipherB64] = encryptedPacket.split(".");
      if (!ivB64 || !cipherB64) throw new Error("Invalid packet format");

      const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
      const cipher = Uint8Array.from(atob(cipherB64), (c) => c.charCodeAt(0));

      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        sharedKey,
        cipher,
      );

      const jsonStr = new TextDecoder().decode(decrypted);
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error("Decryption failed", e);
      return null;
    }
  }

  public async handleFriendAccept(data: {
    publicKey: string;
    encryptedPacket: string;
  }) {
    const profile = await this.decryptFriendRequest(
      data.encryptedPacket,
      data.publicKey,
    );
    if (!profile) throw new Error("Failed to decrypt accept packet");

    const myEmail = this.normalizeEmail(this.authService.userEmail);
    const otherEmail = this.normalizeEmail(profile.email);
    const [u1, u2] = [myEmail, otherEmail].sort();
    const sid = await sha256(u1 + ":" + u2);

    await this.finalizeSession(
      sid,
      data.publicKey,
      profile.email,
      undefined,
      profile.name,
      profile.avatar,
      profile.nameVersion,
      profile.avatarVersion,
    );
    return sid;
  }

  public async handleFriendDeny(data: any) {
    console.log("Friend request denied by", data.targetEmail);
  }

  public async handleProfileUpdate(sid: string, data: any) {
    console.log("Profile update received", sid, data);
  }

  public setPeerOnline(sid: string, isOnline: boolean) {
    if (this.sessions[sid]) {
      this.sessions[sid].online = isOnline;
      this.emit("session_updated");
    }
  }

  public handleSessionList(
    list: { sid: string; online: boolean; peerHash: string }[],
  ) {
    let changed = false;
    this.connectedSids = new Set(list.map((item) => item.sid));
    for (const sid of Object.keys(this.sessions)) {
      const isConnected = this.connectedSids.has(sid);
      if (this.sessions[sid].isConnected !== isConnected) {
        this.sessions[sid].isConnected = isConnected;
        changed = true;
      }
    }

    for (const item of list) {
      if (this.sessions[item.sid]) {
        if (this.sessions[item.sid].online !== item.online) {
          this.sessions[item.sid].online = item.online;
          changed = true;
        }
        if (!this.sessions[item.sid].peerEmailHash && item.peerHash) {
          this.sessions[item.sid].peerEmailHash = item.peerHash;
        }
      } else {
        console.warn(
          "[SessionService] Server has session not found locally:",
          item.sid,
        );
      }
    }
    if (changed) {
      this.emit("session_updated");
    }
  }
}

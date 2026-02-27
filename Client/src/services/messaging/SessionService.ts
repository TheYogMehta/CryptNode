import { EventEmitter } from "events";
import { AuthService } from "../auth/AuthService";
import { AccountService } from "../auth/AccountService";
import {
  queryDB,
  executeDB,
  addBlockedUser,
  removeBlockedUser,
} from "../storage/sqliteService";
import { WorkerManager } from "../core/WorkerManager";
import socket from "../core/SocketManager";
import { sha256 } from "../../utils/crypto";
import { StorageService } from "../storage/StorageService";

export interface ChatSession {
  cryptoKeys: Record<string, CryptoKey>;
  online: boolean;
  peerEmail?: string;
  peerEmailHash?: string;
  peerName?: string;
  peerAvatar?: string;
  peer_name_ver?: number;
  peer_avatar_ver?: number;
  isConnected?: boolean;
  peerPubKeys?: string[];
  ownPubKeys?: string[];
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
  ): Promise<Record<string, string>> {
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
        const jwksMap: Record<string, any> = JSON.parse(row.keyJWK || "{}");
        const cryptoKeysMap: Record<string, CryptoKey> = {};

        for (const [pubKey, jwk] of Object.entries(jwksMap)) {
          if (!jwk || typeof jwk !== "object") continue;
          try {
            cryptoKeysMap[pubKey] = await crypto.subtle.importKey(
              "jwk",
              jwk as JsonWebKey,
              { name: "AES-GCM" },
              false,
              ["encrypt", "decrypt"],
            );
          } catch (importErr) {
            console.warn(
              `[SessionService] Skipping corrupted JWK for ${pubKey}`,
              importErr,
            );
          }
        }

        const peerPubKeysList = row.peer_pub_keys
          ? JSON.parse(row.peer_pub_keys)
          : [];

        this.sessions[row.sid] = {
          cryptoKeys: cryptoKeysMap,
          online: previousSessions[row.sid]?.online || false,
          peerEmail: normalizedPeerEmail || undefined,
          peerEmailHash,
          peerName: row.peer_name || undefined,
          peerAvatar: row.peer_avatar || undefined,
          peer_name_ver: row.peer_name_ver || 0,
          peer_avatar_ver: row.peer_avatar_ver || 0,
          isConnected: this.connectedSids.has(row.sid),
          peerPubKeys: peerPubKeysList,
        };

        await WorkerManager.getInstance().initSession(row.sid, jwksMap);
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
    remotePubB64s: string[],
    peerEmail?: string,
    peerEmailHash?: string,
    peerName?: string,
    peerAvatar?: string,
    peerNameVer?: number,
    peerAvatarVer?: number,
    ownPubKeys?: string[],
  ) {
    const cryptoKeysMap: Record<string, CryptoKey> = {};
    const jwksMap: Record<string, any> = {};

    const allKeysForDerivation = new Set([
      ...remotePubB64s,
      ...(ownPubKeys || []),
    ]);

    for (const pubB64 of allKeysForDerivation) {
      if (!pubB64) continue;
      const sharedKey = await this.deriveSharedKey(pubB64);
      cryptoKeysMap[pubB64] = sharedKey;
      jwksMap[pubB64] = await crypto.subtle.exportKey("jwk", sharedKey);
    }
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
      cryptoKeys: cryptoKeysMap,
      online: true,
      peerEmail: normalizedPeerEmail || undefined,
      peerEmailHash: resolvedPeerEmailHash,
      peerName: peerName || undefined,
      peerAvatar: peerAvatarFile || undefined,
      peer_name_ver: resolvedPeerNameVer,
      peer_avatar_ver: resolvedPeerAvatarVer,
      isConnected: true,
      peerPubKeys: remotePubB64s,
      ownPubKeys: ownPubKeys || [],
    };

    await WorkerManager.getInstance().initSession(sid, jwksMap);
    await executeDB(
      "INSERT OR IGNORE INTO sessions (sid, keyJWK, peer_pub_keys) VALUES (?, ?, ?)",
      [sid, JSON.stringify(jwksMap), JSON.stringify(remotePubB64s)],
    );
    await executeDB(
      `UPDATE sessions
       SET keyJWK = ?,
           peer_pub_keys = ?,
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
        JSON.stringify(jwksMap),
        JSON.stringify(remotePubB64s),
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

  public async sendFriendRequest(targetEmail: string, remotePubB64s: string[]) {
    try {
      if (!this.authService.userEmail) throw new Error("Not logged in");
      if (!remotePubB64s.length) throw new Error("No remote keys provided");

      // Handshakes only need to encrypt against one known device to notify the peer.
      const sharedKey = await this.deriveSharedKey(remotePubB64s[0]);
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
    remotePubB64s: string[],
    senderHash: string,
  ) {
    try {
      if (!remotePubB64s.length) throw new Error("No remote keys provided");
      const sharedKey = await this.deriveSharedKey(remotePubB64s[0]);
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
        remotePubB64s,
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

  public async blockUser(targetEmail: string) {
    const norm = this.normalizeEmail(targetEmail);
    // Send to server
    socket.send({
      t: "BLOCK_USER",
      data: { targetEmail: norm },
      c: true,
      p: 0,
    });
    // Store locally
    await addBlockedUser(norm);
  }

  public async unblockUser(targetEmail: string) {
    const norm = this.normalizeEmail(targetEmail);
    socket.send({
      t: "UNBLOCK_USER",
      data: { targetEmail: norm },
      c: true,
      p: 0,
    });
    // Remove locally
    await removeBlockedUser(norm);
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

  public async sendDeviceLinkRequest(targetPubKey: string) {
    try {
      const sharedKey = await this.deriveSharedKey(targetPubKey);
      const specs = JSON.stringify({
        os: navigator.userAgent,
        name: "CryptNode App",
        timestamp: Date.now(),
      });

      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        sharedKey,
        new TextEncoder().encode(specs),
      );

      const ivB64 = btoa(String.fromCharCode(...new Uint8Array(iv)));
      const cipherB64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
      const encryptedSpecs = `${ivB64}.${cipherB64}`;

      socket.send({
        t: "DEVICE_LINK_REQUEST",
        data: { targetPubKey, encryptedSpecs },
        c: true,
        p: 0,
      });
    } catch (e) {
      console.error("Failed to send device link request", e);
      throw e;
    }
  }

  public async decryptDeviceLinkRequest(
    encryptedSpecs: string,
    senderPubKey: string,
  ) {
    if (!encryptedSpecs || !encryptedSpecs.includes(".")) return null;
    try {
      const sharedKey = await this.deriveSharedKey(senderPubKey);
      const [ivB64, cipherB64] = encryptedSpecs.split(".");

      const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
      const cipher = Uint8Array.from(atob(cipherB64), (c) => c.charCodeAt(0));

      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        sharedKey,
        cipher,
      );

      return JSON.parse(new TextDecoder().decode(decrypted)) as {
        os: string;
        name: string;
        timestamp: number;
      };
    } catch (e) {
      console.error("Failed to decrypt device link request", e);
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
      [data.publicKey],
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
    list: {
      sid: string;
      online: boolean;
      peerHash: string;
      peerPubKeys?: string[];
      ownPubKeys?: string[];
    }[],
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

        // Dynamic Key Rotation if peer app was reinstalled or devices changed
        const currentKeys = JSON.stringify({
          peer: this.sessions[item.sid].peerPubKeys || [],
          own: this.sessions[item.sid].ownPubKeys || [],
        });
        const newKeys = JSON.stringify({
          peer: item.peerPubKeys || [],
          own: item.ownPubKeys || [],
        });
        if ((item.peerPubKeys || item.ownPubKeys) && currentKeys !== newKeys) {
          console.log(
            `[SessionService] PublicKeys for ${item.sid} changed. Re-deriving shared keys...`,
          );
          this.finalizeSession(
            item.sid,
            item.peerPubKeys || [],
            this.sessions[item.sid].peerEmail,
            this.sessions[item.sid].peerEmailHash,
            this.sessions[item.sid].peerName,
            this.sessions[item.sid].peerAvatar,
            this.sessions[item.sid].peer_name_ver,
            this.sessions[item.sid].peer_avatar_ver,
            item.ownPubKeys || this.sessions[item.sid].ownPubKeys,
          ).catch((e) =>
            console.error(
              "Failed to re-derive session key on pubKey rotation:",
              e,
            ),
          );
        }
      } else {
        console.warn(
          "[SessionService] Server has session not found locally:",
          item.sid,
        );
        if ((item.peerPubKeys || item.ownPubKeys) && item.peerHash) {
          console.log(
            "[SessionService] Reconstructing missing local session from server data",
            item.sid,
          );
          this.finalizeSession(
            item.sid,
            item.peerPubKeys || [],
            undefined,
            item.peerHash,
            undefined,
            undefined,
            0,
            0,
            item.ownPubKeys,
          ).catch((e) =>
            console.error(
              "Failed to auto-restore session from server list:",
              e,
            ),
          );
        }
      }
    }
    if (changed) {
      this.emit("session_updated");
    }
  }
}

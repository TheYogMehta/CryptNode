import { EventEmitter } from "events";
import { AuthService } from "../auth/AuthService";
import { AccountService } from "../auth/AccountService";
import {
  queryDB,
  executeDB,
  addBlockedUser,
  removeBlockedUser,
  removePendingRequest,
  acceptPendingRequest,
  updateOutboundRequestHistoryStatus,
} from "../storage/sqliteService";
import { WorkerManager } from "../core/WorkerManager";
import socket from "../core/SocketManager";
import { sha256, bufferToBase64 } from "../../utils/crypto";
import { StorageService } from "../storage/StorageService";
import { avatarCacheService } from "../storage/AvatarCacheService";


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
  notes?: string;
}

export class SessionService extends EventEmitter {
  private authService: AuthService;
  public sessions: Record<string, ChatSession> = {};
  public connectedSids: Set<string> = new Set();
  private finalizeLocks: Map<string, Promise<void>> = new Map();
  private pendingPresenceBySid: Map<
    string,
    { online: boolean; peerPubKeys: string[] }
  > = new Map();
  private static readonly MAX_HANDSHAKE_AVATAR_B64 = 512 * 1024;

  constructor(authService: AuthService) {
    super();
    this.authService = authService;
  }

  private normalizeEmail(email?: string | null): string {
    return (email || "").trim().toLowerCase();
  }

  private consumePendingPresence(
    sid: string,
    peerPubKeys: string[],
    online: boolean,
  ) {
    const pending = this.pendingPresenceBySid.get(sid);
    if (!pending) {
      return { peerPubKeys, online };
    }

    this.pendingPresenceBySid.delete(sid);
    return {
      peerPubKeys: pending.peerPubKeys.length > 0 ? pending.peerPubKeys : peerPubKeys,
      online: pending.online,
    };
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
    const newSessions: Record<string, ChatSession> = {};
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
              true,
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
        const ownPubKeysList = row.own_pub_keys
          ? JSON.parse(row.own_pub_keys)
          : [];

        newSessions[row.sid] = {
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
          ownPubKeys: ownPubKeysList,
          notes: row.notes || undefined,
        };

        // Don't await worker init blindly, do it synchronously or let it buffer?
        // Let's await it since it was awaited before
        await WorkerManager.getInstance().initSession(row.sid, jwksMap);
      } catch (e) {
        console.error("Failed to load session", row.sid, e);
      }
    }

    // Replace the sessions map entirely with what the current DB contains.
    // Previously this spread old sessions first then overlaid newSessions, which
    // caused stale sessions from a previous account (after an account switch) to
    // leak into the new user's in-memory map and corrupt peerName/peerEmailHash.
    // We still preserve `online` status for sessions that exist in both maps so that
    // concurrent finalizeSession calls (e.g. SESSION_LIST arriving mid-load) aren't lost.
    for (const sid of Object.keys(newSessions)) {
      if (previousSessions[sid]) {
        newSessions[sid].online = previousSessions[sid].online;
      }
    }
    this.sessions = newSessions;
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
          const fileSrc = await StorageService.getProfileImage(
            me.public_avatar,
          );
          if (fileSrc) avatarData = fileSrc;
        } catch (_e) { }
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
      } catch (_e) { }
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
    online: boolean = true,
  ) {
    const runFinalize = async () => {
      const pendingPresence = this.consumePendingPresence(
        sid,
        remotePubB64s,
        online,
      );
      const effectivePeerPubKeys = pendingPresence.peerPubKeys;
      const effectiveOnline = pendingPresence.online;
      const normalizedPeerEmail = this.normalizeEmail(peerEmail);
      const resolvedPeerEmailHash =
        peerEmailHash ||
        (normalizedPeerEmail ? await sha256(normalizedPeerEmail) : undefined);

      // Check if another finalization just gave us these exact keys.
      if (this.sessions[sid]) {
        const currentKeysStr = JSON.stringify({
          peer: [...(this.sessions[sid].peerPubKeys || [])].sort(),
          own: [...(this.sessions[sid].ownPubKeys || [])].sort(),
        });
        const incomingKeysStr = JSON.stringify({
          peer: [...(effectivePeerPubKeys || [])].sort(),
          own: [...(ownPubKeys || [])].sort(),
        });
        if (currentKeysStr === incomingKeysStr) {
          // Keys are strictly identical, just update metadata and abort re-derivation.
          const resolvedPeerNameVer = peerName ? Number(peerNameVer || 0) : 0;
          const resolvedPeerAvatarVer = peerAvatarVer
            ? Number(peerAvatarVer)
            : 0;

          Object.assign(this.sessions[sid], {
            peerEmail: normalizedPeerEmail || this.sessions[sid].peerEmail,
            peerEmailHash:
              resolvedPeerEmailHash || this.sessions[sid].peerEmailHash,
            peerName: peerName || this.sessions[sid].peerName,
            peer_name_ver: Math.max(
              resolvedPeerNameVer,
              this.sessions[sid].peer_name_ver || 0,
            ),
            peer_avatar_ver: Math.max(
              resolvedPeerAvatarVer,
              this.sessions[sid].peer_avatar_ver || 0,
            ),
            online: effectiveOnline,
            isConnected: true,
          });
          this.connectedSids.add(sid);
          return;
        }
      }

      if (!this.sessions[sid]) {
        this.sessions[sid] = {
          cryptoKeys: {},
          online: effectiveOnline,
          isConnected: true,
        };
      }

      // Synchronously assign metadata upfront so that synchronous event orchestrators
      // checking `peerEmailHash` don't find it missing while crypto deriving is pending.
      // Also assign public keys so that concurrent calls don't think keys need rotating.
      this.sessions[sid].peerEmail =
        normalizedPeerEmail || this.sessions[sid].peerEmail;
      this.sessions[sid].peerEmailHash =
        resolvedPeerEmailHash || this.sessions[sid].peerEmailHash;
      this.sessions[sid].online = effectiveOnline;
      this.sessions[sid].peerPubKeys = effectivePeerPubKeys;
      this.sessions[sid].ownPubKeys = ownPubKeys || [];

      // Start with existing keys to avoid losing keys that might still be needed
      // for synced or in-flight messages (e.g. from other devices).
      const cryptoKeysMap: Record<string, CryptoKey> = {
        ...this.sessions[sid].cryptoKeys,
      };
      const jwksMap: Record<string, any> = {};

      const allKeysForDerivation = new Set([
        ...effectivePeerPubKeys,
        ...(ownPubKeys || []),
      ]);

      for (const pubB64 of allKeysForDerivation) {
        if (!pubB64 || cryptoKeysMap[pubB64]) continue;
        try {
          const sharedKey = await this.deriveSharedKey(pubB64);
          cryptoKeysMap[pubB64] = sharedKey;
        } catch (e) {
          console.warn(
            `[SessionService] Failed to derive key for ${pubB64}`,
            e,
          );
        }
      }

      // Always export all current keys to sync with worker
      for (const [pubB64, key] of Object.entries(cryptoKeysMap)) {
        jwksMap[pubB64] = await crypto.subtle.exportKey("jwk", key);
      }

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
            // Bust cache so components re-fetch the newly saved file
            avatarCacheService.bust(peerAvatarFile);
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

      Object.assign(this.sessions[sid], {
        cryptoKeys: cryptoKeysMap,
        peerEmail: normalizedPeerEmail || this.sessions[sid].peerEmail,
        peerEmailHash:
          resolvedPeerEmailHash || this.sessions[sid].peerEmailHash,
        peerName: peerName || this.sessions[sid].peerName,
        peerAvatar: peerAvatarFile || this.sessions[sid].peerAvatar,
        peer_name_ver: Math.max(
          resolvedPeerNameVer,
          this.sessions[sid].peer_name_ver || 0,
        ),
        peer_avatar_ver: Math.max(
          resolvedPeerAvatarVer,
          this.sessions[sid].peer_avatar_ver || 0,
        ),
        isConnected: true,
        peerPubKeys: effectivePeerPubKeys,
        ownPubKeys: ownPubKeys || [],
      });
      this.connectedSids.add(sid);

      await WorkerManager.getInstance().initSession(sid, jwksMap);
      await executeDB(
        "INSERT OR IGNORE INTO sessions (sid, keyJWK, peer_pub_keys, own_pub_keys) VALUES (?, ?, ?, ?)",
        [
          sid,
          JSON.stringify(jwksMap),
          JSON.stringify(effectivePeerPubKeys),
          JSON.stringify(ownPubKeys || []),
        ],
      );
      await executeDB(
        `UPDATE sessions
         SET keyJWK = ?,
             peer_pub_keys = ?,
             own_pub_keys = ?,
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
          JSON.stringify(effectivePeerPubKeys),
          JSON.stringify(ownPubKeys || []),
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
    };

    let lock = this.finalizeLocks.get(sid) || Promise.resolve();
    lock = lock
      .then(() => runFinalize())
      .catch((e) => {
        console.error("[SessionService] finalizeSession error:", e);
      });
    this.finalizeLocks.set(sid, lock);
    await lock;
  }

  private async deriveSharedKey(pubB64: string) {
    if (!this.authService.identityKeyPair) {
      console.warn(
        "[SessionService] Identity not loaded. Attempting to load...",
      );
      await this.authService.loadIdentity();
      if (!this.authService.identityKeyPair) {
        throw new Error("Identity not loaded");
      }
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

      const profile = await this.getLocalProfileForHandshake();
      const packetData = JSON.stringify({
        email: this.normalizeEmail(this.authService.userEmail),
        name: profile.name,
        avatar: profile.avatar,
        nameVersion: profile.nameVersion,
        avatarVersion: profile.avatarVersion,
        timestamp: Date.now(),
      });

      const payloads: Array<{ publicKey: string; encryptedPacket: string }> =
        [];

      for (const pubB64 of remotePubB64s) {
        if (!pubB64) continue;
        try {
          const sharedKey = await this.deriveSharedKey(pubB64);
          const iv = crypto.getRandomValues(new Uint8Array(12));
          const encrypted = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            sharedKey,
            new TextEncoder().encode(packetData),
          );

          const ivB64 = bufferToBase64(new Uint8Array(iv));
          const cipherB64 = bufferToBase64(new Uint8Array(encrypted));
          payloads.push({
            publicKey: pubB64,
            encryptedPacket: `${ivB64}.${cipherB64}`,
          });
        } catch (err) {
          console.warn(
            `[SessionService] Failed to encrypt handshake for key ${pubB64}`,
            err,
          );
        }
      }

      if (payloads.length === 0) {
        throw new Error(
          "Failed to encrypt friend request for any target keys.",
        );
      }

      socket.send({
        t: "FRIEND_REQUEST",
        data: {
          targetEmail: this.normalizeEmail(targetEmail),
          payloads,
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

      const profile = await this.getLocalProfileForHandshake();
      const packetData = JSON.stringify({
        email: this.normalizeEmail(this.authService.userEmail),
        name: profile.name,
        avatar: profile.avatar,
        nameVersion: profile.nameVersion,
        avatarVersion: profile.avatarVersion,
        timestamp: Date.now(),
      });

      const payloads: Array<{ publicKey: string; encryptedPacket: string }> =
        [];

      for (const pubB64 of remotePubB64s) {
        if (!pubB64) continue;
        try {
          const sharedKey = await this.deriveSharedKey(pubB64);
          const iv = crypto.getRandomValues(new Uint8Array(12));
          const encrypted = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            sharedKey,
            new TextEncoder().encode(packetData),
          );

          const ivB64 = bufferToBase64(new Uint8Array(iv));
          const cipherB64 = bufferToBase64(new Uint8Array(encrypted));
          payloads.push({
            publicKey: pubB64,
            encryptedPacket: `${ivB64}.${cipherB64}`,
          });
        } catch (err) {
          console.warn(
            `[SessionService] Failed to encrypt accept for key ${pubB64}`,
            err,
          );
        }
      }

      if (payloads.length === 0) {
        throw new Error(
          "Failed to encrypt accept request for any target keys.",
        );
      }

      // Derive SID deterministically
      const myEmail = this.normalizeEmail(this.authService.userEmail);
      const otherEmail = this.normalizeEmail(targetEmail);
      const [u1, u2] = [myEmail, otherEmail].sort();
      const sid = await sha256(u1 + ":" + u2);

      return new Promise<string>((resolve, reject) => {
        const handler = (data: any) => {
          if (data.targetEmail === targetEmail) {
            socket.off("FRIEND_ACCEPTED_ACK", handler);
            queryDB("SELECT name, avatar FROM pending_requests WHERE email = ? LIMIT 1", [this.normalizeEmail(targetEmail)])
              .then((rows) => {
                const pUser = rows && rows.length > 0 ? rows[0] : null;
                return acceptPendingRequest(targetEmail).then(() => pUser);
              })
              .then((pUser) =>
                this.finalizeSession(
                  sid,
                  remotePubB64s,
                  targetEmail,
                  undefined,
                  pUser?.name,
                  pUser?.avatar,
                  pUser?.name ? 1 : undefined,    // set ver=1 if we have name
                  pUser?.avatar ? 1 : undefined,   // set ver=1 if we have avatar
                  undefined,
                  false,
                ),
              )
              .then(() => resolve(sid))
              .catch(reject);
          }
        };

        socket.on("FRIEND_ACCEPTED_ACK", handler);

        socket.send({
          t: "FRIEND_ACCEPT",
          data: {
            targetEmail,
            payloads,
          },
          c: true,
          p: 0,
        });

        // Timeout in case server never acks
        setTimeout(() => {
          socket.off("FRIEND_ACCEPTED_ACK", handler);
          reject(new Error("Timeout waiting for friend accept ACK"));
        }, 10000);
      });
    } catch (e) {
      console.error("Failed to accept friend", e);
      throw e;
    }
  }

  public async denyFriend(targetEmail: string) {
    socket.send({
      t: "FRIEND_DENY",
      data: { targetEmail },
      c: true,
      p: 0,
    });
    await removePendingRequest(targetEmail);
  }

  public async denyFriendByHash(targetHash: string, skipNetwork?: boolean) {
    if (!skipNetwork) {
      socket.send({
        t: "FRIEND_DENY",
        data: { targetHash },
        c: true,
        p: 0,
      });
    }
    await executeDB("DELETE FROM pending_requests WHERE senderHash = ?", [
      targetHash,
    ]);
  }

  public async blockUser(targetEmail: string) {
    const norm = this.normalizeEmail(targetEmail);
    const targetHash = await sha256(norm);
    socket.send({
      t: "BLOCK_USER",
      data: { targetEmail: norm },
      c: true,
      p: 0,
    });
    await addBlockedUser(norm);
    await addBlockedUser(targetHash);
    await removePendingRequest(norm);
    await executeDB("DELETE FROM pending_requests WHERE senderHash = ?", [
      targetHash,
    ]);
    this.emit("block_list_changed");
  }

  public async blockUserByHash(targetHash: string) {
    socket.send({
      t: "BLOCK_USER",
      data: { targetHash },
      c: true,
      p: 0,
    });
    await addBlockedUser(targetHash);
    await executeDB("DELETE FROM pending_requests WHERE senderHash = ?", [
      targetHash,
    ]);
    this.emit("block_list_changed");
  }

  public async unblockUser(targetEmail: string) {
    const norm = this.normalizeEmail(targetEmail);
    const targetHash = await sha256(norm);
    await removeBlockedUser(norm);
    await removeBlockedUser(targetHash);
    this.emit("block_list_changed");
  }

  public getSession(sid: string) {
    return this.sessions[sid];
  }

  public async decryptFriendRequest(
    encryptedPacket: string,
    remotePubB64: string | string[],
  ) {
    const keysToTry = Array.isArray(remotePubB64)
      ? remotePubB64
      : [remotePubB64];

    for (const pubKey of keysToTry) {
      if (!pubKey) continue;

      try {
        const sharedKey = await this.deriveSharedKey(pubKey);
        const [ivB64, cipherB64] = encryptedPacket.split(".");
        if (!ivB64 || !cipherB64) continue; // Try next key

        const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
        const cipher = Uint8Array.from(atob(cipherB64), (c) => c.charCodeAt(0));

        const decrypted = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv },
          sharedKey,
          cipher,
        );

        const jsonStr = new TextDecoder().decode(decrypted);
        return {
          profile: JSON.parse(jsonStr),
          decryptedWithKey: pubKey,
        };
      } catch (e) {
        // Decryption failed with this key, try the next one
        continue;
      }
    }

    console.warn(
      "Unable to decrypt friend request (likely meant for an older device key or a different device).",
    );
    return null;
  }

  public async handleFriendAccept(data: any) {
    const myEmail = this.normalizeEmail(this.authService.userEmail);

    let profile: any = null;
    let successfulPubKey = "";

    const payloadsToTry = data.payloads || [
      {
        encryptedPacket: data.encryptedPacket,
        publicKey: data.publicKeys?.[0] || data.publicKey,
      },
    ];

    for (const payload of payloadsToTry) {
      if (!payload.encryptedPacket) continue;
      try {
        const result = await this.decryptFriendRequest(
          payload.encryptedPacket,
          data.publicKeys || [payload.publicKey],
        );
        if (result) {
          profile = result.profile;
          successfulPubKey = result.decryptedWithKey;
          break; // Stop trying once we decrypt successfully
        }
      } catch (_e) {
        // Just try the next one
      }
    }

    if (!profile) {
      const sidForKey = Object.entries(this.sessions).find(([, s]) =>
        s.peerPubKeys?.includes(successfulPubKey),
      );
      if (sidForKey) {
        console.log(
          "[SessionService] FRIEND_ACCEPT: Already have session for this key, skipping.",
        );
        return sidForKey[0];
      }
      console.warn(
        "[SessionService] FRIEND_ACCEPT: Could not decrypt and no existing session found.",
      );
      return null;
    }

    const otherEmail = this.normalizeEmail(profile.email);
    const [u1, u2] = [myEmail, otherEmail].sort();
    const sid = await sha256(u1 + ":" + u2);

    const historyUpdated = await updateOutboundRequestHistoryStatus(
      "accepted",
      { email: otherEmail },
    );
    if (historyUpdated) {
      this.emit("request_history_changed");
    }

    await this.finalizeSession(
      sid,
      [successfulPubKey],
      profile.email,
      undefined,
      profile.name,
      profile.avatar,
      profile.nameVersion,
      profile.avatarVersion,
      undefined,
      false,
    );
    return sid;
  }

  public async handleFriendDeny(data: any) {
    const status: "blocked" | "rejected" =
      data.reason === "blocked" ? "blocked" : "rejected";
    const historyUpdated = await updateOutboundRequestHistoryStatus(status, {
      targetHash: data.senderHash,
      email: this.normalizeEmail(data.targetEmail),
    });

    if (historyUpdated) {
      this.emit("request_history_changed");
    }

    console.log("Friend request denied by", data.senderHash || data.targetEmail);
  }

  public async removeConnection(
    targetHash: string,
    sid: string,
    skipNetwork?: boolean,
  ) {
    if (!skipNetwork) {
      socket.send({
        t: "UNFRIEND",
        data: { targetHash },
        c: true,
        p: 0,
      });
    }

    if (this.sessions[sid]) {
      this.sessions[sid].isConnected = false;
      this.sessions[sid].online = false;
    }
    this.connectedSids.delete(sid);

    this.emit("session_updated");
  }

  public async handleProfileUpdate(sid: string, data: any) {
    console.log("Profile update received", sid, data);
  }

  public async setPeerOnline(
    sid: string,
    isOnline: boolean,
    newPeerPubKeys?: string[],
  ) {
    if (this.sessions[sid]) {
      this.sessions[sid].online = isOnline;
      this.emit("session_updated");

      if (isOnline && newPeerPubKeys && newPeerPubKeys.length > 0) {
        const currentKeys = JSON.stringify({
          peer: this.sessions[sid].peerPubKeys || [],
        });
        const incomingKeys = JSON.stringify({
          peer: newPeerPubKeys,
        });

        if (currentKeys !== incomingKeys) {
          console.log(
            `[SessionService] PEER_ONLINE: PublicKeys for ${sid} changed. Re-deriving shared keys...`,
          );
          try {
            await this.finalizeSession(
              sid,
              newPeerPubKeys,
              this.sessions[sid].peerEmail,
              this.sessions[sid].peerEmailHash,
              this.sessions[sid].peerName,
              this.sessions[sid].peerAvatar,
              this.sessions[sid].peer_name_ver,
              this.sessions[sid].peer_avatar_ver,
              this.sessions[sid].ownPubKeys,
            );
          } catch (e) {
            console.error(
              "Failed to re-derive session key on PEER_ONLINE pubKey rotation:",
              e,
            );
          }
        }
      }
    } else {
      this.pendingPresenceBySid.set(sid, {
        online: isOnline,
        peerPubKeys: newPeerPubKeys || [],
      });

      let ownSid = "";
      if (this.authService.userEmail) {
        const emailStr = this.normalizeEmail(this.authService.userEmail);
        try {
          ownSid = await sha256(emailStr + ":" + emailStr);
        } catch (e) { }
      }

      if (
        ownSid &&
        sid === ownSid &&
        isOnline &&
        newPeerPubKeys &&
        newPeerPubKeys.length > 0
      ) {
        console.log(
          `[SessionService] PEER_ONLINE: Reconstructing newly online own-device session ${sid}`,
        );
        const emailStr = this.normalizeEmail(this.authService.userEmail || "");
        const myHash = await sha256(emailStr);
        try {
          await this.finalizeSession(
            sid,
            newPeerPubKeys,
            undefined,
            myHash,
            undefined,
            undefined,
            0,
            0,
            undefined, // ownPubKeys will be picked up properly
            true,
          );
        } catch (e) {
          console.error(
            "Failed to derive session for newly online own device",
            e,
          );
        }
      }
    }
  }

  public async handleSessionList(
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

    const promises: Promise<any>[] = [];

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
          peer: [...(this.sessions[item.sid].peerPubKeys || [])].sort(),
          own: [...(this.sessions[item.sid].ownPubKeys || [])].sort(),
        });
        const newKeys = JSON.stringify({
          peer: [...(item.peerPubKeys || [])].sort(),
          own: [...(item.ownPubKeys || [])].sort(),
        });
        if ((item.peerPubKeys || item.ownPubKeys) && currentKeys !== newKeys) {
          console.log(
            `[SessionService] PublicKeys for ${item.sid} changed. Re-deriving shared keys...`,
          );
          promises.push(
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
              item.online,
            ).catch((e) =>
              console.error(
                "Failed to re-derive session key on pubKey rotation:",
                e,
              ),
            ),
          );
        }
      } else {
        if ((item.peerPubKeys || item.ownPubKeys) && item.peerHash) {
          let ownSid = "";
          if (this.authService.userEmail) {
            const emailStr = this.normalizeEmail(this.authService.userEmail);
            try {
              ownSid = await sha256(emailStr + ":" + emailStr);
            } catch (e) { }
          }

          if (ownSid && item.sid === ownSid && !item.online) {
            console.log(
              "[SessionService] Skipping offline own-device session reconstruction",
              item.sid,
            );
            continue;
          }

          console.log(
            "[SessionService] Reconstructing missing local session from server data",
            item.sid,
          );
          promises.push(
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
              item.online, // Respect actual online status from server
            ).catch((e) =>
              console.error(
                "Failed to auto-restore session from server list:",
                e,
              ),
            ),
          );
        }
      }
    }

    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }

    if (changed) {
      this.emit("session_updated");
    }
  }

  public async updateSessionNotes(sid: string, notes: string) {
    if (this.sessions[sid]) {
      this.sessions[sid].notes = notes;
      this.emit("session_updated");
    }
  }
}

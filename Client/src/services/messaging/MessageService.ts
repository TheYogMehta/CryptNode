import { EventEmitter } from "events";
import { queryDB, executeDB, getAllBlockEntries, getBlockedUsers, getAllPendingRequestsEntries, getMyProfileAndVersions, getAllAliasesEntries, getLastManifestSync, getMessagesSince, updateLastManifestSync, executeTransaction, markSessionDeleted, getDeletedSessionIds } from "../storage/sqliteService";
import { StorageService } from "../storage/StorageService";
import { FileTransferService } from "../media/FileTransferService";
import { CallService } from "../media/CallService";
import { AuthService } from "../auth/AuthService";
import { SessionService } from "./SessionService";
import { TEXT_CHUNK_SIZE_CHARS } from "../core/protocolLimits";
import { avatarCacheService } from "../storage/AvatarCacheService";

interface IMessageClient {
  authService: AuthService;
  sessionService: SessionService;
  fileTransfer: FileTransferService;
  callService: CallService;
  encryptForSession(
    sid: string,
    data: any,
    priority: number,
  ): Promise<Record<string, string>>;
  send(frame: any): void;
  emit(event: string, ...args: any[]): boolean;
  insertMessageRecord(
    sid: string,
    text: string,
    type: string,
    sender: string,
    forceId?: string,
    replyTo?: any,
  ): Promise<string>;
}

export class MessageService extends EventEmitter {
  private client: IMessageClient;
  private static readonly MAX_PROFILE_AVATAR_B64_CHARS = 120 * 1024;
  private static readonly PROFILE_AVATAR_CHUNK_SIZE_CHARS = 60 * 1024;
  private textChunkBuffer = new Map<
    string,
    {
      totalChunks: number;
      parts: string[];
      chunkType: "TEXT" | "GIF";
      timestamp: number;
      replyTo?: any;
    }
  >();
  private profileAvatarChunkBuffer = new Map<
    string,
    {
      totalChunks: number;
      parts: string[];
      name: string | null;
      nameVersion: number;
      avatarVersion: number;
      timestamp: number;
    }
  >();
  // Cooldown map to prevent GET_PROFILE request storms: sid -> timestamp of last request
  private profileRequestCooldown = new Map<string, number>();
  private static readonly PROFILE_REQUEST_COOLDOWN_MS = 10_000;
  private syncLockSid: string | null = null;
  private broadcastManifestCooldownTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(client: IMessageClient) {
    super();
    this.client = client;
  }

  private splitTextIntoChunks(text: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private chunkKey(sid: string, id: string): string {
    return `${sid}:${id}`;
  }

  private normalizeProfileAvatarPayload(avatar?: string | null): string | null {
    if (!avatar || typeof avatar !== "string") return null;
    let base64 = avatar;
    if (avatar.startsWith("data:")) {
      const parts = avatar.split(",");
      base64 = parts.length > 1 ? parts[1] : "";
    }
    if (!base64) return null;
    return base64;
  }

  private getMediaRowScore(row: {
    status?: string | null;
    size?: number | null;
    download_progress?: number | null;
    thumbnail?: string | null;
    filename?: string | null;
  }): number {
    let score = 0;
    if (row.status === "downloaded") score += 1_000_000;
    else if (row.status === "downloading") score += 100_000;
    else if (row.status === "pending") score += 10_000;

    score += Number(row.size || 0);
    score += Math.round(Number(row.download_progress || 0) * 100);
    if (row.thumbnail) score += 10;
    if (row.filename) score += 1;
    return score;
  }

  private dedupeMediaRows<
    T extends {
      message_id?: string | null;
      status?: string | null;
      size?: number | null;
      download_progress?: number | null;
      thumbnail?: string | null;
      filename?: string | null;
    },
  >(rows: T[]): T[] {
    const byMessageId = new Map<string, T>();

    for (const row of rows) {
      const messageId = row?.message_id;
      if (!messageId) continue;

      const existing = byMessageId.get(messageId);
      if (
        !existing ||
        this.getMediaRowScore(row) >= this.getMediaRowScore(existing)
      ) {
        byMessageId.set(messageId, row);
      }
    }

    return Array.from(byMessageId.values());
  }

  private splitProfileAvatarIntoChunks(base64: string): string[] {
    return this.splitTextIntoChunks(
      base64,
      MessageService.PROFILE_AVATAR_CHUNK_SIZE_CHARS,
    );
  }

  private profileAvatarChunkKey(sid: string, transferId: string): string {
    return `${sid}:${transferId}`;
  }

  private async saveAndEmitInboundMessage(
    sid: string,
    data: {
      id: string;
      type: string;
      text: string;
      timestamp: number;
      replyTo?: any;
    },
    senderString: "me" | "other",
  ) {
    try {
      await executeDB(
        "INSERT OR IGNORE INTO messages (id, sid, sender, text, type, timestamp, status, reply_to) VALUES (?, ?, ?, ?, ?, ?, 2, ?)",
        [
          data.id,
          sid,
          senderString,
          data.text,
          data.type.toLowerCase(),
          data.timestamp,
          data.replyTo ? JSON.stringify(data.replyTo) : null,
        ],
      );
      // Revive the session if it was previously deleted, so it appears in the UI again
      await executeDB("UPDATE sessions SET deleted_at = 0 WHERE sid = ? AND deleted_at > 0", [sid]);
    } catch (e) {
      console.error("[MessageService] Failed to save received message:", e);
    }
    this.client.emit("message", {
      sid,
      text: data.text,
      sender: senderString,
      type: data.type.toLowerCase(),
      id: data.id,
      replyTo: data.replyTo,
      timestamp: data.timestamp,
    });
    this.broadcastManifestToOwnDevices(false).catch(() => { });
  }

  public async sendMessage(
    sid: string,
    text: string,
    replyTo?: any,
    type: string = "text",
    forceId?: string
  ) {
    if (!this.client.sessionService.sessions[sid]) {
      console.warn(
        `[MessageService] Session ${sid} not found in memory, reloading sessions...`,
      );
      await this.client.sessionService.loadSessions();
      if (!this.client.sessionService.sessions[sid]) {
        throw new Error("Session not found");
      }
    }

    const id = forceId || crypto.randomUUID();
    const timestamp = Date.now();
    try {
      await executeDB(
        "INSERT INTO messages (id, sid, sender, text, type, timestamp, status, reply_to) VALUES (?, ?, 'me', ?, 'text', ?, 1, ?)",
        [id, sid, text, timestamp, replyTo ? JSON.stringify(replyTo) : null],
      );

      // Revive the session if it was previously deleted
      await executeDB("UPDATE sessions SET deleted_at = 0 WHERE sid = ? AND deleted_at > 0", [sid]);

      if (!this.client.sessionService.sessions[sid].online) {
        console.log(`[MessageService] Peer ${sid} is offline. Message queued locally.`);
        this.broadcastManifestToOwnDevices(false).catch(() => { });
        return;
      }

      const normalizedType = type === "text" ? "TEXT" : type.toUpperCase();
      if (
        (normalizedType === "TEXT" || normalizedType === "GIF") &&
        text.length > TEXT_CHUNK_SIZE_CHARS
      ) {
        const chunks = this.splitTextIntoChunks(text, TEXT_CHUNK_SIZE_CHARS);
        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
          const payloads = await this.client.encryptForSession(
            sid,
            JSON.stringify({
              t: "MSG",
              data: {
                type: "TEXT_CHUNK",
                id,
                chunkIndex,
                totalChunks: chunks.length,
                chunkType: normalizedType,
                textChunk: chunks[chunkIndex],
                timestamp,
                replyTo,
              },
            }),
            1,
          );
          this.client.send({
            t: "MSG",
            sid,
            data: { payloads },
            c: chunkIndex === chunks.length - 1,
            p: 1,
          });
        }
      } else {
        const payloads = await this.client.encryptForSession(
          sid,
          JSON.stringify({
            t: "MSG",
            data: {
              type: normalizedType,
              text,
              id,
              timestamp,
              replyTo,
            },
          }),
          1,
        );
        this.client.send({ t: "MSG", sid, data: { payloads }, c: true, p: 1 });
      }
    } catch (e) {
      console.error("[MessageService] Failed to save sent message:", e);
    }
    this.broadcastManifestToOwnDevices(false).catch(() => { });
  }

  public async requestSync(
    sid: string,
    timestamp: number,
    direction: "ASC" | "DESC" = "ASC",
    limit: number = 50,
    targetPubKey?: string,
  ) {
    if (!this.client.sessionService.sessions[sid]) return;

    try {
      const payloadObj = {
        t: "MSG",
        data: {
          type: "SYNC_REQ",
          timestamp,
          direction,
          limit,
        },
      };

      let payloads;
      if (targetPubKey) {
        // Encrypt only for the specific target device
        payloads = await this.client.encryptForSession(
          sid,
          JSON.stringify(payloadObj),
          1,
        );
        // Filter out other keys
        const filteredPayloads: Record<string, string> = {};
        if (payloads[targetPubKey]) {
          filteredPayloads[targetPubKey] = payloads[targetPubKey];
        }
        payloads = filteredPayloads;
      } else {
        payloads = await this.client.encryptForSession(
          sid,
          JSON.stringify(payloadObj),
          1,
        );
      }

      this.client.send({
        t: "MSG",
        sid,
        data: { payloads },
        c: true,
        p: 1,
      });
    } catch (e) {
      console.error("[MessageService] Failed to request cross-device sync:", e);
    }
  }

  public async requestSyncInfo(sid: string, targetPubKey?: string) {
    if (!this.client.sessionService.sessions[sid]) return;

    try {
      const payloadObj = {
        t: "MSG",
        data: { type: "SYNC_INFO_REQ" },
      };

      let payloads = await this.client.encryptForSession(
        sid,
        JSON.stringify(payloadObj),
        1,
      );

      if (targetPubKey && payloads[targetPubKey]) {
        payloads = { [targetPubKey]: payloads[targetPubKey] };
      }

      this.client.send({
        t: "MSG",
        sid,
        data: { payloads },
        c: true,
        p: 1,
      });
    } catch (e) {
      console.error("[MessageService] Failed to request SYNC_INFO:", e);
    }
  }

  public async broadcastSyncState(sid: string) {
    if (!this.client.sessionService.sessions[sid]) return;

    try {
      const row = await queryDB(
        "SELECT COUNT(*) as total, MAX(timestamp) as maxTs, MIN(timestamp) as minTs FROM messages WHERE sid = ?",
        [sid],
      );
      const total = row[0]?.total || 0;
      const maxTs = row[0]?.maxTs || 0;
      const minTs = row[0]?.minTs || 0;

      const payloads = await this.client.encryptForSession(
        sid,
        JSON.stringify({
          t: "MSG",
          data: {
            type: "SYNC_STATE_BROADCAST",
            total,
            maxTs,
            minTs,
          },
        }),
        1,
      );
      this.client.send({
        t: "MSG",
        sid,
        data: { payloads },
        c: true,
        p: 1,
      });
    } catch (e) {
      console.error("[MessageService] Failed to broadcast sync state:", e);
    }
  }

  public async editMessage(sid: string, messageId: string, newText: string) {
    if (!this.client.sessionService.sessions[sid])
      throw new Error("Session not found");

    const payloads = await this.client.encryptForSession(
      sid,
      JSON.stringify({
        t: "MSG",
        data: {
          type: "EDIT",
          id: messageId,
          text: newText,
          timestamp: Date.now(),
        },
      }),
      1,
    );

    this.client.send({
      t: "MSG",
      sid,
      data: { payloads },
      c: true,
      p: 1,
    });

    try {
      await executeDB("UPDATE messages SET text = ? WHERE id = ?", [
        newText,
        messageId,
      ]);
      this.client.emit("message_updated", {
        sid,
        id: messageId,
        text: newText,
      });
    } catch (e) {
      console.error("[MessageService] Failed to update local message:", e);
    }
  }

  /**
   * Deletes chat data locally.
   * When `removeFromUi` is false, only the messages are cleared and the session stays visible.
   * When `removeFromUi` is true, the whole local chat/session is removed from the UI.
   */
  public async deleteChatLocally(sid: string, removeFromUi: boolean = false) {
    try {
      // Delete physical media files from disk before the DB cascade removes the rows.
      try {
        const mediaRows = await queryDB(
          "SELECT filename FROM media WHERE message_id IN (SELECT id FROM messages WHERE sid = ?)",
          [sid],
        );
        await Promise.all(
          mediaRows
            .map((r: any) => r.filename)
            .filter(Boolean)
            .map((filename: string) => StorageService.deleteFile(filename).catch(() => {})),
        );
      } catch (e) {
        console.warn("[MessageService] Failed to delete media files for chat:", e);
      }

      // Delete all messages for this session (cascade will handle reactions & media rows)
      await executeDB("DELETE FROM messages WHERE sid = ?", [sid]);

      // Keep the old local tombstone behavior so MANIFEST/SYNC cannot re-seed
      // previously cleared history after restart/reconnect.
      await markSessionDeleted(sid, Date.now());

      if (removeFromUi) {
        this.client.emit("chat_deleted", { sid });
        this.client.emit("session_updated");
        console.log(`[MessageService] Chat ${sid} removed locally.`);
        return;
      }

      this.client.emit("messages_synced", { sid });
      this.client.emit("session_updated");

      console.log(`[MessageService] Chat ${sid} cleared locally.`);
    } catch (e) {
      console.error("[MessageService] Failed to delete chat locally:", e);
      throw e;
    }
  }

  public async deleteMessage(sid: string, messageId: string, forEveryone: boolean = false) {
    if (!this.client.sessionService.sessions[sid])
      throw new Error("Session not found");

    const rows = await queryDB("SELECT sender, type FROM messages WHERE id = ?", [messageId]);
    if (rows.length === 0) return;

    const isMe = rows[0].sender === "me";

    if (forEveryone && isMe) {
      console.log(`[MessageService] Hard-deleting my message ${messageId}, sending retraction to peer`);
      try {
        const payloads = await this.client.encryptForSession(
          sid,
          JSON.stringify({
            t: "MSG",
            data: {
              type: "DELETE",
              id: messageId,
              timestamp: Date.now(),
            },
          }),
          1,
        );
        this.client.send({ t: "MSG", sid, data: { payloads }, c: true, p: 1 });
      } catch (e) {
        console.warn("[MessageService] Failed to broadcast DELETE to peer:", e);
      }
    } else {
      console.log(`[MessageService] Deleting message ${messageId} locally only`);
    }

    try {
      await executeDB("DELETE FROM messages WHERE id = ?", [messageId]);
      await executeDB("DELETE FROM reactions WHERE message_id = ?", [messageId]);
      await executeDB("DELETE FROM media WHERE message_id = ?", [messageId]);

      this.client.emit("message_deleted", { sid, id: messageId });
      this.broadcastManifestToOwnDevices(false).catch(() => {});
    } catch (e) {
      console.error("[MessageService] Failed to hard-delete message locally:", e);
    }
  }

  public async handleMsg(
    sid: string,
    payload: string,
    senderHash?: string,
    priority: number = 1,
  ) {
    if (!this.client.sessionService.sessions[sid]) {
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (this.client.sessionService.sessions[sid]) break;
      }

      if (!this.client.sessionService.sessions[sid]) {
        console.warn(`[MessageService] Session ${sid} not found, reloading sessions...`);
        await this.client.sessionService.loadSessions();
      }

      if (!this.client.sessionService.sessions[sid]) {
        console.warn(`[MessageService] Received MSG for unknown session ${sid}`);
        return;
      }
    }

    try {
      let decryptedBuffer = await this.client.sessionService.decrypt(
        sid,
        payload,
        priority,
      );

      // If decryption fails immediately, retry once after a short delay.
      // This handles the race where SESSION_LIST triggers async finalizeSession
      // (ECDH key derivation) but a MSG arrives before the worker has the keys.
      if (!decryptedBuffer) {
        await new Promise((r) => setTimeout(r, 600));
        decryptedBuffer = await this.client.sessionService.decrypt(
          sid,
          payload,
          priority,
        );
      }

      if (!decryptedBuffer) {
        console.error(`[MessageService] Decryption failed for ${sid}`);
        return;
      }
      const json = JSON.parse(new TextDecoder().decode(decryptedBuffer));
      const { t, data } = json;

      if (t !== "MSG") {
        console.warn(`[MessageService] Unexpected message type: ${t}`);
        return;
      }

      if (!data || !data.type) {
        console.warn(`[MessageService] MSG missing data.type`);
        return;
      }

      console.log(`[MessageService] Received ${data.type}:`, data);

      let isOwnMessage = false;
      let isOwnDeviceSession = false;
      const myEmail = this.client.authService.userEmail;
      if (myEmail && senderHash) {
        const normEmail = myEmail.trim().toLowerCase();
        const myHash = await crypto.subtle
          .digest(
            "SHA-256",
            new TextEncoder().encode(normEmail),
          )
          .then((b) =>
            Array.from(new Uint8Array(b))
              .map((x) => x.toString(16).padStart(2, "0"))
              .join(""),
          );
        if (myHash.toLowerCase() === senderHash.toLowerCase()) {
          isOwnMessage = true;
        }

        const ownSidCalc = await crypto.subtle
          .digest("SHA-256", new TextEncoder().encode(normEmail + ":" + normEmail))
          .then((b) =>
            Array.from(new Uint8Array(b))
              .map((x) => x.toString(16).padStart(2, "0"))
              .join(""),
          );
        if (sid === ownSidCalc) {
          isOwnDeviceSession = true;
        }
      }
      const senderString = isOwnMessage ? "me" : "other";

      switch (data.type) {
        case "MIC_STATUS":
          if (isOwnMessage && !isOwnDeviceSession) break;
          this.client.emit("peer_mic_status", { sid, muted: data.muted });
          break;
        case "CALL_MODE":
          if (isOwnMessage && !isOwnDeviceSession) break;
          console.log(`[MessageService] Remote switched to mode: ${data.mode}`);
          this.client.emit("call_mode_changed", { sid, mode: data.mode });
          break;

        case "SYNC_STATE_BROADCAST": {
          if (isOwnMessage && !isOwnDeviceSession) break;
          try {
            const peerTotal = Number(data.total) || 0;
            const res = await queryDB("SELECT COUNT(*) as c FROM messages WHERE sid = ?", [sid]);
            const localTotal = res[0]?.c || 0;
            if (localTotal < peerTotal) {
              console.log(`[MessageService] Sync gap detected. Local: ${localTotal}, Peer: ${peerTotal}. Forcing full SYNC...`);
              this.client.send({
                t: "MSG", sid,
                data: {
                  payloads: await this.client.encryptForSession(sid, JSON.stringify({
                    t: "MSG", data: { type: "SYNC_REQ", timestamp: Date.now(), direction: "DESC", limit: Math.min(peerTotal, 500) }
                  }), 0)
                }, c: false, p: 0
              });
            }
          } catch (e) {
            console.warn(`[MessageService] Error handling SYNC_STATE_BROADCAST`, e);
          }
          break;
        }

        case "SYNC_REQ": {
           try {
             console.log(`[MessageService] Handling SYNC_REQ from ${sid}. Sending MANIFEST of our messages...`);
             // We'll send our messages up to reasonable limit to fill their gap.
             const missing = await queryDB(
               "SELECT * FROM messages WHERE sid = ? AND sender = 'me' ORDER BY timestamp DESC LIMIT 300",
               [sid]
             );
             // Also include anything they sent that we successfully stored, in case they lost their own messages.
             const missingTheirs = await queryDB(
               "SELECT * FROM messages WHERE sid = ? AND sender != 'me' ORDER BY timestamp DESC LIMIT 300",
               [sid]
             );
             const combined = [...missing, ...missingTheirs].sort((a, b) => a.timestamp - b.timestamp);
             const messageIds = combined.map(m => m.id);
             let media: any[] = [];
             if (messageIds.length > 0) {
               const placeholders = messageIds.map(() => "?").join(",");
               media = await queryDB(`SELECT * FROM media WHERE message_id IN (${placeholders})`, messageIds);
               media = this.dedupeMediaRows(media);
             }
             const payloads = await this.client.encryptForSession(
               sid,
               JSON.stringify({ t: "MSG", data: { type: "MANIFEST", manifest: { messages: combined, media } } }), 0
             );
             this.client.send({ t: "MSG", sid, data: { payloads }, c: false, p: 0 });
           } catch (e) {
             console.warn(`[MessageService] Failed to handle SYNC_REQ`, e);
           }
           break;
        }

        // ── Efficient peer sync handshake ──────────────────────────────────────
        // Step 1: peer A calls sendManifestToPeer → sends SYNC_HINT with the
        //         latest timestamp of messages A has received FROM B.
        // Step 2: peer B receives SYNC_HINT → queries its own messages sent
        //         after that timestamp → replies with only the delta MANIFEST.
        // Result: B never re-sends what A already has. Zero double-bandwidth.
        case "SYNC_HINT": {
          try {
            const peerLatestFromYou: number = Number(data.latestFromYou) || 0;
            const peerLatestFromMe: number = Number(data.latestFromMe) || 0;

            console.log(`[MessageService] Handling SYNC_HINT from ${sid}: peerLatestFromYou=${peerLatestFromYou}, peerLatestFromMe=${peerLatestFromMe}, isOwnMessage=${isOwnMessage}`);

            // Bail out if this session has been deleted locally — don't re-sync it
            const deletedIds = await getDeletedSessionIds();
            if (deletedIds.includes(sid)) {
              console.log(`[MessageService] Skipping SYNC_HINT for deleted session ${sid}`);
              break;
            }

            // To the remote peer, "from you" means messages WE sent (sender='me' locally)
            // and "from me" means messages THEY sent (sender='other' locally)

            let missing: any[] = [];

            if (isOwnMessage) {
              // For own-device sync, we want a full mirror of the database (all sessions, all senders).
              const queryTime = Math.max(peerLatestFromYou, peerLatestFromMe);
              missing = await queryDB(
                "SELECT * FROM messages WHERE timestamp > ? ORDER BY timestamp ASC",
                [queryTime],
              );
            } else {
              // For regular friends, we only send messages from this specific session.
              const missingYou = await queryDB(
                "SELECT * FROM messages WHERE sid = ? AND sender = 'me' AND timestamp > ? ORDER BY timestamp ASC",
                [sid, peerLatestFromYou],
              );

              // Only query 'other' messages if the peer explicitly gave a latestFromMe hint.
              const missingMe = (data.latestFromMe !== undefined) ? await queryDB(
                "SELECT * FROM messages WHERE sid = ? AND sender != 'me' AND timestamp > ? ORDER BY timestamp ASC",
                [sid, peerLatestFromMe],
              ) : [];

              missing = [...missingYou, ...missingMe].sort((a, b) => a.timestamp - b.timestamp);
            }

            const messageIds = missing.map((m) => m.id);
            let media: any[] = [];
            if (messageIds.length > 0) {
              const placeholders = messageIds.map(() => "?").join(",");
              media = await queryDB(
                `SELECT * FROM media WHERE message_id IN (${placeholders})`,
                messageIds,
              );
              media = this.dedupeMediaRows(media);
            }

            let manifestData: any = { messages: missing, media };

            // If this is our own device asking for sync, include full metadata too,
            // BUT only if we are the PRIMARY sync device. This prevents both devices
            // from redundantly full-syncing metadata to each other simultaneously.
            let isPrimarySyncDevice = false;

            if (isOwnMessage) {
              const myPubKey = await this.client.authService.exportPub();
              const session = this.client.sessionService.sessions[sid] as any;
              const peerPubKeys = session?.peerPubKeys || [];

              isPrimarySyncDevice = true;
              for (const pk of peerPubKeys) {
                if (pk < myPubKey) {
                  isPrimarySyncDevice = false;
                  break;
                }
              }

              if (isPrimarySyncDevice) {
                const [blocks, requests, aliases, profile] = await Promise.all([
                  getAllBlockEntries(),
                  getAllPendingRequestsEntries(),
                  getAllAliasesEntries(),
                  getMyProfileAndVersions()
                ]);
                manifestData = {
                  ...manifestData,
                  blocks,
                  requests,
                  aliases,
                  profile: profile || undefined
                };
              }
            }

            // If we have no missing messages:
            // - Break if it's NOT an own device (we only sync messages with regular peers)
            // - Break if it IS an own device BUT we are NOT the primary device (we aren't sending metadata)
            if (missing.length === 0 && (!isOwnMessage || !isPrimarySyncDevice)) break;

            const payloads = await this.client.encryptForSession(
              sid,
              JSON.stringify({ t: "MSG", data: { type: "MANIFEST", manifest: manifestData } }),
              0,
            );
            if (Object.keys(payloads).length > 0) {
              this.client.send({ t: "MSG", sid, data: { payloads }, c: false, p: 0 });
              console.log(`[MessageService] SYNC_HINT → sent MANIFEST (incl ${missing.length} messages) to ${sid}`);
            }
          } catch (e) {
            console.warn(`[MessageService] Failed to respond to SYNC_HINT for ${sid}`, e);
          }
          break;
        }
        case "TEXT":
        case "GIF":
        case "IMAGE":
          await this.saveAndEmitInboundMessage(
            sid,
            {
              id: data.id,
              type: data.type,
              text: data.text,
              timestamp: data.timestamp,
              replyTo: data.replyTo,
            },
            senderString,
          );
          break;
        case "TEXT_CHUNK":
          if (
            !data?.id ||
            typeof data.chunkIndex !== "number" ||
            typeof data.totalChunks !== "number" ||
            data.totalChunks <= 0 ||
            data.totalChunks > 10000 ||
            !["TEXT", "GIF"].includes(data.chunkType) ||
            typeof data.textChunk !== "string"
          ) {
            console.warn("[MessageService] Invalid TEXT_CHUNK frame");
            break;
          }
          const key = this.chunkKey(sid, data.id);
          const existing = this.textChunkBuffer.get(key);
          if (
            existing &&
            (existing.totalChunks !== data.totalChunks ||
              existing.chunkType !== data.chunkType)
          ) {
            this.textChunkBuffer.delete(key);
          }
          const buffer =
            this.textChunkBuffer.get(key) ||
            ({
              totalChunks: data.totalChunks,
              parts: new Array(data.totalChunks),
              chunkType: data.chunkType,
              timestamp: data.timestamp || Date.now(),
              replyTo: data.replyTo,
            } as {
              totalChunks: number;
              parts: string[];
              chunkType: "TEXT" | "GIF";
              timestamp: number;
              replyTo?: any;
            });
          if (data.chunkIndex < 0 || data.chunkIndex >= buffer.totalChunks) {
            console.warn("[MessageService] TEXT_CHUNK index out of range");
            break;
          }
          buffer.parts[data.chunkIndex] = data.textChunk;
          this.textChunkBuffer.set(key, buffer);
          if (buffer.parts.some((part) => typeof part !== "string")) {
            break;
          }
          this.textChunkBuffer.delete(key);
          await this.saveAndEmitInboundMessage(
            sid,
            {
              id: data.id,
              type: buffer.chunkType,
              text: buffer.parts.join(""),
              timestamp: buffer.timestamp,
              replyTo: buffer.replyTo,
            },
            senderString,
          );
          break;
        case "EDIT":
          try {
            const msgRows = await queryDB(
              "SELECT timestamp, sid, sender FROM messages WHERE id = ?",
              [data.id],
            );
            if (msgRows.length > 0) {
              const msg = msgRows[0];
              if (msg.sid !== sid || msg.sender !== senderString) {
                console.warn(
                  "[MessageService] Ignoring EDIT for message not owned by sender",
                  data.id,
                );
                break;
              }
              if (Date.now() - msg.timestamp > 30 * 24 * 60 * 60 * 1000) {
                console.warn(
                  "[MessageService] Ignoring EDIT for old message",
                  data.id,
                );
                break;
              }
            } else {
              console.warn(
                "[MessageService] Message not found for EDIT",
                data.id,
              );
              break;
            }

            await executeDB("UPDATE messages SET text = ? WHERE id = ?", [
              data.text,
              data.id,
            ]);
            this.client.emit("message_updated", {
              sid,
              id: data.id,
              text: data.text,
            });
          } catch (e) {
            console.error(
              "[MessageService] Failed to process EDIT message:",
              e,
            );
          }
          break;
        case "DELETE":
          try {
            const msgRowsDelete = await queryDB(
              "SELECT timestamp, sid, sender FROM messages WHERE id = ?",
              [data.id],
            );
            if (msgRowsDelete.length > 0) {
              const msg = msgRowsDelete[0];
              if (msg.sid !== sid || msg.sender !== senderString) {
                console.warn(
                  "[MessageService] Ignoring DELETE for message not owned by sender",
                  data.id,
                );
                break;
              }
              if (Date.now() - msg.timestamp > 30 * 24 * 60 * 60 * 1000) {
                console.warn(
                  "[MessageService] Ignoring DELETE for old message",
                  data.id,
                );
                break;
              }
            } else {
              console.warn(
                "[MessageService] Message not found for DELETE",
                data.id,
              );
              break;
            }

            await executeDB(
              "UPDATE messages SET text = ?, type = 'deleted' WHERE id = ?",
              ["🚫 This message was deleted", data.id],
            );
            this.client.emit("message_updated", {
              sid,
              id: data.id,
              text: "🚫 This message was deleted",
              type: "deleted",
            });
          } catch (e) {
            console.error(
              "[MessageService] Failed to process DELETE message:",
              e,
            );
          }
          break;

        // ── Own-device manifest sync ──────────────────────────────────────
        // Single encrypted MANIFEST sent by both devices on connect.
        // Extensible named sections — each section merged independently.
        // Server only ever sees encrypted bytes.

        case "MANIFEST": {
          try {
            const manifest = data.manifest as {
              blocks?: { email: string; action: "block" | "unblock"; timestamp: number }[];
              requests?: { email: string; name?: string; avatar?: string; publicKey?: string; senderHash?: string; action: "pending" | "accepted" | "denied"; timestamp: number }[];
              aliases?: { sid: string; aliasName: string; aliasAvatar: string; timestamp: number; peerName?: string; peerAvatar?: string; peerNameVer?: number; peerAvatarVer?: number; peerEmail?: string; peerHash?: string; deletedAt?: number }[];
              profile?: { name?: string; avatar?: string; nameVersion?: number; avatarVersion?: number };
              messages?: any[];
              media?: any[];
            };
            if (!manifest || typeof manifest !== "object") break;

            // ── Own-device-only sections ─────────────────────────────────────────
            // blocks, requests, aliases, and profile are sensitive cross-device sync
            // data. They must only be applied when the MANIFEST came from our OWN
            // device (same email hash). Peer-sent MANIFESTs (e.g. SYNC_HINT replies)
            // carry only the `messages` section and must never touch these tables,
            // otherwise a peer can create phantom sessions in our sidebar or overwrite
            // our block list / profile.
            if (isOwnMessage) {
              // ── blocks section ──
              if (Array.isArray(manifest.blocks)) {
                for (const entry of manifest.blocks) {
                  if (!entry.email || !entry.action) continue;
                  const existing = await queryDB(
                    "SELECT timestamp FROM blocked_users WHERE email = ? LIMIT 1",
                    [entry.email],
                  );
                  if (
                    existing.length === 0 ||
                    entry.timestamp > (existing[0].timestamp ?? 0)
                  ) {
                    await executeDB(
                      "INSERT OR REPLACE INTO blocked_users (email, action, timestamp) VALUES (?, ?, ?)",
                      [entry.email, entry.action, entry.timestamp],
                    );
                  }
                }
                this.client.emit("block_list_updated");
              }

              // ── requests section ──
              if (Array.isArray(manifest.requests)) {
                let changed = false;
                for (const entry of manifest.requests) {
                  if (!entry.email || !entry.action) continue;
                  const existing = await queryDB(
                    "SELECT timestamp FROM pending_requests WHERE email = ? LIMIT 1",
                    [entry.email],
                  );
                  if (
                    existing.length === 0 ||
                    entry.timestamp > (existing[0].timestamp ?? 0)
                  ) {
                    await executeDB(
                      "INSERT OR REPLACE INTO pending_requests (email, name, avatar, publicKey, senderHash, action, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)",
                      [
                        entry.email,
                        entry.name || "",
                        entry.avatar || "",
                        entry.publicKey || "",
                        entry.senderHash || "",
                        entry.action,
                        entry.timestamp,
                      ],
                    );
                    changed = true;
                  }
                }
                if (changed) {
                  this.client.emit("pending_requests_updated");
                }
              }

              // ── aliases section ──
              // Each alias entry carries peerEmail + peerHash so that sessions
              // missing locally (e.g. on a freshly-installed Device B) can be
              // created as stubs before their messages are inserted. Without this,
              // contacts known only to Device A were silently dropped on Device B,
              // causing the sidebar to show only the own-device session ("User1 <-> User1").
              if (Array.isArray(manifest.aliases)) {
                let changed = false;
                for (const entry of manifest.aliases) {
                  if (!entry.sid) continue;

                  // ── Propagate chat deletion tombstone ──
                  // If the sending device deleted this chat, apply the same deletion locally.
                  if (entry.deletedAt && entry.deletedAt > 0) {
                    const localRow = await queryDB(
                      "SELECT deleted_at FROM sessions WHERE sid = ? LIMIT 1",
                      [entry.sid],
                    );
                    const localDeletedAt = localRow[0]?.deleted_at ?? 0;
                    if (entry.deletedAt > localDeletedAt) {
                      console.log(`[MessageService] MANIFEST: propagating chat deletion for ${entry.sid} from own device`);
                      await markSessionDeleted(entry.sid, entry.deletedAt);
                      // Wipe messages for this session so they don't re-appear
                      await executeDB("DELETE FROM messages WHERE sid = ?", [entry.sid]);
                      this.client.emit("chat_deleted", { sid: entry.sid });
                      changed = true;
                    }
                    continue; // Don't apply metadata updates for deleted sessions
                  }

                  // Ensure the session row exists — INSERT OR IGNORE creates a stub;
                  // subsequent UPDATE fills in the details.
                  if (entry.peerEmail || entry.peerHash) {
                    const beforeCount = await queryDB(
                      "SELECT COUNT(*) as n FROM sessions WHERE sid = ?",
                      [entry.sid],
                    );
                    await executeDB(
                      "INSERT OR IGNORE INTO sessions (sid, peer_email, peer_hash) VALUES (?, ?, ?)",
                      [entry.sid, entry.peerEmail || null, entry.peerHash || null],
                    );
                    const afterCount = await queryDB(
                      "SELECT COUNT(*) as n FROM sessions WHERE sid = ?",
                      [entry.sid],
                    );
                    // If a new row was created, flag as changed so the sidebar refreshes
                    if ((afterCount[0]?.n ?? 0) > (beforeCount[0]?.n ?? 0)) {
                      changed = true;
                    }
                  }

                  const existing = await queryDB(
                    "SELECT alias_timestamp, peer_name_ver, peer_avatar_ver, peer_name, peer_avatar, peer_email, peer_hash FROM sessions WHERE sid = ? LIMIT 1",
                    [entry.sid],
                  );
                  if (existing.length > 0) {
                    const current = existing[0];

                    if (entry.timestamp && entry.timestamp > (current.alias_timestamp ?? 0)) {
                      await executeDB(
                        "UPDATE sessions SET alias_name = ?, alias_avatar = ?, alias_timestamp = ? WHERE sid = ?",
                        [entry.aliasName, entry.aliasAvatar, entry.timestamp, entry.sid],
                      );
                      changed = true;
                    }

                    const peerNameVer = entry.peerNameVer || 0;
                    const peerAvatarVer = entry.peerAvatarVer || 0;

                    const currentNameVer = current.peer_name_ver ?? 0;
                    const currentAvatarVer = current.peer_avatar_ver ?? 0;

                    const shouldUpdateName = (peerNameVer > currentNameVer) || (!current.peer_name && entry.peerName);
                    const shouldUpdateAvatar = (peerAvatarVer > currentAvatarVer) || (!current.peer_avatar && entry.peerAvatar);

                    if (shouldUpdateName || shouldUpdateAvatar) {
                      const nameToSet = shouldUpdateName ? entry.peerName : undefined;
                      const avatarToSet = shouldUpdateAvatar ? entry.peerAvatar : undefined;
                      const targetNameVer = shouldUpdateName ? peerNameVer : currentNameVer;
                      const targetAvatarVer = shouldUpdateAvatar ? peerAvatarVer : currentAvatarVer;

                      if (nameToSet !== undefined && avatarToSet !== undefined) {
                        await executeDB(
                          "UPDATE sessions SET peer_name = ?, peer_avatar = ?, peer_name_ver = ?, peer_avatar_ver = ? WHERE sid = ?",
                          [nameToSet, avatarToSet, targetNameVer, targetAvatarVer, entry.sid]
                        );
                      } else if (nameToSet !== undefined) {
                        await executeDB(
                          "UPDATE sessions SET peer_name = ?, peer_name_ver = ? WHERE sid = ?",
                          [nameToSet, targetNameVer, entry.sid]
                        );
                      } else if (avatarToSet !== undefined) {
                        await executeDB(
                          "UPDATE sessions SET peer_avatar = ?, peer_avatar_ver = ? WHERE sid = ?",
                          [avatarToSet, targetAvatarVer, entry.sid]
                        );
                      }
                      changed = true;
                    }

                    // Backfill peer_email / peer_hash if the row was created without them
                    if (entry.peerEmail && !current.peer_email) {
                      await executeDB(
                        "UPDATE sessions SET peer_email = ? WHERE sid = ?",
                        [entry.peerEmail, entry.sid],
                      );
                    }
                    if (entry.peerHash && !current.peer_hash) {
                      await executeDB(
                        "UPDATE sessions SET peer_hash = ? WHERE sid = ?",
                        [entry.peerHash, entry.sid],
                      );
                    }
                  }
                }
                if (changed) {
                  // Reload in-memory sessions so that the newly-created stub sessions
                  // are available for crypto and sidebar display before messages are applied.
                  this.client.sessionService.loadSessions().catch(() => { });
                  this.client.emit("session_updated");
                }
              }

              // ── profile section ──
              if (manifest.profile && typeof manifest.profile === "object") {
                const myProfile = await getMyProfileAndVersions();
                let changed = false;

                if (
                  manifest.profile.nameVersion &&
                  myProfile &&
                  manifest.profile.nameVersion > myProfile.nameVersion
                ) {
                  await executeDB(
                    "UPDATE me SET public_name = ?, name_version = ? WHERE id = 1",
                    [manifest.profile.name, manifest.profile.nameVersion],
                  );
                  changed = true;
                }

                if (
                  manifest.profile.avatarVersion &&
                  myProfile &&
                  manifest.profile.avatarVersion > myProfile.avatarVersion
                ) {
                  await executeDB(
                    "UPDATE me SET public_avatar = ?, avatar_version = ? WHERE id = 1",
                    [manifest.profile.avatar, manifest.profile.avatarVersion],
                  );
                  changed = true;
                }

                if (changed) {
                  this.client.emit("profile_updated");
                }
              }
            } // end isOwnMessage guard

            // ── messages section ──
            if (Array.isArray(manifest.messages) && manifest.messages.length > 0) {
              // Collect deleted session IDs so we don't re-insert messages for them
              const deletedSids = new Set(await getDeletedSessionIds());

              // Determine if this manifest came from an own device or a different peer.
              // Own-device manifests use sender values as-is ("me" stays "me").
              // Peer manifests must remap sender="me" → "peer" because the sending device
              // used "me" for messages THEY sent — on our device those are incoming messages.
              const session = (this.client.sessionService.sessions[sid] as any);
              const myEmail = this.client.authService.userEmail;
              let isOwnDevice = false;
              if (myEmail && session?.peerEmailHash) {
                try {
                  const myHash = await crypto.subtle
                    .digest("SHA-256", new TextEncoder().encode(myEmail.trim().toLowerCase()))
                    .then((b) =>
                      Array.from(new Uint8Array(b))
                        .map((x) => x.toString(16).padStart(2, "0"))
                        .join(""),
                    );
                  isOwnDevice = session.peerEmailHash.toLowerCase() === myHash.toLowerCase();
                } catch (_) { }
              }

              const updatedSids = new Set<string>();
              const statements: { statement: string; values: any[] }[] = [];

              for (const msg of manifest.messages) {
                if (!msg.id || !msg.sid || !msg.timestamp) continue;
                if (deletedSids.has(msg.sid)) continue;
                
                const senderValue = (!isOwnDevice)
                  ? (msg.sender === "me" ? "other" : (msg.sender === "other" ? "me" : msg.sender))
                  : (msg.sender || "unknown");

                statements.push({
                  statement: "INSERT OR IGNORE INTO messages (id, sid, sender, text, type, timestamp, status, _ver, reply_to) VALUES (?, ?, ?, ?, ?, ?, ?, 2, ?)",
                  values: [
                    msg.id,
                    msg.sid,
                    senderValue,
                    msg.text || "",
                    msg.type || "text",
                    msg.timestamp,
                    msg.status || 1,
                    msg.reply_to || null,
                  ]
                });
                updatedSids.add(msg.sid);
              }

              if (statements.length > 0) {
                await executeTransaction(statements);
              }

              // ── media section ──
              if (Array.isArray(manifest.media) && manifest.media.length > 0) {
                const dedupedMedia = this.dedupeMediaRows(manifest.media);
                const mediaStatements: { statement: string; values: any[] }[] = [];
                let existingMediaByMessageId = new Map<string, any>();

                if (dedupedMedia.length > 0) {
                  const placeholders = dedupedMedia.map(() => "?").join(",");
                  const existingMediaRows = await queryDB(
                    `SELECT message_id, filename FROM media WHERE message_id IN (${placeholders})`,
                    dedupedMedia.map((med) => med.message_id),
                  );
                  existingMediaByMessageId = new Map(
                    existingMediaRows.map((row: any) => [row.message_id, row]),
                  );
                }

                for (const med of dedupedMedia) {
                  if (!med.message_id || !med.filename) continue;
                  const existingMedia = existingMediaByMessageId.get(
                    med.message_id,
                  );

                  if (existingMedia?.filename) {
                    mediaStatements.push({
                      statement: `UPDATE media
                        SET original_name = COALESCE(NULLIF(?, ''), original_name),
                            file_size = CASE
                              WHEN ? > COALESCE(file_size, 0) THEN ?
                              ELSE file_size
                            END,
                            mime_type = COALESCE(NULLIF(?, ''), mime_type),
                            thumbnail = COALESCE(NULLIF(?, ''), thumbnail),
                            is_compressed = CASE
                              WHEN is_compressed = 1 OR ? = 1 THEN 1
                              ELSE 0
                            END
                        WHERE message_id = ?`,
                      values: [
                        med.original_name || "",
                        Number(med.file_size || 0),
                        Number(med.file_size || 0),
                        med.mime_type || "",
                        med.thumbnail || "",
                        med.is_compressed || 0,
                        med.message_id,
                      ],
                    });
                    mediaStatements.push({
                      statement:
                        "DELETE FROM media WHERE message_id = ? AND filename != ?",
                      values: [med.message_id, existingMedia.filename],
                    });
                    continue;
                  }

                  mediaStatements.push({
                    statement: `INSERT OR IGNORE INTO media
                      (filename, original_name, file_size, size, mime_type, message_id, status, download_progress, thumbnail, is_compressed)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    values: [
                      med.filename,
                      med.original_name,
                      med.file_size,
                      med.size || 0,
                      med.mime_type,
                      med.message_id,
                      "pending",
                      0,
                      med.thumbnail,
                      med.is_compressed || 0,
                    ],
                  });
                }
                if (mediaStatements.length > 0) {
                  await executeTransaction(mediaStatements);
                }
              }

              for (const syncSid of updatedSids) {
                this.client.emit("messages_synced", { sid: syncSid });
              }
              this.client.emit("session_updated");
            }

            // Record that we successfully received a manifest from this own-device peer up to Date.now()
            // so we don't accidentally push it back redundantly if they connect later.
            await updateLastManifestSync(sid, Date.now());

            console.log(`[MessageService] Applied MANIFEST from ${sid}`);
          } catch (e) {
            console.warn("[MessageService] Error applying MANIFEST", e);
          }
          break;
        }

        case "FILE_INFO":
          await this.client.fileTransfer.handleFileInfo(sid, data, senderString);
          break;
        case "FILE_REQ_CHUNK":
          this.client.fileTransfer.streamAllChunks(
            sid,
            data.messageId,
            data.chunkIndex,
          );
          break;
        case "FILE_CHUNK":
          await this.client.fileTransfer.handleFileChunk(sid, data);
          break;
        case "CALL_START":
          if (isOwnMessage && !isOwnDeviceSession) {
            console.log("[MessageService] Ignoring CALL_START sent by our own sibling device.");
            break;
          }
          
          const incomingCallId = data?.callId;
          const isSameCall = (this.client.callService.incomingCallId === incomingCallId && incomingCallId);
          const isActuallyBusy = (this.client.callService.isCallConnected || (this.client.callService.isCalling && this.client.callService.currentCallSid !== sid));
          const isProcessingDifferentIncoming = (this.client.callService.incomingCallSid && this.client.callService.incomingCallSid !== sid);

          if (!isSameCall && (isActuallyBusy || isProcessingDifferentIncoming)) {
            console.log(
              "[MessageService] Already on call or different incoming call, rejecting new call from",
              sid,
            );
            const payloads = await this.client.encryptForSession(
              sid,
              JSON.stringify({ t: "MSG", data: { type: "CALL_BUSY", callId: incomingCallId } }),
              0,
            );
            this.client.send({ t: "MSG", sid, data: { payloads } });
            return;
          }

          if (isSameCall) {
             console.log("[MessageService] Received duplicate CALL_START for same callId, ignoring.");
             break;
          }

          console.log("[MessageService] Received CALL_START with callId:", incomingCallId);
          this.client.callService.incomingCallSid = sid;
          this.client.callService.incomingCallId = incomingCallId;

          this.client.callService.playRingtone();

          this.client.emit("call_incoming", {
            sid,
            mode: data?.mode || "Audio",
            remoteSid: sid,
          });
          break;
        case "RTC_OFFER":
          if (isOwnMessage && !isOwnDeviceSession) break;
          console.log("[MessageService] Received RTC_OFFER");
          if (data?.offer) {
            await this.client.callService.handleRTCOffer(sid, data.offer);
          }
          break;
        case "RTC_ANSWER":
          if (isOwnMessage && !isOwnDeviceSession) break;
          console.log("[MessageService] Received RTC_ANSWER");
          if (data?.answer) {
            await this.client.callService.handleRTCAnswer(sid, data.answer);
          }
          break;
        case "ICE_CANDIDATE":
          if (isOwnMessage && !isOwnDeviceSession) break;
          console.log("[MessageService] Received ICE_CANDIDATE");
          if (data?.candidate) {
            await this.client.callService.handleICECandidate(
              sid,
              data.candidate,
            );
          }
          break;
        case "CALL_BUSY":
          if (isOwnMessage && !isOwnDeviceSession) break;
          console.log("[MessageService] Remote user is busy");
          this.client.emit("notification", {
            type: "info",
            message: "User is busy on another call.",
          });
          this.client.callService.cleanupCall();
          this.client.emit("call_ended", {
            sid,
            duration: 0,
            connected: false,
          });
          break;
        case "CALL_ACCEPT":
          if (isOwnMessage && !isOwnDeviceSession) break;
          console.log(
            "[MessageService] Received CALL_ACCEPT - call is being answered",
          );
          this.client.emit("call_accepted", { sid, callId: data?.callId });
          break;
        case "CALL_END":
          if (isOwnMessage && !isOwnDeviceSession) break;
          console.log("[MessageService] Received CALL_END");
          const wasCallConnected = this.client.callService.isCallConnected;
          this.client.callService.cleanupCall();
          const callDuration = this.client.callService.callStartTime
            ? Date.now() - this.client.callService.callStartTime
            : 0;
          this.client.emit("call_ended", {
            sid,
            duration: callDuration,
            connected: wasCallConnected,
            callId: data?.callId
          });
          break;
        case "SYNC_CALL_ACCEPT":
        case "SYNC_CALL_END": {
          if (isOwnMessage && isOwnDeviceSession) {
            console.log(`[MessageService] A sibling device broadcasted ${data.type}. Stopping call state regionally.`);
            
            const isLocalIncomingCall = (!this.client.callService.isCalling && this.client.callService.incomingCallSid === data.callSid);

            if (isLocalIncomingCall) {
              const connected = this.client.callService.isCallConnected;
              const duration = this.client.callService.callStartTime
                ? Date.now() - this.client.callService.callStartTime
                : 0;
              this.client.callService.cleanupCall();
              // Emit so UI clears the ringing screen but does not log duplicates to DB
              this.client.emit("call_ended", { 
                sid: data.callSid, 
                duration, 
                connected, 
                hideLog: true, 
                reason: data.type === "SYNC_CALL_ACCEPT" ? "picked_up_elsewhere" : undefined,
                callId: data.callId
              });
            }
          }
          break;
        }
        case "METADATA":
          try {
            const meta = data;
            this.client.emit("metadata_response", meta);
          } catch (e) {
            console.error("Error handling METADATA", e);
          }
          break;
        case "IMAGE_DATA":
          try {
            this.client.emit("image_response", data);
          } catch (e) {
            console.error("Error handling IMAGE_DATA", e);
          }
          break;
        case "PROFILE_VERSION":
          try {
            const { name_version, avatar_version } = data;
            const peerRows = await queryDB(
              "SELECT peer_name_ver, peer_avatar_ver, peer_name, peer_avatar FROM sessions WHERE sid = ?",
              [sid],
            );
            if (peerRows.length) {
              const current = peerRows[0];
              if (
                name_version > (current.peer_name_ver || 0) ||
                avatar_version > (current.peer_avatar_ver || 0) ||
                (!current.peer_name && name_version > 0)
              ) {
                // Debounce: skip if we already sent a GET_PROFILE for this sid recently
                const lastReq = this.profileRequestCooldown.get(sid) || 0;
                const now = Date.now();
                if (now - lastReq < MessageService.PROFILE_REQUEST_COOLDOWN_MS) {
                  console.log(
                    `[MessageService] Skipping duplicate GET_PROFILE for ${sid} (cooldown active)`,
                  );
                  break;
                }
                this.profileRequestCooldown.set(sid, now);
                console.log(
                  `[MessageService] Peer ${sid} has newer profile (v${name_version}/${avatar_version}), requesting update...`,
                );
                const reqPayloads = await this.client.encryptForSession(
                  sid,
                  JSON.stringify({ t: "MSG", data: { type: "GET_PROFILE" } }),
                  1,
                );
                this.client.send({
                  t: "MSG",
                  sid,
                  data: { payloads: reqPayloads },
                });
              }
            }
          } catch (e) {
            console.error("Error handling PROFILE_VERSION", e);
          }
          break;
        case "GET_PROFILE":
          try {
            // If the request came from our own hash (self-echo via lingering socket
            // or same-device re-authentication), ignore it — we should never write
            // our own profile data as the peer's name.
            if (isOwnMessage) {
              console.warn(`[MessageService] Ignoring GET_PROFILE self-echo on ${sid}`);
              break;
            }
            const meRows = await queryDB(
              "SELECT public_name, public_avatar, name_version, avatar_version FROM me WHERE id = 1",
            );
            if (meRows.length) {
              const me = meRows[0];
              let avatarBase64: string | null = null;
              if (me.public_avatar) {
                if (!me.public_avatar.startsWith("data:")) {
                  try {
                    console.log(
                      `[MessageService] Reading avatar file via StorageService.getFileSrc: ${me.public_avatar}`,
                    );
                    const fileData = await StorageService.getFileSrc(
                      me.public_avatar,
                      "image/jpeg",
                    );
                    avatarBase64 = this.normalizeProfileAvatarPayload(fileData);
                    console.log(
                      `[MessageService] Loaded avatar data, length: ${fileData?.length}`,
                    );
                  } catch (e) {
                    console.warn("Failed to load avatar file", e);
                  }
                } else {
                  const parts = me.public_avatar.split(",");
                  avatarBase64 = parts.length > 1 ? parts[1] : null;
                }
              }
              const normalizedAvatar =
                this.normalizeProfileAvatarPayload(avatarBase64);
              const canInlineAvatar =
                !!normalizedAvatar &&
                normalizedAvatar.length <=
                MessageService.MAX_PROFILE_AVATAR_B64_CHARS;
              const transferId = canInlineAvatar ? null : crypto.randomUUID();
              const avatarChunks =
                !canInlineAvatar && avatarBase64
                  ? this.splitProfileAvatarIntoChunks(avatarBase64)
                  : [];

              const profilePayloads = await this.client.encryptForSession(
                sid,
                JSON.stringify({
                  t: "MSG",
                  data: {
                    type: "PROFILE_DATA",
                    name: me.public_name,
                    avatar: canInlineAvatar ? normalizedAvatar : null,
                    name_version: me.name_version,
                    avatar_version: me.avatar_version,
                    avatar_chunked: !!avatarChunks.length,
                    avatar_transfer_id: transferId,
                    avatar_total_chunks: avatarChunks.length,
                  },
                }),
                1,
              );
              this.client.send({
                t: "MSG",
                sid,
                data: { payloads: profilePayloads },
              });

              if (avatarChunks.length && transferId) {
                console.log(
                  `[MessageService] Sending chunked avatar for ${sid}: ${avatarChunks.length} chunks`,
                );
                for (
                  let chunkIndex = 0;
                  chunkIndex < avatarChunks.length;
                  chunkIndex++
                ) {
                  const chunkPayloads = await this.client.encryptForSession(
                    sid,
                    JSON.stringify({
                      t: "MSG",
                      data: {
                        type: "PROFILE_AVATAR_CHUNK",
                        transfer_id: transferId,
                        chunk_index: chunkIndex,
                        total_chunks: avatarChunks.length,
                        chunk: avatarChunks[chunkIndex],
                        name_version: me.name_version,
                        avatar_version: me.avatar_version,
                        name: me.public_name,
                      },
                    }),
                    1,
                  );
                  this.client.send({
                    t: "MSG",
                    sid,
                    data: { payloads: chunkPayloads },
                    c: chunkIndex === avatarChunks.length - 1,
                    p: 1,
                  });
                }
              }
            }
          } catch (e) {
            console.error("Error handling GET_PROFILE", e);
          }
          break;
        case "PROFILE_DATA":
          try {
            // Guard: if this PROFILE_DATA came from our own hash (self-echo via
            // a lingering or re-authenticated socket), discard it.  Storing our
            // own name as peer_name is what caused "User1 <-> User1" in the UI.
            if (isOwnMessage) {
              console.warn(`[MessageService] Ignoring PROFILE_DATA self-echo on ${sid}`);
              break;
            }
            const {
              name,
              avatar,
              name_version,
              avatar_version,
              avatar_chunked,
              avatar_transfer_id,
              avatar_total_chunks,
            } = data;
            console.log(
              `[MessageService] Received PROFILE_DATA from ${sid}: ${name}`,
            );

            let avatarFile = null;
            if (avatar && !avatar_chunked) {
              let base64 = "";
              if (avatar.startsWith("data:")) {
                base64 = avatar.split(",")[1];
              } else if (avatar.length > 256) {
                base64 = avatar;
              }
              if (base64) {
                avatarFile = await StorageService.saveProfileImage(base64, sid);
              } else {
                avatarFile = avatar;
              }
            }
            // Ensure the session row exists before updating peer version columns.
            // Newly reconstructed sessions may not have a DB row yet, causing the
            // UPDATE below to silently affect 0 rows — which leaves peer_name_ver at 0
            // and causes an infinite PROFILE_VERSION request loop.
            await executeDB(
              "INSERT OR IGNORE INTO sessions (sid) VALUES (?)",
              [sid],
            );
            if (
              avatar_chunked &&
              avatar_transfer_id &&
              avatar_total_chunks > 0
            ) {
              const chunkKey = this.profileAvatarChunkKey(
                sid,
                avatar_transfer_id,
              );
              this.profileAvatarChunkBuffer.set(chunkKey, {
                totalChunks: avatar_total_chunks,
                parts: new Array(avatar_total_chunks),
                name: name || null,
                nameVersion: name_version || 0,
                avatarVersion: avatar_version || 0,
                timestamp: Date.now(),
              });
              await executeDB(
                "UPDATE sessions SET peer_name = ?, peer_name_ver = ?, peer_avatar_ver = ? WHERE sid = ?",
                [name, name_version, avatar_version, sid],
              );
            } else {
              await executeDB(
                "UPDATE sessions SET peer_name = ?, peer_avatar = ?, peer_name_ver = ?, peer_avatar_ver = ? WHERE sid = ?",
                [name, avatarFile, name_version, avatar_version, sid],
              );
              // Bust the avatar cache so all components re-fetch the new file
              if (avatarFile) avatarCacheService.bust(avatarFile);
            }
            // Clear the per-sid cooldown so future legitimate profile bumps
            // (e.g. the peer changes their name/avatar again) can still trigger a request.
            this.profileRequestCooldown.delete(sid);
            this.client.emit("session_updated");
          } catch (e) {
            console.error("Error handling PROFILE_DATA", e);
          }
          break;
        case "PROFILE_AVATAR_CHUNK":
          try {
            const {
              transfer_id,
              chunk_index,
              total_chunks,
              chunk,
              name,
              name_version,
              avatar_version,
            } = data;
            if (
              typeof transfer_id !== "string" ||
              typeof chunk_index !== "number" ||
              typeof total_chunks !== "number" ||
              typeof chunk !== "string" ||
              chunk_index < 0 ||
              total_chunks <= 0 ||
              chunk_index >= total_chunks ||
              total_chunks > 10000
            ) {
              console.warn("[MessageService] Invalid PROFILE_AVATAR_CHUNK");
              break;
            }
            const chunkKey = this.profileAvatarChunkKey(sid, transfer_id);
            const existing = this.profileAvatarChunkBuffer.get(chunkKey);
            const buffer =
              existing ||
              ({
                totalChunks: total_chunks,
                parts: new Array(total_chunks),
                name: name || null,
                nameVersion: name_version || 0,
                avatarVersion: avatar_version || 0,
                timestamp: Date.now(),
              } as {
                totalChunks: number;
                parts: string[];
                name: string | null;
                nameVersion: number;
                avatarVersion: number;
                timestamp: number;
              });
            if (buffer.totalChunks !== total_chunks) {
              this.profileAvatarChunkBuffer.delete(chunkKey);
              break;
            }
            buffer.parts[chunk_index] = chunk;
            this.profileAvatarChunkBuffer.set(chunkKey, buffer);
            if (buffer.parts.some((part) => typeof part !== "string")) {
              break;
            }
            this.profileAvatarChunkBuffer.delete(chunkKey);
            const base64 = buffer.parts.join("");
            const avatarFile = await StorageService.saveProfileImage(
              base64,
              sid,
            );
            await executeDB(
              "UPDATE sessions SET peer_name = ?, peer_avatar = ?, peer_name_ver = ?, peer_avatar_ver = ? WHERE sid = ?",
              [
                buffer.name,
                avatarFile,
                buffer.nameVersion,
                buffer.avatarVersion,
                sid,
              ],
            );
            // Bust the avatar cache so all components re-fetch the new file
            avatarCacheService.bust(avatarFile);
            this.client.emit("session_updated");
          } catch (e) {
            console.error("Error handling PROFILE_AVATAR_CHUNK", e);
          }
          break;
        case "REACTION":
          try {
            const { messageId, emoji, action, timestamp } = data;
            const peerEmail =
              this.client.sessionService.sessions[sid]?.peerEmail || sid;
            if (action === "add") {
              const id = `${messageId}_${sid}_${emoji}`;
              await executeDB(
                "INSERT OR IGNORE INTO reactions (id, message_id, sender_email, emoji, timestamp) VALUES (?, ?, ?, ?, ?)",
                [id, messageId, peerEmail, emoji, timestamp],
              );
            } else {
              await executeDB(
                "DELETE FROM reactions WHERE message_id = ? AND sender_email = ? AND emoji = ?",
                [messageId, peerEmail, emoji],
              );
            }
            this.client.emit("reaction_update", { messageId });
            this.client.emit(`reaction_update:${messageId}`, {
              messageId,
              emoji,
              action,
            });
          } catch (e) {
            console.error("Error handling REACTION", e);
          }
          break;
      }
    } catch (e) {
      console.error("E2EE decrypt error", e);
    }
  }

  public async syncPendingMessages() {
    console.log("[MessageService] Syncing pending messages...");
    try {
      const rows = await queryDB(
        "SELECT * FROM messages WHERE status = 1 AND sender = 'me'",
      );
      for (const row of rows) {
        if (
          this.client.sessionService.sessions[row.sid] &&
          this.client.sessionService.sessions[row.sid].online
        ) {
          console.log(`[MessageService] Resending msg ${row.id} to ${row.sid}`);
          const payloads = await this.client.encryptForSession(
            row.sid,
            JSON.stringify({
              t: "MSG",
              data: {
                type:
                  row.type === "text"
                    ? "TEXT"
                    : row.type
                      ? row.type.toUpperCase()
                      : "TEXT",
                text: row.text,
                id: row.id,
                timestamp: row.timestamp,
                replyTo: row.reply_to ? JSON.parse(row.reply_to) : undefined,
              },
            }),
            1,
          );
          this.client.send({
            t: "MSG",
            sid: row.sid,
            data: { payloads },
            c: true,
            p: 1,
          });
        }
      }
    } catch (e) {
      console.error("Failed to sync pending messages:", e);
    }
  }

  public async sendReaction(
    sid: string,
    messageId: string,
    emoji: string,
    action: "add" | "remove",
  ) {
    if (!this.client.sessionService.sessions[sid]) {
      console.warn(
        `[MessageService] Session ${sid} not found, attempting reload...`,
      );
      await this.client.sessionService.loadSessions();
      if (!this.client.sessionService.sessions[sid]) {
        console.error(
          `[MessageService] Session ${sid} STILL not found after reload.`,
        );
        throw new Error("Session not found");
      }
    }

    const payloads = await this.client.encryptForSession(
      sid,
      JSON.stringify({
        t: "MSG",
        data: {
          type: "REACTION",
          messageId,
          emoji,
          action,
          timestamp: Date.now(),
        },
      }),
      1,
    );
    this.client.send({ t: "MSG", sid, data: { payloads }, c: true, p: 1 });
    try {
      if (action === "add") {
        await executeDB(
          "INSERT OR IGNORE INTO reactions (id, message_id, sender_email, emoji, timestamp) VALUES (?, ?, 'me', ?, ?)",
          [`${messageId}_me_${emoji}`, messageId, emoji, Date.now()],
        );
      } else {
        await executeDB(
          "DELETE FROM reactions WHERE message_id = ? AND sender_email = 'me' AND emoji = ?",
          [messageId, emoji],
        );
      }
      this.client.emit("reaction_update", { messageId });
      this.client.emit(`reaction_update:${messageId}`, {
        messageId,
        emoji,
        action,
        sender: "me",
      });
    } catch (e) {
      console.error("Failed to save reaction locally", e);
    }
  }

  public async broadcastProfileUpdate() {
    try {
      const rows = await queryDB(
        "SELECT name_version, avatar_version FROM me WHERE id = 1",
      );
      if (!rows.length) return;
      const { name_version, avatar_version } = rows[0];

      console.log(
        `[MessageService] Broadcasting profile update: v${name_version}/${avatar_version}`,
      );

      const sids = Object.keys(this.client.sessionService.sessions);
      for (const sid of sids) {
        if (this.client.sessionService.sessions[sid].online) {
          try {
            const payloads = await this.client.encryptForSession(
              sid,
              JSON.stringify({
                t: "MSG",
                data: {
                  type: "PROFILE_VERSION",
                  name_version,
                  avatar_version,
                },
              }),
              1,
            );
            this.client.send({
              t: "MSG",
              sid,
              data: { payloads },
              c: true,
              p: 1,
            });
          } catch (e) {
            console.error(
              `[MessageService] Failed to send profile update to ${sid}`,
              e,
            );
          }
        }
      }
    } catch (e) {
      console.error("[MessageService] Failed to broadcast profile update", e);
    }
  }

  /**
   * Sends the full device manifest to all own-device sessions (peerEmailHash === myEmailHash).
   * Manifest is an extensible object with named sections (blocks, profile, etc.).
   * Both sides send on connect; receiver merges each section independently by timestamp.
   * The server only sees encrypted bytes — zero plaintext leakage.
   */
  public async broadcastManifestToOwnDevices(includeMetadata: boolean = true): Promise<void> {
    if (this.broadcastManifestCooldownTimer) {
      clearTimeout(this.broadcastManifestCooldownTimer);
    }
    return new Promise<void>((resolve) => {
      this.broadcastManifestCooldownTimer = setTimeout(async () => {
        try {
          await this._executeBroadcastManifestToOwnDevices(includeMetadata);
        } finally {
          this.broadcastManifestCooldownTimer = null;
          resolve();
        }
      }, 500);
    });
  }

  public async broadcastSyncCallAction(action: "SYNC_CALL_ACCEPT" | "SYNC_CALL_END", callSid: string): Promise<void> {
    try {
      const myEmail = this.client.authService.userEmail;
      if (!myEmail) return;

      const myHash = await crypto.subtle
        .digest("SHA-256", new TextEncoder().encode(myEmail.trim().toLowerCase()))
        .then((b) =>
          Array.from(new Uint8Array(b))
            .map((x) => x.toString(16).padStart(2, "0"))
            .join(""),
        );

      const sessions = this.client.sessionService.sessions;
      for (const [sid, session] of Object.entries(sessions)) {
        if (
          (session as any).peerEmailHash &&
          (session as any).peerEmailHash.toLowerCase() === myHash.toLowerCase() &&
          (session as any).online
        ) {
          try {
            const payloads = await this.client.encryptForSession(
              sid,
              JSON.stringify({ t: "MSG", data: { type: action, callSid } }),
              0,
            );
            if (Object.keys(payloads).length > 0) {
              this.client.send({ t: "MSG", sid, data: { payloads }, c: false, p: 0 });
              console.log(`[MessageService] Sent ${action} for call with ${callSid} to own device session ${sid}`);
            }
          } catch (e) {
            console.warn(`[MessageService] Failed to send ${action} for ${sid}`, e);
          }
        }
      }
    } catch (e) {
      console.error(`[MessageService] broadcastSyncCallAction (${action}) failed`, e);
    }
  }

  private async _executeBroadcastManifestToOwnDevices(includeMetadata: boolean = true) {
    try {
      const myEmail = this.client.authService.userEmail;
      if (!myEmail) return;

      const myHash = await crypto.subtle
        .digest("SHA-256", new TextEncoder().encode(myEmail.trim().toLowerCase()))
        .then((b) =>
          Array.from(new Uint8Array(b))
            .map((x) => x.toString(16).padStart(2, "0"))
            .join(""),
        );

      let manifest: any = {};

      if (includeMetadata) {
        // Build the extensible manifest
        const blocks = await getAllBlockEntries();
        const requests = await getAllPendingRequestsEntries();
        const aliases = await getAllAliasesEntries();
        const profile = await getMyProfileAndVersions();

        manifest = {
          blocks, // { email, action: 'block'|'unblock', timestamp }
          requests, // { email, name, ..., action: 'pending'|'accepted'|'denied', timestamp }
          aliases, // { sid, aliasName, aliasAvatar, timestamp }
          profile: profile || undefined, // { name, avatar, nameVersion, avatarVersion }
        };
      }

      const sessions = this.client.sessionService.sessions;
      for (const [sid, session] of Object.entries(sessions)) {
        if (
          (session as any).peerEmailHash &&
          (session as any).peerEmailHash.toLowerCase() === myHash.toLowerCase() &&
          (session as any).online
        ) {
          try {
            // Determine what messages this specific peer is missing
            const lastSync = await getLastManifestSync(sid);
            const messages = await getMessagesSince(lastSync);

            // Construct peer-specific manifest by cloning the base sections and adding their messages
            const peerManifest = {
              ...manifest,
              messages,
            };

            const payloads = await this.client.encryptForSession(
              sid,
              JSON.stringify({ t: "MSG", data: { type: "MANIFEST", manifest: peerManifest } }),
              0,
            );
            if (Object.keys(payloads).length > 0) {
              this.client.send({ t: "MSG", sid, data: { payloads }, c: false, p: 0 });
              console.log(`[MessageService] Sent MANIFEST to own device session ${sid} (included ${messages.length} messages since ${lastSync})`);

              // Only update lastSync after successful encryption and enqueue to socket
              await updateLastManifestSync(sid, Date.now());
            }
          } catch (e) {
            console.warn(`[MessageService] Failed to send MANIFEST for ${sid}`, e);
          }
        }
      }
    } catch (e) {
      console.error("[MessageService] broadcastManifestToOwnDevices failed", e);
    }
  }

  /**
   * Initiates an efficient peer-to-peer sync handshake.
   * Instead of blindly pushing messages, we first send a SYNC_HINT telling the
   * peer the latest timestamp of THEIR messages we already have.  The peer then
   * responds with only the delta — messages we are missing. This prevents
   * double-bandwidth even after key rotation or on a device with a full history.
   */
  public async sendManifestToPeer(sid: string) {
    try {
      const session = this.client.sessionService.sessions[sid] as any;
      if (!session || !session.online) return;

      // Determine if this is an own-device session (same user email hash)
      let isOwnDevice = false;
      const myEmail = this.client.authService.userEmail;
      if (myEmail && session.peerEmailHash) {
        const myHash = await crypto.subtle
          .digest("SHA-256", new TextEncoder().encode(myEmail.trim().toLowerCase()))
          .then((b) =>
            Array.from(new Uint8Array(b))
              .map((x) => x.toString(16).padStart(2, "0"))
              .join(""),
          );
        isOwnDevice = (session.peerEmailHash.toLowerCase() === myHash.toLowerCase());
      }

      let latestFromYou = 0;
      let latestFromMe = 0;

      if (isOwnDevice) {
        // For own-device sessions, find the overall latest timestamp across ALL messages.
        const row = await queryDB(
          "SELECT MAX(timestamp) as ts FROM messages",
        );
        latestFromMe = Number(row?.[0]?.ts) || 0;
        latestFromYou = latestFromMe;
      } else {
        // Find the latest timestamp of messages we received FROM this peer (sender != 'me').
        const rowsYou = await queryDB(
          "SELECT MAX(timestamp) as ts FROM messages WHERE sid = ? AND sender != 'me'",
          [sid],
        );
        latestFromYou = Number(rowsYou?.[0]?.ts) || 0;

        // Find the latest timestamp of messages we sent TO this peer (sender == 'me').
        const rowsMe = await queryDB(
          "SELECT MAX(timestamp) as ts FROM messages WHERE sid = ? AND sender = 'me'",
          [sid],
        );
        latestFromMe = Number(rowsMe?.[0]?.ts) || 0;
      }

      const payloads = await this.client.encryptForSession(
        sid,
        JSON.stringify({ t: "MSG", data: { type: "SYNC_HINT", latestFromYou, latestFromMe } }),
        0,
      );

      if (Object.keys(payloads).length > 0) {
        this.client.send({ t: "MSG", sid, data: { payloads }, c: false, p: 0 });
        console.log(`[MessageService] Sent SYNC_HINT to ${sid} (latestFromYou=${latestFromYou}, latestFromMe=${latestFromMe})`);
      }
    } catch (e) {
      console.warn(`[MessageService] Failed to send SYNC_HINT to peer ${sid}`, e);
    }
  }

  public async insertMessageRecord(
    sid: string,
    text: string,
    type: string,
    sender: string,
    forceId?: string,
    replyTo?: any,
  ): Promise<string> {
    const id = forceId || crypto.randomUUID();
    const timestamp = Date.now();
    await executeDB(
      "INSERT OR IGNORE INTO messages (id, sid, sender, text, type, timestamp, status, reply_to) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
      [
        id,
        sid,
        sender,
        text,
        type,
        timestamp,
        replyTo ? JSON.stringify(replyTo) : null,
      ],
    );
    await executeDB("UPDATE sessions SET deleted_at = 0 WHERE sid = ? AND deleted_at > 0", [sid]);
    this.broadcastManifestToOwnDevices(false).catch(() => { });
    return id;
  }

  /** Coordinated sync logic to avoid "sync storms" between own devices. */
  public async coordinateSync(sid: string) {
    const session = this.client.sessionService.sessions[sid] as any;
    if (!session || !session.online) return;

    // Check if this is an own-device session (same user email hash)
    let isOwnDevice = false;
    const myEmail = this.client.authService.userEmail;
    if (myEmail && session.peerEmailHash) {
      const myHash = await crypto.subtle
        .digest("SHA-256", new TextEncoder().encode(myEmail.trim().toLowerCase()))
        .then((b) =>
          Array.from(new Uint8Array(b))
            .map((x) => x.toString(16).padStart(2, "0"))
            .join(""),
        );
      isOwnDevice = (session.peerEmailHash.toLowerCase() === myHash.toLowerCase());
    }

    if (!isOwnDevice) {
      // For normal friends, just do a regular sync handshake
      this.sendManifestToPeer(sid).catch(() => { });
      this.broadcastSyncState(sid).catch(() => { });
      return;
    }

    // --- Own-device Coordination Logic ---
    // Rule: only the device with the lexicographically SMALLER public key initiates the sync push.
    // This breaks the infinite "both devices push everything to each other at once" loop.
    const myPubKey = await this.client.authService.exportPub();
    const peerPubKeys = session.peerPubKeys || [];

    // We only care about the specific socket we are talking to, but for simplicity
    // we check all active peer keys.
    let isPrimarySyncDevice = true;
    for (const pk of peerPubKeys) {
      if (pk < myPubKey) {
        isPrimarySyncDevice = false;
        break;
      }
    }

    if (isPrimarySyncDevice) {
      console.log(`[MessageService] Coordination: We are PRIMARY sync device for ${sid}. Initiating sync...`);
      this.sendManifestToPeer(sid).catch(() => { });
    } else {
      console.log(`[MessageService] Coordination: Peer is PRIMARY sync device for ${sid}. Waiting for their MANIFEST.`);
      // We still send a SYNC_HINT so they know what we are missing,
      // but we don't blindly push our full state to them yet.
      this.sendManifestToPeer(sid).catch(() => { });
    }
  }
}

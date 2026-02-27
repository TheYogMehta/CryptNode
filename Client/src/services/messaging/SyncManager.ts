import { EventEmitter } from "events";
import { queryDB, executeDB } from "../storage/sqliteService";
import { MessageService } from "./MessageService";
import ChatClient from "../core/ChatClient";

export interface SyncProgress {
  isSyncing: boolean;
  currentSession: string | null;
  syncedMessages: number;
  totalMessages: number;
}

export class SyncManager extends EventEmitter {
  private processingQueue = false;
  private syncQueue: Map<string, { priority: number }> = new Map();
  private messageService: MessageService;

  private currentProgress: SyncProgress = {
    isSyncing: false,
    currentSession: null,
    syncedMessages: 0,
    totalMessages: 0,
  };

  private pendingInfoResolver:
    | ((data: { total: number; minTs: number; maxTs: number } | null) => void)
    | null = null;
  private pendingAckResolver: ((messages: any[]) => void) | null = null;

  constructor(messageService: MessageService) {
    super();
    this.messageService = messageService;
  }

  public getProgress(): SyncProgress {
    return this.currentProgress;
  }

  private updateProgress(updates: Partial<SyncProgress>) {
    this.currentProgress = { ...this.currentProgress, ...updates };
    this.emit("progress_update", this.currentProgress);
  }

  public prioritizeSession(sid: string) {
    this.syncQueue.set(sid, { priority: 0 }); // Highest priority
    this.processQueue(); // Kickstart if idle
  }

  public enqueueSync(sid: string, priority: number = 2) {
    if (!this.syncQueue.has(sid)) {
      this.syncQueue.set(sid, { priority });
      this.processQueue();
    }
  }

  private getNextSession(): string | null {
    if (this.syncQueue.size === 0) return null;

    // Sort by priority (0 is highest)
    const sorted = Array.from(this.syncQueue.entries()).sort(
      (a, b) => a[1].priority - b[1].priority,
    );
    const sid = sorted[0][0];
    this.syncQueue.delete(sid);
    return sid;
  }

  private async getBestSyncTarget(sid: string): Promise<string | null> {
    const session = ChatClient.sessions[sid];
    if (!session) return null;

    // 1. Try own devices first
    if (Array.isArray(session.ownPubKeys)) {
      const myActiveKey = await ChatClient.getPublicKeyString();
      const otherOwnKeys = session.ownPubKeys.filter((k) => k !== myActiveKey);
      if (otherOwnKeys.length > 0) {
        return otherOwnKeys[0]; // Pick first available own device
      }
    }

    // 2. Fall back to peer
    if (
      session.online &&
      Array.isArray(session.peerPubKeys) &&
      session.peerPubKeys.length > 0
    ) {
      return session.peerPubKeys[0];
    }

    return null;
  }

  private async processQueue() {
    if (this.processingQueue) return;
    this.processingQueue = true;

    try {
      while (true) {
        const sid = this.getNextSession();
        if (!sid) break;

        const targetPubKey = await this.getBestSyncTarget(sid);
        if (!targetPubKey) {
          console.log(
            `[SyncManager] Session ${sid} has no online targets to sync with.`,
          );
          continue;
        }

        await this.runSyncForSession(sid, targetPubKey);
      }
    } catch (e) {
      console.error("[SyncManager] Queue error:", e);
    } finally {
      this.processingQueue = false;
      this.updateProgress({
        isSyncing: false,
        currentSession: null,
        totalMessages: 0,
        syncedMessages: 0,
      });
    }
  }

  private async runSyncForSession(sid: string, targetPubKey: string) {
    console.log(
      `[SyncManager] Starting sync protocol for ${sid} from target ${targetPubKey}`,
    );
    this.updateProgress({
      isSyncing: true,
      currentSession: sid,
      syncedMessages: 0,
      totalMessages: 0,
    });

    try {
      // 1. Fetch Sync Info
      const info = await new Promise<{
        total: number;
        minTs: number;
        maxTs: number;
      } | null>((resolve) => {
        this.pendingInfoResolver = resolve;
        this.messageService.requestSyncInfo(sid, targetPubKey);

        setTimeout(() => {
          if (this.pendingInfoResolver) {
            this.pendingInfoResolver(null);
          }
        }, 5000); // 5 sec timeout
      });

      this.pendingInfoResolver = null;

      if (!info || info.total === 0) {
        console.log(`[SyncManager] Target has no messages for ${sid}`);
        return;
      }

      const rows = await queryDB(
        "SELECT COUNT(*) as cnt FROM messages WHERE sid = ?",
        [sid],
      );
      const localCount = rows[0]?.cnt || 0;

      if (localCount >= info.total) {
        console.log(
          `[SyncManager] Session ${sid} already fully synced (${localCount}/${info.total})`,
        );
        return;
      }

      this.updateProgress({
        totalMessages: info.total,
        syncedMessages: localCount,
      });

      // 2. Fetch Latest 20 batch (DESC) if we don't have them
      let messagesSyncedInBatch = 0;
      const latestMessages = await new Promise<any[]>((resolve) => {
        this.pendingAckResolver = resolve;
        // Request latest limit=20 descending
        this.messageService.requestSync(
          sid,
          Date.now(),
          "DESC",
          20,
          targetPubKey,
        );

        setTimeout(() => {
          if (this.pendingAckResolver) {
            this.pendingAckResolver([]);
          }
        }, 8000);
      });
      this.pendingAckResolver = null;
      messagesSyncedInBatch += latestMessages.length;
      this.updateProgress({
        syncedMessages: Math.min(
          localCount + messagesSyncedInBatch,
          info.total,
        ),
      });

      // 3. Loop fetching chronological history (ASC) from our last_sync_timestamp
      while (true) {
        const tsRow = await queryDB(
          "SELECT last_sync_timestamp FROM sessions WHERE sid = ?",
          [sid],
        );
        const lastSyncTimestamp = tsRow[0]?.last_sync_timestamp || 0;

        if (lastSyncTimestamp >= info.maxTs) {
          console.log(`[SyncManager] Finished history sync for ${sid}`);
          break; // Fully caught up historically
        }

        const batch = await new Promise<any[]>((resolve) => {
          this.pendingAckResolver = resolve;
          this.messageService.requestSync(
            sid,
            lastSyncTimestamp,
            "ASC",
            50,
            targetPubKey,
          );
          setTimeout(() => {
            if (this.pendingAckResolver) {
              this.pendingAckResolver([]);
            }
          }, 8000);
        });

        this.pendingAckResolver = null;

        if (batch.length === 0) {
          break; // No more blocks to sync or timeout
        }

        messagesSyncedInBatch += batch.length;
        this.updateProgress({
          syncedMessages: Math.min(
            localCount + messagesSyncedInBatch,
            info.total,
          ),
        });

        if (batch.length < 50) {
          break; // Reached the end
        }
      }
    } catch (e) {
      console.error("[SyncManager] Error syncing session:", sid, e);
    }
  }

  public handleSyncInfoAck(
    sid: string,
    total: number,
    minTs: number,
    maxTs: number,
  ) {
    if (this.pendingInfoResolver) {
      this.pendingInfoResolver({ total, minTs, maxTs });
      this.pendingInfoResolver = null;
    }
  }

  public handlePeerOffline(sid: string) {
    this.syncQueue.delete(sid);
  }

  public async handleSyncStateBroadcast(
    sid: string,
    total: number,
    minTs: number,
    maxTs: number,
  ) {
    try {
      const rows = await queryDB(
        "SELECT COUNT(*) as cnt FROM messages WHERE sid = ?",
        [sid],
      );
      const localCount = rows[0]?.cnt || 0;

      if (localCount < total) {
        if (
          !this.syncQueue.has(sid) &&
          this.currentProgress.currentSession !== sid
        ) {
          this.enqueueSync(sid, 2);
        }
      } else {
        this.syncQueue.delete(sid); // Already synced, remove from queue
      }
    } catch (e) {
      console.error("[SyncManager] Error handling sync state broadcast", e);
    }
  }

  public async handleSyncAck(
    sid: string,
    messages: any[],
    direction: "ASC" | "DESC",
  ) {
    if (this.pendingAckResolver) {
      this.pendingAckResolver(messages);
      this.pendingAckResolver = null;
    }

    if (messages.length > 0 && direction === "ASC") {
      let maxTimestamp = 0;
      for (const m of messages) {
        if (m.timestamp > maxTimestamp) maxTimestamp = m.timestamp;
      }
      if (maxTimestamp > 0) {
        await this.updateLastSync(sid, maxTimestamp);
      }
    }
  }

  public async updateLastSync(sid: string, highestTimestamp: number) {
    if (highestTimestamp <= 0) return;
    try {
      await executeDB(
        "UPDATE sessions SET last_sync_timestamp = MAX(last_sync_timestamp, ?) WHERE sid = ?",
        [highestTimestamp, sid],
      );
    } catch (e) {
      console.error(
        "[SyncManager] Failed to update last_sync_timestamp for session:",
        sid,
        e,
      );
    }
  }
}

import { queryDB, executeDB } from "../storage/sqliteService";
import { MessageService } from "./MessageService";

export class SyncManager {
  private processingQueue = false;
  private syncQueue: Set<string> = new Set();
  private messageService: MessageService;

  constructor(messageService: MessageService) {
    this.messageService = messageService;
  }

  /**
   * Add a session manually to the synchronization queue and process.
   */
  public enqueueSync(sid: string) {
    this.syncQueue.add(sid);
    this.processQueue();
  }

  private async processQueue() {
    if (this.processingQueue || this.syncQueue.size === 0) return;
    this.processingQueue = true;

    try {
      while (this.syncQueue.size > 0) {
        const sid = Array.from(this.syncQueue)[0];
        this.syncQueue.delete(sid);

        await this.syncSession(sid);
      }
    } catch (e) {
      console.error("[SyncManager] Queue error:", e);
    } finally {
      this.processingQueue = false;
    }
  }

  private async syncSession(sid: string) {
    try {
      const rows = await queryDB(
        "SELECT last_sync_timestamp FROM sessions WHERE sid = ?",
        [sid],
      );
      const lastSyncTimestamp =
        rows.length > 0 ? rows[0].last_sync_timestamp : 0;

      console.log(
        `[SyncManager] Requesting sync for session ${sid} from timestamp ${lastSyncTimestamp}`,
      );
      await this.messageService.requestSync(sid, lastSyncTimestamp);
    } catch (e) {
      console.error(
        "[SyncManager] Failed to dispatch SYNC_REQ for session:",
        sid,
        e,
      );
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

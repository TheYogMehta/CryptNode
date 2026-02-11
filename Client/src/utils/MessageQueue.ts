interface QueueItem {
  type: string;
  payload: any;
  priority: number;
  timestamp: number;
}

export class MessageQueue {
  private isProcessing = false;
  private queue: QueueItem[] = [];
  private handler: (item: {
    type: string;
    payload: any;
    priority: number;
  }) => Promise<void>;

  constructor(
    handler: (item: {
      type: string;
      payload: any;
      priority: number;
    }) => Promise<void>,
  ) {
    this.handler = handler;
  }

  async init() {
    this.process();
  }

  async enqueue(type: string, payload: any, priority: number = 1) {
    this.queue.push({ type, payload, priority, timestamp: Date.now() });
    this.process();
  }

  private async process() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.queue.length > 0) {
        this.queue.sort(
          (a, b) => a.priority - b.priority || a.timestamp - b.timestamp,
        );
        const task = this.queue.shift();
        if (!task) break;

        try {
          await this.handler({
            type: task.type,
            payload: task.payload,
            priority: task.priority,
          });
        } catch (e) {
          console.error(`Failed to process task ${task.type}`, e);
        }
      }
    } catch (e) {
      console.error("Queue processing error", e);
    } finally {
      this.isProcessing = false;
    }
  }
}

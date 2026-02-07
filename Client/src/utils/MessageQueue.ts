export class MessageQueue {
  private queue: Array<() => Promise<void>> = [];
  private isProcessing = false;

  enqueue(task: () => Promise<void>) {
    this.queue.push(task);
    this.process();
  }

  private async process() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        try {
          await task();
        } catch (error) {
          console.error("Error processing queue task:", error);
        }
      }
    }

    this.isProcessing = false;
  }
}

export class MessageQueue {
  private highPriority: Array<() => Promise<void>> = [];
  private mediumPriority: Array<() => Promise<void>> = [];
  private lowPriority: Array<() => Promise<void>> = [];
  private isProcessing = false;

  enqueue(task: () => Promise<void>, priority: number = 1) {
    if (priority === 0) {
      this.highPriority.push(task);
    } else if (priority === 2) {
      this.lowPriority.push(task);
    } else {
      this.mediumPriority.push(task);
    }
    this.process();
  }

  private async process() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (
      this.highPriority.length > 0 ||
      this.mediumPriority.length > 0 ||
      this.lowPriority.length > 0
    ) {
      let task: (() => Promise<void>) | undefined;

      if (this.highPriority.length > 0) {
        task = this.highPriority.shift();
      } else if (this.mediumPriority.length > 0) {
        task = this.mediumPriority.shift();
      } else {
        task = this.lowPriority.shift();
      }

      if (task) {
        try {
          await task();
        } catch (error) {
          console.error("Error processing queue task:", error);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    this.isProcessing = false;
  }
}

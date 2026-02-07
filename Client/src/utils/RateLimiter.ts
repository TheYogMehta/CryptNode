export class RateLimiter {
  private timestamps: number[] = [];
  private limit: number;
  private interval: number;

  constructor(limit: number, interval: number) {
    this.limit = limit;
    this.interval = interval;
  }

  isAllowed(): boolean {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t <= this.interval);
    if (this.timestamps.length < this.limit) {
      this.timestamps.push(now);
      return true;
    }
    return false;
  }
}

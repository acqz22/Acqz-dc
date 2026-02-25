export class RateLimiter {
  private last = 0;

  constructor(private readonly minIntervalMs = 150) {}

  async wait(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.last;
    if (elapsed < this.minIntervalMs) {
      await new Promise((r) => setTimeout(r, this.minIntervalMs - elapsed));
    }
    this.last = Date.now();
  }
}

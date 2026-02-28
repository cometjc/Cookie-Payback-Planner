export const RATE_SMOOTHING_WINDOW_MS = 5000;

type RateSample = {
  at: number;
  units: number;
};

export class SlidingRateWindow {
  private readonly windowMs: number;
  private samples: RateSample[] = [];

  constructor(windowMs = RATE_SMOOTHING_WINDOW_MS) {
    this.windowMs = Math.max(1000, Number.isFinite(windowMs) ? Math.floor(windowMs) : RATE_SMOOTHING_WINDOW_MS);
  }

  reset() {
    this.samples = [];
  }

  add(units: number, now = Date.now()) {
    if (!Number.isFinite(units) || units <= 0) {
      return;
    }
    this.samples.push({ at: now, units });
    this.prune(now);
  }

  ratePerSec(now = Date.now()) {
    this.prune(now);
    if (!this.samples.length) {
      return 0;
    }
    const totalUnits = this.samples.reduce((total, sample) => total + sample.units, 0);
    const oldestAt = this.samples[0].at;
    const elapsedMs = Math.max(1000, Math.min(this.windowMs, now - oldestAt));
    return totalUnits / (elapsedMs / 1000);
  }

  private prune(now: number) {
    const cutoff = now - this.windowMs;
    while (this.samples.length && this.samples[0].at < cutoff) {
      this.samples.shift();
    }
  }
}

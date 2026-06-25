/**
 * RollingStats — circular buffer for latency percentile tracking (MON-009).
 *
 * Keeps the last N samples in memory (no DB, no Redis).
 * Computes p50 and p95 on-demand by sorting a copy of the buffer.
 *
 * Usage:
 *   const stats = new RollingStats(100);
 *   stats.record(durationMs);
 *   const { p50Ms, p95Ms, samples } = stats.percentiles();
 */
export class RollingStats {
  private readonly buf: number[];
  private readonly size: number;
  private head = 0;
  private count = 0;

  constructor(size = 100) {
    this.size = size;
    this.buf = new Array(size).fill(0);
  }

  record(valueMs: number): void {
    this.buf[this.head] = valueMs;
    this.head = (this.head + 1) % this.size;
    if (this.count < this.size) this.count++;
  }

  percentiles(): { p50Ms: number | null; p95Ms: number | null; samples: number } {
    if (this.count === 0) return { p50Ms: null, p95Ms: null, samples: 0 };

    const sorted = this.buf.slice(0, this.count).sort((a, b) => a - b);
    const p = (pct: number) => sorted[Math.floor((pct / 100) * (sorted.length - 1))];

    return {
      p50Ms: Math.round(p(50)),
      p95Ms: Math.round(p(95)),
      samples: this.count,
    };
  }

  reset(): void {
    this.head = 0;
    this.count = 0;
  }
}

export class LoginLimiter {
  private readonly buckets = new Map<string, { failures: number; until: number }>();
  retryAfter(key: string, now: number): number {
    const entry = this.buckets.get(key);
    if (!entry) return 0;
    if (now >= entry.until) { this.buckets.delete(key); return 0; }
    return entry.failures >= 10 ? Math.ceil((entry.until - now) / 1000) : 0;
  }
  fail(key: string, now: number) {
    for (const [id, entry] of this.buckets) if (entry.until <= now) this.buckets.delete(id);
    const existing = this.buckets.get(key);
    if (existing) { existing.failures += 1; return; }
    if (this.buckets.size >= 10000) this.buckets.delete(this.buckets.keys().next().value!);
    this.buckets.set(key, { failures: 1, until: now + 15 * 60 * 1000 });
  }
  clear(key: string) { this.buckets.delete(key); }
}

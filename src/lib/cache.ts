// Process memory only. Never serialize live Qloo responses to disk or Next's fetch cache.
export class TtlCache<T> {
  private entries = new Map<string, { value: T; expires: number }>();

  constructor(private ttlMs = 10 * 60 * 1000, private maxEntries = 500) {}

  get(key: string, now = Date.now()): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return structuredClone(entry.value);
  }

  set(key: string, value: T, now = Date.now()): void {
    for (const [storedKey, entry] of this.entries) {
      if (entry.expires <= now) this.entries.delete(storedKey);
    }
    if (!this.entries.has(key) && this.entries.size >= this.maxEntries) {
      const firstKey = this.entries.keys().next().value;
      if (firstKey !== undefined) this.entries.delete(firstKey);
    }
    this.entries.set(key, { value: structuredClone(value), expires: now + this.ttlMs });
  }
}

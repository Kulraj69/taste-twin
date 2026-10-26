// Adapted from sarkari-speedrun. Limits apply to every submitted plan, including demos.
// Memory is per process/serverless instance; deployments need shared storage for a hard global cap.
export const PER_IP_LIMIT = 5;
export const PER_IP_WINDOW_MS = 60 * 60 * 1000;
export const DAILY_LIMIT = 200;
export const IP_NOTE = "Your twin needs a breather. You’ve used your 5 plans in the last hour; please try again when a slot frees up.";
export const DAY_NOTE = "Our twins have planned 200 weekends today. Come back after midnight UTC for a fresh start.";

export type LimitResult = { ok: true; remaining: number } | { ok: false; note: string; retryAfter: number };

export class PlanLimiter {
  private hits = new Map<string, number[]>();
  private day = "";
  private dayCount = 0;

  constructor(private perIp = PER_IP_LIMIT, private windowMs = PER_IP_WINDOW_MS, private daily = DAILY_LIMIT) {}

  take(ip: string, now = Date.now()): LimitResult {
    const today = new Date(now).toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.dayCount = 0;
    }
    for (const [key, times] of this.hits) {
      if (!times.some((time) => now - time < this.windowMs)) this.hits.delete(key);
    }
    if (this.dayCount >= this.daily) {
      const tomorrow = Date.parse(`${today}T00:00:00Z`) + 86_400_000;
      return { ok: false, note: DAY_NOTE, retryAfter: Math.max(1, Math.ceil((tomorrow - now) / 1000)) };
    }
    const recent = (this.hits.get(ip) ?? []).filter((time) => now - time < this.windowMs);
    if (recent.length >= this.perIp) {
      return { ok: false, note: IP_NOTE, retryAfter: Math.max(1, Math.ceil(((recent[0] ?? now) + this.windowMs - now) / 1000)) };
    }
    recent.push(now);
    this.hits.set(ip, recent);
    this.dayCount++;
    return { ok: true, remaining: this.perIp - recent.length };
  }
}

export const planLimiter = new PlanLimiter();

export function clientIp(request: Request): string {
  // Vercel overwrites x-vercel-forwarded-for. Only trust generic proxy headers
  // outside Vercel, where the deployer's reverse proxy must overwrite them.
  if (process.env.VERCEL) return request.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() || "unknown";
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip")?.trim() || "unknown";
}

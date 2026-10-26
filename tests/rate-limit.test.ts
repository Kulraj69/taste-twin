import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIp, DAY_NOTE, IP_NOTE, PlanLimiter } from "@/lib/rate-limit";

const HOUR = 60 * 60 * 1000;
afterEach(() => vi.unstubAllEnvs());

describe("plan rate limits", () => {
  it("allows five requests per IP per rolling hour", () => {
    const limiter = new PlanLimiter();
    for (let i = 0; i < 5; i++) expect(limiter.take("one", i)).toMatchObject({ ok: true, remaining: 4 - i });
    expect(limiter.take("one", 5)).toMatchObject({ ok: false, note: IP_NOTE, retryAfter: 3600 });
    expect(limiter.take("two", 5).ok).toBe(true);
    expect(limiter.take("one", HOUR).ok).toBe(true);
  });
  it("enforces 200/day across IPs and resets at midnight UTC", () => {
    const limiter = new PlanLimiter();
    const start = Date.parse("2026-10-27T23:59:00Z");
    for (let i = 0; i < 200; i++) expect(limiter.take(`ip-${i}`, start).ok).toBe(true);
    expect(limiter.take("another", start)).toEqual({ ok: false, note: DAY_NOTE, retryAfter: 60 });
    expect(limiter.take("another", start + 60_000).ok).toBe(true);
  });
  it("does not charge denied requests against the daily quota", () => {
    const limiter = new PlanLimiter(1, HOUR, 2);
    expect(limiter.take("one", 0).ok).toBe(true);
    expect(limiter.take("one", 1).ok).toBe(false);
    expect(limiter.take("two", 1).ok).toBe(true);
  });
  it("keeps a rolling hourly cap across midnight", () => {
    const limiter = new PlanLimiter(1);
    const now = Date.parse("2026-10-27T23:59:00Z");
    limiter.take("one", now);
    expect(limiter.take("one", now + 60_000)).toMatchObject({ ok: false, note: IP_NOTE });
  });
  it("uses Vercel's overwritten IP header in production", () => {
    vi.stubEnv("VERCEL", "1");
    expect(clientIp(new Request("https://local.test", { headers: { "x-vercel-forwarded-for": "1.2.3.4", "x-forwarded-for": "spoofed" } }))).toBe("1.2.3.4");
    expect(clientIp(new Request("https://local.test", { headers: { "x-forwarded-for": "spoofed" } }))).toBe("unknown");
  });
});

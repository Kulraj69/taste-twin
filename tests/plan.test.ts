import { describe, expect, it, vi } from "vitest";
import { createPlan } from "@/lib/plan";
import { QlooClient } from "@/lib/qloo";
import { TtlCache } from "@/lib/cache";
import { MOCK_EXAMPLES, mockResponse } from "@/mock/qloo";
import { handlePlanRequest } from "@/lib/http";
import { MAX_BODY_BYTES } from "@/lib/input";
import { PlanLimiter } from "@/lib/rate-limit";
import type { QlooEndpoint } from "@/lib/types";

const sample = { city: "Lisbon", favourites: MOCK_EXAMPLES[0].favourites };
const mockPlan = (input = sample) => createPlan(input, { qloo: new QlooClient() });
const request = (body: unknown = sample, ip = "test") => new Request("http://local.test/api/plan", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });

describe("mock plan end to end", () => {
  it.each(MOCK_EXAMPLES)("builds a complete weekend for $title without a network", async (example) => {
    const fetcher = vi.fn<typeof fetch>(async () => { throw new Error("No network allowed"); });
    const plan = await createPlan({ city: example.city, favourites: example.favourites }, { qloo: new QlooClient({ fetch: fetcher }), fetch: fetcher });
    expect(plan.mode).toBe("mock");
    expect(plan.days.map((day) => day.picks.length)).toEqual([1, 2, 2]);
    expect(plan.persona.tags.length).toBeGreaterThan(0);
    expect(fetcher).not.toHaveBeenCalled();
    const picks = plan.days.flatMap((day) => day.picks);
    expect(new Set(picks.map((pick) => pick.entity.entityId)).size).toBe(5);
    for (const pick of picks) {
      expect(pick.entity.entityId).toMatch(/^mock-/);
      expect(pick.receipt.affinity).toBe(pick.entity.affinity);
      expect(pick.receipt.sharedTags.length).toBeGreaterThan(0);
      expect(pick.receipt.signal.params).toEqual(plan.trace.find((step) => step.id === pick.receipt.signal.traceId)?.params);
    }
    expect(plan.trace.every((step) => step.source === "synthetic" && step.status === "ok" && step.ms >= 0)).toBe(true);
    expect(plan.trace.some((step) => step.params["filter.type"] === "urn:tag")).toBe(true);
    expect(plan.trace.every((step) => ["/search", "/v2/tags", "/v2/insights"].includes(step.endpoint))).toBe(true);
  });
  it.each(["stop", "length"])("keeps every pick and receipt independent of %s narration", async (finish_reason) => {
    const baseline = await mockPlan();
    const intros = {
      friday: "Visit Invented Bistro at 8pm; your reservation is confirmed.",
      saturday: "Take a detour.",
      sunday: "Turn a page.",
    };
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ choices: [{
      finish_reason, message: { role: "assistant", content: JSON.stringify(intros) },
    }] }));
    const narrated = await createPlan(sample, {
      qloo: new QlooClient(), nebiusApiKey: "synthetic-test-only", fetch: fetcher,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(narrated.narration).toBe(finish_reason === "stop" ? "nebius" : "template");
    expect(narrated.days.map((day) => day.intro)).toEqual(finish_reason === "stop"
      ? Object.values(intros) : baseline.days.map((day) => day.intro));
    // Timing is measured on each run; all other evidence must stay identical.
    const evidence = (plan: typeof baseline) => ({
      ...plan,
      narration: undefined,
      days: plan.days.map((day) => ({ ...day, intro: undefined })),
      trace: plan.trace.map((step) => ({ ...step, ms: undefined })),
    });
    expect(evidence(narrated)).toEqual(evidence(baseline));
    const sent = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(JSON.parse(sent.messages[1].content)).toEqual(baseline.days.map((day) => ({
      day: day.id, activities: day.picks.map((pick) => pick.kind),
    })));
  });
  it("supports CSV-only and cuisine-only weekends", async () => {
    const csv = "Date,Name,Year,Letterboxd URI,Rating\n2026-01-01,The Last Tram to Marigold,2021,https://example.invalid/film,5";
    const csvPlan = await createPlan({ favourites: [], city: "Tokyo", letterboxdCsv: csv }, { qloo: new QlooClient() });
    expect(csvPlan.days.flatMap((day) => day.picks)).toHaveLength(5);
    expect(csvPlan.seeds[0].entity.entityId).toBe("mock-seed-0-0");
    const cuisine = await mockPlan({ favourites: ["dish: noodles"], city: "Tokyo" });
    expect(cuisine.seeds).toHaveLength(0);
    expect(cuisine.days[0].picks[0].receipt.seedTags).toHaveLength(1);
  });
  it("keeps requests local to the selected city without locating artists or books", async () => {
    const plan = await mockPlan({ ...sample, city: "Berlin" });
    const insights = plan.trace.filter((step) => step.endpoint === "/v2/insights");
    for (const step of insights) {
      if (step.params["filter.type"] === "urn:entity:place") expect(step.params["filter.location.query"]).toBe("Berlin");
      else expect(step.params).not.toHaveProperty("filter.location.query");
    }
  });
});

describe("controlled live transport failures (all test data is synthetic)", () => {
  function clientFor(transform: (url: URL, body: unknown) => unknown) {
    return new QlooClient({ apiKey: "test-only-key", cache: new TtlCache(), fetch: async (url) => {
      const parsed = new URL(String(url));
      const body = mockResponse(parsed.pathname as QlooEndpoint, Object.fromEntries(parsed.searchParams));
      return Response.json(transform(parsed, body));
    } });
  }
  it("relaxes an empty lunch cuisine filter while preserving city/category provenance", async () => {
    const qloo = clientFor((url, body) => url.searchParams.get("filter.tags")?.includes(",") ? { success: true, results: { entities: [] } } : body);
    const plan = await createPlan(sample, { qloo });
    const lunch = plan.days[1].picks.find((pick) => pick.kind === "restaurant")!;
    expect(lunch).toBeDefined();
    expect(lunch.receipt.signal.params["filter.location.query"]).toBe("Lisbon");
    expect(lunch.receipt.signal.params["filter.tags"]).toBe("mock-tag-restaurant");
    expect(plan.trace.some((step) => step.label.startsWith("Broaden lunch"))).toBe(true);
  });
  it("leaves an unavailable pick open without fabricating a replacement", async () => {
    const qloo = clientFor((url, body) => url.searchParams.get("filter.type") === "urn:entity:artist" ? { success: false } : body);
    const plan = await createPlan(sample, { qloo });
    expect(plan.mode).toBe("live");
    expect(plan.days.flatMap((day) => day.picks)).toHaveLength(4);
    expect(plan.warnings.some((warning) => warning.includes("artist"))).toBe(true);
    expect(plan.trace.some((step) => step.status === "error")).toBe(true);
  });
  it("does not mistake a barbershop tag for a bar category", async () => {
    const qloo = clientFor((url, body) => url.pathname === "/v2/tags" && url.searchParams.get("filter.query") === "bar"
      ? { results: { tags: [{ id: "mock-barbershop", name: "Barbershop", type: "urn:tag:category:place" }] } } : body);
    const plan = await createPlan(sample, { qloo });
    expect(plan.days[0].picks).toHaveLength(0);
    expect(plan.warnings.some((warning) => warning.includes("valid bar category"))).toBe(true);
    expect(plan.trace.some((step) => step.params["filter.tags"] === "mock-barbershop")).toBe(false);
  });
  it("rejects an entirely failed resolution instead of silently using demo data", async () => {
    await expect(createPlan(sample, { qloo: clientFor(() => ({ success: false })) })).rejects.toThrow("Qloo");
  });
  it("returns a helpful no-match error for empty searches", async () => {
    await expect(createPlan({ favourites: ["movie: nowhere"], city: "Lisbon" }, { qloo: clientFor(() => ({ results: [] })) })).rejects.toMatchObject({ status: 422 });
  });
});

describe("POST /api/plan", () => {
  it("returns the full mock plan JSON", async () => {
    const response = await handlePlanRequest(request(), { env: {}, limiter: new PlanLimiter() });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body.mode).toBe("mock");
    expect(body.days).toHaveLength(3);
    expect(body.trace.length).toBeGreaterThan(5);
  });
  it("returns friendly 429 plus Retry-After and performs no work on rejection", async () => {
    const plan = vi.fn(async () => mockPlan());
    const response = await handlePlanRequest(request(), { limiter: new PlanLimiter(0), plan, now: () => 0 });
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await response.json()).error).toContain("breather");
    expect(plan).not.toHaveBeenCalled();
  });
  it("rejects non-JSON, malformed JSON and too many favourites", async () => {
    expect((await handlePlanRequest(new Request("http://local.test", { method: "POST", body: "{}" }))).status).toBe(415);
    expect((await handlePlanRequest(new Request("http://local.test", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }))).status).toBe(400);
    expect((await handlePlanRequest(request({ favourites: Array(21).fill("x"), city: "Lisbon" }))).status).toBe(400);
  });
  it.each(["application/jsonp", "application/json-invalid"])("rejects a misleading JSON media type: %s", async (contentType) => {
    const plan = vi.fn(async () => mockPlan());
    const response = await handlePlanRequest(new Request("http://local.test/api/plan", {
      method: "POST", headers: { "Content-Type": contentType }, body: JSON.stringify(sample),
    }), { env: {}, limiter: new PlanLimiter(), plan });
    expect(response.status).toBe(415);
    expect(plan).not.toHaveBeenCalled();
  });
  it("accepts a JSON media type with charset parameters", async () => {
    const response = await handlePlanRequest(new Request("http://local.test/api/plan", {
      method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify(sample),
    }), { env: {}, limiter: new PlanLimiter() });
    expect(response.status).toBe(200);
  });
  it("enforces the CSV byte cap before planning", async () => {
    const plan = vi.fn(async () => mockPlan());
    const response = await handlePlanRequest(request({ ...sample, letterboxdCsv: "x".repeat(204_801) }), { plan });
    expect(response.status).toBe(413);
    expect(plan).not.toHaveBeenCalled();
  });
  it("enforces the streaming body cap even without Content-Length", async () => {
    const response = await handlePlanRequest(new Request("http://local.test", { method: "POST", headers: { "Content-Type": "application/json" }, body: "x".repeat(MAX_BODY_BYTES + 1) }));
    expect(response.status).toBe(413);
  });
  it("does not leak raw provider errors or secret-like internal strings", async () => {
    const response = await handlePlanRequest(request(), { limiter: new PlanLimiter(), plan: async () => { throw new Error("private-provider-body-test-key"); } });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private-provider");
  });
});

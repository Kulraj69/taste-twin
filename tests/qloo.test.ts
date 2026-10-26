import { describe, expect, it, vi } from "vitest";
import { buildInsightParams, buildSearchParams, buildTagParams, parseEntities, parseTags, QlooClient } from "@/lib/qloo";
import { TtlCache } from "@/lib/cache";
import { mockResponse } from "@/mock/qloo";
import type { QlooEndpoint } from "@/lib/types";

describe("Qloo parameter building", () => {
  it("resolves entity types separately from insights", () => {
    expect(buildSearchParams({ input: "movie: Amber", query: "Amber", kind: "movie" })).toEqual({ query: "Amber", types: "urn:entity:movie", take: "5" });
    expect(buildSearchParams({ input: "Amber", query: "Amber", kind: "any" }).types).toContain("urn:entity:book");
  });
  it("looks up tags by filter.query", () => {
    expect(buildTagParams("silky noodles")).toEqual({ "filter.query": "silky noodles", take: "10" });
  });
  it("uses city and discovered category IDs only on places", () => {
    expect(buildInsightParams({ type: "place", city: "Lisbon", seedIds: ["mock-a", "mock-a", "mock-b"], filterTagIds: ["mock-bar"] })).toMatchObject({ "filter.type": "urn:entity:place", "filter.location.query": "Lisbon", "signal.interests.entities": "mock-a,mock-b", "filter.tags": "mock-bar" });
    const artist = buildInsightParams({ type: "artist", city: "Lisbon", seedIds: ["mock-a"], filterTagIds: ["mock-bar"] });
    expect(artist).not.toHaveProperty("filter.location.query");
    expect(artist).not.toHaveProperty("filter.tags");
  });
  it("uses urn:tag for taste analysis", () => {
    const params = buildInsightParams({ type: "tag", seedIds: ["mock-a"], city: "Lisbon" });
    expect(params["filter.type"]).toBe("urn:tag");
    expect(params).not.toHaveProperty("filter.location.query");
  });
  it("intersects category and cuisine filters instead of accepting either one", () => {
    expect(buildInsightParams({ type: "place", city: "Lisbon", seedIds: ["mock-a"], filterTagIds: ["mock-restaurant", "mock-noodles"] })["operator.filter.tags"]).toBe("intersection");
  });
  it("supports cuisine-only signals, and rejects unanchored queries", () => {
    expect(buildInsightParams({ type: "book", seedIds: [], signalTagIds: ["mock-cuisine"] })["signal.interests.tags"]).toBe("mock-cuisine");
    expect(() => buildInsightParams({ type: "book", seedIds: [] })).toThrow("signal");
    expect(() => buildInsightParams({ type: "place", seedIds: ["mock-a"] })).toThrow("city");
  });
});

describe("defensive Qloo response parsing", () => {
  it("parses search and insight envelopes", () => {
    const search = parseEntities(mockResponse("/search", { query: "The Last Tram to Marigold", types: "urn:entity:movie" }));
    expect(search[0]).toMatchObject({ entityId: "mock-seed-0-0", name: "The Last Tram to Marigold", affinity: null });
    expect(parseEntities({ success: true, results: { entities: [{ entity_id: "mock-1", name: "The Ember Cup", query: { affinity: 0.987654321 }, type: "urn:entity:place" }] } })[0].affinity).toBe(0.987654321);
  });
  it("preserves raw tag names and zero affinity, without coercion", () => {
    const parsed = parseEntities({ results: [{ entity_id: "mock-a", name: "Imaginary", query: { affinity: 0 }, tags: [{ id: "mock-tag", name: "MiXeD   Case", type: "mock-type" }] }] });
    expect(parsed[0].affinity).toBe(0);
    expect(parsed[0].tags[0].name).toBe("MiXeD   Case");
    expect(parseEntities({ results: [{ entity_id: "mock-b", name: "Another", query: { affinity: "0.9" } }] })[0].affinity).toBeNull();
  });
  it("skips malformed entries and handles nullable properties", () => {
    const entities = parseEntities({ results: [null, {}, { name: "No ID" }, { entity_id: "mock-a", name: "Tiny Fiction", properties: null, tags: [null, {}], types: [1, "urn:entity:book"] }] });
    expect(entities).toHaveLength(1);
    expect(entities[0]).toMatchObject({ properties: {}, tags: [], types: ["urn:entity:book"] });
  });
  it("rejects error envelopes and unrecognized shapes", () => {
    for (const payload of [null, {}, { success: false, results: [] }, { results: { things: [] } }]) {
      expect(() => parseEntities(payload)).toThrow();
    }
    expect(parseEntities({ success: true, results: { entities: [] } })).toEqual([]);
  });
  it("accepts tag_id/subtype and tags or entities envelopes", () => {
    const tag = { tag_id: "mock-tag-1", name: "Moonlight", subtype: "urn:tag:genre", query: { affinity: 0.8 } };
    expect(parseTags({ results: { tags: [tag] } })[0]).toEqual({ id: "mock-tag-1", name: "Moonlight", type: "urn:tag:genre", affinity: 0.8 });
    expect(parseTags({ results: { entities: [{ entity_id: "mock-tag-2", name: "Slow" }] } })[0].id).toBe("mock-tag-2");
  });
});

describe("live transport and memory cache", () => {
  it("makes GET calls with header auth, caches in memory, and records cache hits", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ results: [{ entity_id: "mock-live-transport", name: "Test Fiction" }] }));
    let now = 0;
    const client = new QlooClient({ apiKey: "test-only-key", fetch: fetcher, now: () => now, cache: new TtlCache(100) });
    const params = { query: "Fiction", types: "urn:entity:movie" };
    await client.entities("/search", params, "First");
    await client.entities("/search", params, "Again");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toMatch(/^https:\/\/hackathon.api.qloo.com\/search\?/);
    expect(String(url)).not.toContain("test-only-key");
    expect(init).toMatchObject({ method: "GET", headers: { "X-Api-Key": "test-only-key" }, cache: "no-store" });
    expect(client.trace[1].source).toBe("cache");
    expect(JSON.stringify(client.trace)).not.toContain("test-only-key");
    now = 100;
    await client.entities("/search", params, "Expired");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("never caches failed or malformed responses and never switches to mock", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ success: false, results: [] }));
    const client = new QlooClient({ apiKey: "test-only", fetch: fetcher, cache: new TtlCache() });
    await expect(client.entities("/search", { query: "x" }, "Fail")).rejects.toThrow();
    await expect(client.entities("/search", { query: "x" }, "Fail again")).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(client.mode).toBe("live");
    expect(client.trace.every((step) => step.status === "error")).toBe(true);
  });
  it("never calls the network in mock mode", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => { throw new Error("No network"); });
    const client = new QlooClient({ fetch: fetcher });
    const result = await client.entities("/search", { query: "Invented", types: "urn:entity:book" }, "Mock");
    expect(result.items[0].entityId).toMatch(/^mock-/);
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.step.source).toBe("synthetic");
  });
  it("treats a documented search 404 as no match, not an upstream outage", async () => {
    const client = new QlooClient({ apiKey: "test-only", cache: new TtlCache(), fetch: async () => new Response(null, { status: 404 }) });
    expect((await client.entities("/search", { query: "Absent fiction" }, "No match")).items).toEqual([]);
    expect(client.trace[0]).toMatchObject({ count: 0, status: "ok" });
    await expect(client.entities("/v2/insights", { "filter.type": "urn:entity:book" }, "Bad endpoint")).rejects.toThrow();
  });
  it("separates caches for different credentials", async () => {
    const cache = new TtlCache();
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ results: [] }));
    for (const apiKey of ["test-a", "test-b"]) await new QlooClient({ apiKey, cache, fetch: fetcher }).entities("/search", { query: "x" }, "Lookup");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("all synthetic routes use mock-prefixed identities", () => {
    const queries: [QlooEndpoint, Record<string, string>][] = [
      ["/search", { query: "test", types: "urn:entity:movie" }],
      ["/v2/tags", { "filter.query": "bar" }],
      ["/v2/insights", { "filter.type": "urn:tag" }],
      ["/v2/insights", { "filter.type": "urn:entity:artist" }],
    ];
    for (const [endpoint, params] of queries) {
      const body = mockResponse(endpoint, params);
      const text = JSON.stringify(body);
      const identifiers = [...text.matchAll(/"(?:entity_id|id)":"([^"]+)"/g)].map((match) => match[1]);
      expect(identifiers.length).toBeGreaterThan(0);
      expect(identifiers.every((id) => id.startsWith("mock-"))).toBe(true);
    }
  });
  it("evicts old cache entries and protects entries from mutation", () => {
    const cache = new TtlCache<{ n: number }>(100, 2);
    cache.set("a", { n: 1 }, 0); cache.set("b", { n: 2 }, 0); cache.set("c", { n: 3 }, 0);
    expect(cache.get("a", 0)).toBeUndefined();
    const value = cache.get("b", 0)!; value.n = 9;
    expect(cache.get("b", 0)).toEqual({ n: 2 });
    expect(cache.get("b", 100)).toBeUndefined();
  });
});

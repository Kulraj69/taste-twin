import { describe, expect, it } from "vitest";
import { buildReceipt } from "@/lib/receipts";
import type { QlooEntity, QlooTag, ResolvedSeed, TraceStep } from "@/lib/types";

const tag = (id: string, name = "Moonlight"): QlooTag => ({ id, name, type: "mock-genre", affinity: null });
const entity = (id: string, tags: QlooTag[], affinity: number | null = null): QlooEntity => ({ entityId: id, name: "A Fictional Place", tags, affinity, types: [], properties: {}, subtype: null, popularity: null });
const seeds: ResolvedSeed[] = [{ input: "My fictional film", entity: entity("mock-seed", [tag("mock-shared")]), searchTraceId: "step-1" }];
const insight: TraceStep = { id: "step-4", label: "Pick a bar", endpoint: "/v2/insights", params: { "filter.type": "urn:entity:place", "signal.interests.entities": "mock-seed", "filter.location.query": "Lisbon" }, count: 1, ms: 12, source: "live", status: "ok" };

describe("deterministic taste receipts", () => {
  it("preserves the returned score, picked ID and exact query", () => {
    const receipt = buildReceipt({ mode: "live", seeds, entity: entity("mock-pick", [tag("mock-shared")], 0.123456789), insight, tasteTags: [], tasteTraceId: null });
    expect(receipt.affinity).toBe(0.123456789);
    expect(receipt.signal.params).toEqual(insight.params);
    expect(receipt.picked.entityId).toBe("mock-pick");
    expect(receipt.seeds[0].searchTraceId).toBe("step-1");
    expect(receipt.tagEvidence[0]).toEqual({ tagId: "mock-shared", seedIds: ["mock-seed"], inTasteAnalysis: false });
  });
  it("matches tags by ID, never by a similar name", () => {
    const receipt = buildReceipt({ mode: "live", seeds, entity: entity("mock-pick", [tag("mock-different", "Moonlight")]), insight, tasteTags: [], tasteTraceId: null });
    expect(receipt.sharedTags).toEqual([]);
    expect(receipt.affinity).toBeNull();
  });
  it("preserves picked tag spelling and distinguishes analysis evidence", () => {
    const pickedTag = tag("mock-analysis", "Quiet  WORDS");
    const receipt = buildReceipt({ mode: "live", seeds, entity: entity("mock-pick", [pickedTag]), insight, tasteTags: [tag("mock-analysis", "quiet words")], tasteTraceId: "step-2" });
    expect(receipt.sharedTags).toEqual([pickedTag]);
    expect(receipt.tagEvidence).toEqual([{ tagId: "mock-analysis", seedIds: [], inTasteAnalysis: true }]);
    expect(receipt.signal.tagAnalysisTraceId).toBe("step-2");
  });
  it("does not attribute evidence to a seed that was not sent in the query", () => {
    const receipt = buildReceipt({ mode: "live", seeds, entity: entity("mock-pick", [tag("mock-shared")]), insight: { ...insight, params: { "signal.interests.entities": "mock-other" } }, tasteTags: [], tasteTraceId: null });
    expect(receipt.seeds).toEqual([]);
    expect(receipt.sharedTags).toEqual([]);
  });
  it("labels synthetic evidence and shows cuisine-only interests", () => {
    const receipt = buildReceipt({ mode: "mock", seeds: [], entity: entity("mock-pick", [], 0), insight: { ...insight, params: { "signal.interests.tags": "mock-noodles" } }, tasteTags: [], tasteTraceId: null, signalTags: [tag("mock-noodles"), tag("mock-unused")] });
    expect(receipt.seedTags.map((item) => item.id)).toEqual(["mock-noodles"]);
    expect(receipt.affinity).toBe(0);
    expect(receipt.note).toContain("invented");
  });
});

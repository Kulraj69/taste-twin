import type { Mode, QlooEntity, QlooTag, Receipt, ResolvedSeed, TraceStep } from "./types";

export function buildReceipt(options: {
  mode: Mode;
  seeds: ResolvedSeed[];
  entity: QlooEntity;
  insight: TraceStep;
  tasteTags: QlooTag[];
  signalTags?: QlooTag[];
  tasteTraceId: string | null;
}): Receipt {
  const { seeds, entity, insight, tasteTags } = options;
  const signalledIds = new Set((insight.params["signal.interests.entities"] ?? "").split(",").filter(Boolean));
  const actualSeeds = seeds.filter((seed) => signalledIds.has(seed.entity.entityId));
  const analysisIds = new Set(tasteTags.map((tag) => tag.id));
  const sharedTags = entity.tags.filter((tag) => analysisIds.has(tag.id) || actualSeeds.some((seed) => seed.entity.tags.some((seedTag) => seedTag.id === tag.id)));
  return {
    source: options.mode,
    seeds: actualSeeds.map((seed) => ({ name: seed.entity.name, entityId: seed.entity.entityId, input: seed.input, searchTraceId: seed.searchTraceId })),
    seedTags: (options.signalTags ?? []).filter((tag) => (insight.params["signal.interests.tags"] ?? "").split(",").includes(tag.id)),
    signal: { endpoint: "/v2/insights", params: { ...insight.params }, traceId: insight.id, tagAnalysisTraceId: options.tasteTraceId },
    picked: { name: entity.name, entityId: entity.entityId },
    affinity: entity.affinity,
    sharedTags,
    tagEvidence: sharedTags.map((tag) => ({
      tagId: tag.id,
      seedIds: actualSeeds.filter((seed) => seed.entity.tags.some((seedTag) => seedTag.id === tag.id)).map((seed) => seed.entity.entityId),
      inTasteAnalysis: analysisIds.has(tag.id),
    })),
    note: options.mode === "mock"
      ? "Synthetic demo evidence. All entities, tags and scores are invented."
      : "Affinity is Qloo’s returned score for the complete signal shown here, not a probability or an individual seed-to-pick score.",
  };
}

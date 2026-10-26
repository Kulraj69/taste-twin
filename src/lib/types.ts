export type Mode = "mock" | "live";
export type EntityType = "movie" | "artist" | "book" | "place";
export type FavouriteKind = EntityType | "dish" | "any";
export type DayId = "friday" | "saturday" | "sunday";
export type PickKind = "bar" | "restaurant" | "artist" | "book" | "cafe";
export type QlooEndpoint = "/search" | "/v2/tags" | "/v2/insights";

export interface QlooTag {
  id: string;
  name: string;
  type: string;
  affinity: number | null;
}

export interface QlooEntity {
  entityId: string;
  name: string;
  types: string[];
  subtype: string | null;
  properties: Record<string, unknown>;
  tags: QlooTag[];
  affinity: number | null;
  popularity: number | null;
}

export interface TraceStep {
  id: string;
  label: string;
  endpoint: QlooEndpoint;
  params: Record<string, string>;
  count: number;
  ms: number;
  source: "live" | "cache" | "synthetic";
  status: "ok" | "error";
}

export interface ResolvedSeed {
  input: string;
  entity: QlooEntity;
  searchTraceId: string;
}

export interface Receipt {
  source: Mode;
  seeds: { name: string; entityId: string; input: string; searchTraceId: string }[];
  seedTags: QlooTag[];
  signal: {
    endpoint: "/v2/insights";
    params: Record<string, string>;
    traceId: string;
    tagAnalysisTraceId: string | null;
  };
  picked: { name: string; entityId: string };
  affinity: number | null;
  sharedTags: QlooTag[];
  tagEvidence: { tagId: string; seedIds: string[]; inTasteAnalysis: boolean }[];
  note: string;
}

export interface WeekendPick {
  id: PickKind;
  kind: PickKind;
  time: string;
  title: string;
  entity: QlooEntity;
  detail: string;
  receipt: Receipt;
}

export interface WeekendDay {
  id: DayId;
  name: string;
  subtitle: string;
  intro: string;
  picks: WeekendPick[];
}

export interface WeekendPlan {
  mode: Mode;
  city: string;
  seeds: ResolvedSeed[];
  cuisineTags: QlooTag[];
  persona: { title: string; tags: QlooTag[]; traceId: string | null };
  days: WeekendDay[];
  trace: TraceStep[];
  warnings: string[];
  narration: "template" | "nebius";
}

export interface PlanInput {
  favourites: string[];
  letterboxdCsv?: string;
  city: string;
}

export interface Favourite {
  input: string;
  query: string;
  kind: FavouriteKind;
  year?: number;
}

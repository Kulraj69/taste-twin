import { createHash } from "node:crypto";
import { TtlCache } from "./cache";
import { QlooError } from "./errors";
import { mockResponse } from "@/mock/qloo";
import type { EntityType, Favourite, Mode, QlooEndpoint, QlooEntity, QlooTag, TraceStep } from "./types";

export const QLOO_BASE_URL = "https://hackathon.api.qloo.com";
const liveCache = new TtlCache<unknown>();

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseTag(value: unknown): QlooTag | null {
  const item = record(value);
  const id = item.id ?? item.tag_id ?? item.entity_id;
  if (typeof id !== "string" || !id || typeof item.name !== "string" || !item.name) return null;
  return {
    id,
    name: item.name,
    type: typeof item.type === "string" ? item.type : typeof item.subtype === "string" ? item.subtype : "",
    affinity: numeric(record(item.query).affinity),
  };
}

function assertSuccess(value: unknown): Record<string, unknown> {
  const body = record(value);
  if (!Object.keys(body).length || body.success === false || !("results" in body)) throw new QlooError();
  return body;
}

export function parseEntities(value: unknown): QlooEntity[] {
  const body = assertSuccess(value);
  const results = Array.isArray(body.results) ? body.results : record(body.results).entities;
  if (!Array.isArray(results)) throw new QlooError();
  return results.flatMap((value) => {
    const item = record(value);
    if (typeof item.entity_id !== "string" || !item.entity_id || typeof item.name !== "string" || !item.name) return [];
    const types = Array.isArray(item.types)
      ? item.types.filter((type): type is string => typeof type === "string")
      : typeof item.type === "string" ? [item.type] : [];
    return [{
      entityId: item.entity_id,
      name: item.name,
      types,
      subtype: typeof item.subtype === "string" ? item.subtype : null,
      properties: record(item.properties),
      tags: Array.isArray(item.tags) ? item.tags.map(parseTag).filter((tag): tag is QlooTag => tag !== null) : [],
      affinity: numeric(record(item.query).affinity),
      popularity: numeric(item.popularity),
    }];
  });
}

export function parseTags(value: unknown): QlooTag[] {
  const body = assertSuccess(value);
  const results = Array.isArray(body.results)
    ? body.results
    : record(body.results).tags ?? record(body.results).entities;
  if (!Array.isArray(results)) throw new QlooError();
  return results.map(parseTag).filter((tag): tag is QlooTag => tag !== null);
}

export function buildSearchParams(favourite: Favourite): Record<string, string> {
  const types = favourite.kind === "any" || favourite.kind === "dish"
    ? ["movie", "artist", "book"] : [favourite.kind];
  return { query: favourite.query, types: types.map((type) => `urn:entity:${type}`).join(","), take: "5" };
}

export function buildTagParams(query: string): Record<string, string> {
  return { "filter.query": query, take: "10" };
}

export function buildInsightParams(options: {
  type: EntityType | "tag";
  seedIds: string[];
  city?: string;
  filterTagIds?: string[];
  signalTagIds?: string[];
}): Record<string, string> {
  const params: Record<string, string> = {
    "filter.type": options.type === "tag" ? "urn:tag" : `urn:entity:${options.type}`,
    take: options.type === "tag" ? "12" : "6",
  };
  if (options.seedIds.length) params["signal.interests.entities"] = [...new Set(options.seedIds)].join(",");
  if (options.signalTagIds?.length) params["signal.interests.tags"] = [...new Set(options.signalTagIds)].join(",");
  if (!params["signal.interests.entities"] && !params["signal.interests.tags"]) throw new Error("An insight needs a resolved taste signal.");
  if (options.type === "place") {
    if (!options.city?.trim()) throw new Error("Place insights need a city.");
    params["filter.location.query"] = options.city.trim();
    if (options.filterTagIds?.length) {
      const tagIds = [...new Set(options.filterTagIds)];
      params["filter.tags"] = tagIds.join(",");
      // Qloo defaults to union. A cuisine must narrow the restaurant category,
      // rather than also admitting arbitrary places that match just the cuisine.
      if (tagIds.length > 1) params["operator.filter.tags"] = "intersection";
    }
  }
  return params;
}

interface QlooOptions {
  apiKey?: string;
  fetch?: typeof fetch;
  now?: () => number;
  cache?: TtlCache<unknown>;
  signal?: AbortSignal;
}

export class QlooClient {
  readonly mode: Mode;
  readonly trace: TraceStep[] = [];
  private fetcher: typeof fetch;
  private clock: () => number;
  private cache: TtlCache<unknown>;
  private key: string;
  private keyFingerprint: string;
  private signal?: AbortSignal;

  constructor(options: QlooOptions = {}) {
    this.key = options.apiKey?.trim() ?? "";
    this.mode = this.key ? "live" : "mock";
    this.fetcher = options.fetch ?? fetch;
    this.clock = options.now ?? Date.now;
    this.cache = options.cache ?? liveCache;
    this.keyFingerprint = this.key ? createHash("sha256").update(this.key).digest("hex") : "mock";
    this.signal = options.signal;
  }

  async entities(endpoint: "/search" | "/v2/insights", params: Record<string, string>, label: string) {
    return this.request(endpoint, params, label, parseEntities);
  }

  async tags(endpoint: "/v2/tags" | "/v2/insights", params: Record<string, string>, label: string) {
    return this.request(endpoint, params, label, parseTags);
  }

  private async request<T>(endpoint: QlooEndpoint, params: Record<string, string>, label: string, parser: (body: unknown) => T[]) {
    const started = this.clock();
    const step: TraceStep = {
      id: `step-${this.trace.length + 1}`, label, endpoint, params: { ...params }, count: 0,
      ms: 0, source: this.mode === "mock" ? "synthetic" : "live", status: "ok",
    };
    this.trace.push(step);
    try {
      this.signal?.throwIfAborted();
      let body: unknown;
      if (this.mode === "mock") body = mockResponse(endpoint, params);
      else {
        const query = new URLSearchParams(params);
        query.sort();
        const cacheKey = `${this.keyFingerprint}:${endpoint}?${query}`;
        body = this.cache.get(cacheKey, this.clock());
        if (body !== undefined) step.source = "cache";
        else {
          const timeout = AbortSignal.timeout(12_000);
          const response = await this.fetcher(`${QLOO_BASE_URL}${endpoint}?${query}`, {
            method: "GET",
            headers: { "X-Api-Key": this.key, Accept: "application/json" },
            cache: "no-store",
            signal: this.signal ? AbortSignal.any([this.signal, timeout]) : timeout,
          });
          // Search documents 404 as "No results". Other endpoints still fail.
          if (response.status === 404 && endpoint === "/search") {
            void response.body?.cancel().catch(() => {});
            body = { success: true, results: [] };
          }
          else {
            if (!response.ok) {
              void response.body?.cancel().catch(() => {});
              throw new QlooError(response.status === 429 ? 503 : 502);
            }
            body = await response.json();
          }
          this.signal?.throwIfAborted();
          // Validate before caching; error payloads must never turn into cached success.
          parser(body);
          this.cache.set(cacheKey, body, this.clock());
        }
      }
      const items = parser(body);
      step.count = items.length;
      return { items, step };
    } catch (error) {
      step.status = "error";
      throw error instanceof QlooError ? error : new QlooError();
    } finally {
      step.ms = Math.max(0, this.clock() - started);
    }
  }
}

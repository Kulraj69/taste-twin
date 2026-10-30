import { afterEach, describe, expect, it, vi } from "vitest";
import { handlePlanRequest } from "@/lib/http";
import { PlanLimiter } from "@/lib/rate-limit";
import { MAX_BODY_BYTES } from "@/lib/input";
import { QlooClient } from "@/lib/qloo";
import { narrateDays } from "@/lib/llm";
import { createPlan } from "@/lib/plan";
import { TtlCache } from "@/lib/cache";

const sample = { city: "Lisbon", favourites: ["dish: noodles"] };
function request(body: ReadableStream<Uint8Array> | string, signal?: AbortSignal) {
  return new Request("http://local.test/api/plan", {
    method: "POST", headers: { "Content-Type": "application/json" }, body, signal,
    ...{ duplex: "half" },
  });
}
function setup() {
  const limiter = new PlanLimiter();
  const take = vi.spyOn(limiter, "take");
  const plan = vi.fn(async () => { throw new Error("Planning must not start"); });
  return { limiter, take, plan, env: {} };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("request lifetime (synthetic streams, no provider calls)", () => {
  it.each(["qloo-fetch", "qloo-body", "narration-fetch", "narration-body"])("expires the provider timer during %s", async (phase) => {
    vi.useFakeTimers();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), ms);
      return controller.signal;
    });
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const signal = init!.signal!;
      if (phase.endsWith("fetch")) return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("synthetic timeout")), { once: true });
      });
      return new Response(new ReadableStream({ start(stream) {
        signal.addEventListener("abort", () => stream.error(new Error("synthetic timeout")), { once: true });
      } }));
    });
    const qloo = phase.startsWith("qloo");
    const result = qloo
      ? new QlooClient({ apiKey: "synthetic-test-value", fetch: fetcher, cache: new TtlCache<unknown>() }).entities("/search", { query: "fixture" }, "Fixture")
      : narrateDays([], { apiKey: "synthetic-test-value", fetch: fetcher });
    let settled = false;
    const observed = result.then((value) => { settled = true; return { value, failed: false }; }, () => {
      settled = true; return { value: null, failed: true };
    });
    const milliseconds = qloo ? 12_000 : 8_000;
    await vi.advanceTimersByTimeAsync(milliseconds - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    const outcome = await observed;
    expect(timeout).toHaveBeenCalledWith(milliseconds);
    if (qloo) expect(outcome.failed).toBe(true);
    else expect(outcome.value).toMatchObject({ source: "template" });
  });
  it.each(["search404", "qloo503", "narration503"])("cancels an unused %s body without awaiting cleanup", async (kind) => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const fetcher = vi.fn<typeof fetch>(async () => new Response(new ReadableStream({ cancel }), {
      status: kind === "search404" ? 404 : 503,
    }));
    if (kind === "narration503") {
      expect(await narrateDays([], { apiKey: "synthetic-test-value", fetch: fetcher })).toMatchObject({ source: "template" });
    } else {
      const result = new QlooClient({ apiKey: "synthetic-test-value", fetch: fetcher, cache: new TtlCache<unknown>() })
        .entities("/search", { query: "fixture" }, "Fixture");
      if (kind === "search404") expect((await result).items).toEqual([]);
      else await expect(result).rejects.toThrow();
    }
    expect(cancel).toHaveBeenCalledOnce();
  });
  it.each(["qloo", "narration"])("interrupts an in-flight %s response body", async (provider) => {
    const controller = new AbortController();
    let reading!: () => void;
    const started = new Promise<void>((resolve) => { reading = resolve; });
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const signal = init!.signal!;
      return new Response(new ReadableStream({ start(stream) {
        signal.addEventListener("abort", () => stream.error(new Error("synthetic body interrupted")), { once: true });
        reading();
      } }));
    });
    const result = provider === "qloo"
      ? new QlooClient({ apiKey: "synthetic-test-value", fetch: fetcher, signal: controller.signal }).entities("/search", { query: "fixture" }, "Fixture")
      : narrateDays([], { apiKey: "synthetic-test-value", fetch: fetcher, signal: controller.signal });
    const observed = result.then((value) => ({ value, failed: false }), () => ({ value: null, failed: true }));
    await started;
    controller.abort();
    const outcome = await observed;
    expect(fetcher).toHaveBeenCalledOnce();
    if (provider === "qloo") expect(outcome.failed).toBe(true);
    else expect(outcome.value).toMatchObject({ source: "template" });
  });
  it("expires the request deadline during cooperative planning", async () => {
    vi.useFakeTimers();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), ms);
      return controller.signal;
    });
    const response = handlePlanRequest(request(JSON.stringify(sample)), {
      env: {}, limiter: new PlanLimiter(),
      plan: (_input, signal) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("private deadline")), { once: true });
      }),
    });
    await vi.advanceTimersByTimeAsync(52_001);
    const result = await response;
    expect(timeout).toHaveBeenCalledWith(52_000);
    expect(result.status).toBe(408);
    expect(await result.text()).not.toContain("private");
  });
  it("does not cache a body completed after cancellation", async () => {
    const controller = new AbortController();
    const cache = new TtlCache<unknown>();
    const set = vi.spyOn(cache, "set");
    const fetcher = vi.fn<typeof fetch>(async () => {
      const response = Response.json({ success: true, results: [] });
      const json = response.json.bind(response);
      response.json = async () => { const body = await json(); controller.abort(); return body; };
      return response;
    });
    await expect(new QlooClient({ apiKey: "synthetic-test-value", fetch: fetcher, cache, signal: controller.signal })
      .entities("/search", { query: "fixture" }, "Fixture")).rejects.toThrow();
    expect(set).not.toHaveBeenCalled();
    await new QlooClient({ apiKey: "synthetic-test-value", fetch: fetcher, cache })
      .entities("/search", { query: "fixture" }, "Fixture");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each(["discovery", "lunch"])("stops after cancellation during %s", async (stage) => {
    const controller = new AbortController();
    const qloo = new QlooClient();
    const tags = qloo.tags.bind(qloo);
    vi.spyOn(qloo, "tags").mockImplementation(async (...args) => {
      const value = await tags(...args);
      if (stage === "discovery" && args[0] === "/v2/insights") controller.abort();
      return value;
    });
    const entities = qloo.entities.bind(qloo);
    const calls = vi.spyOn(qloo, "entities").mockImplementation(async (...args) => {
      const value = await entities(...args);
      if (stage === "lunch" && args[2].startsWith("Discover restaurant")) {
        controller.abort();
        return { ...value, items: [] };
      }
      return value;
    });
    await expect(createPlan(sample, { qloo, signal: controller.signal })).rejects.toThrow();
    if (stage === "discovery") expect(calls).not.toHaveBeenCalled();
    expect(calls.mock.calls.some((args) => args[2].startsWith("Broaden lunch"))).toBe(false);
  });
  it("returns a safe interruption response when planning rejects on disconnect", async () => {
    const controller = new AbortController();
    const response = await handlePlanRequest(request(JSON.stringify(sample), controller.signal), {
      env: {}, limiter: new PlanLimiter(),
      plan: async (_input, signal) => {
        controller.abort(new Error("private disconnect reason"));
        signal.throwIfAborted();
        throw new Error("unreachable");
      },
    });
    expect(response.status).toBe(408);
    expect(await response.text()).not.toContain("private");
  });
  it("does not call a supplied client for an already aborted plan", async () => {
    const qloo = new QlooClient();
    const tags = vi.spyOn(qloo, "tags");
    await expect(createPlan(sample, { qloo, signal: AbortSignal.abort() })).rejects.toThrow();
    expect(tags).not.toHaveBeenCalled();
  });
  it("stops after resolution when a supplied client does not observe cancellation", async () => {
    const controller = new AbortController();
    const qloo = new QlooClient();
    const original = qloo.tags.bind(qloo);
    const tags = vi.spyOn(qloo, "tags").mockImplementation(async (...args) => {
      const value = await original(...args);
      controller.abort();
      return value;
    });
    await expect(createPlan(sample, { qloo, signal: controller.signal })).rejects.toThrow();
    expect(tags).toHaveBeenCalledOnce();
  });
  it("rejects an already disconnected valid request before quota", async () => {
    const options = setup();
    const response = await handlePlanRequest(request(JSON.stringify(sample), AbortSignal.abort()), options);
    expect(response.status).toBe(408);
    expect(options.take).not.toHaveBeenCalled();
    expect(options.plan).not.toHaveBeenCalled();
  });
  it("bounds an unfinished upload without waiting for cancellation", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const options = setup();
    const result = handlePlanRequest(request(new ReadableStream({ cancel })), options);
    await vi.advanceTimersByTimeAsync(4_001);
    expect((await result).status).toBe(408);
    expect(cancel).toHaveBeenCalledOnce();
    expect(options.take).not.toHaveBeenCalled();
    expect(options.plan).not.toHaveBeenCalled();
  }, 800);
  it("stops an upload on disconnect even if cancel rejects", async () => {
    const controller = new AbortController();
    const cancel = vi.fn(async () => { throw new Error("private diagnostic"); });
    const options = setup();
    const result = handlePlanRequest(request(new ReadableStream({ cancel }), controller.signal), options);
    controller.abort(new Error("private disconnect"));
    const response = await result;
    expect(response.status).toBe(408);
    expect(await response.text()).not.toContain("private");
    expect(cancel).toHaveBeenCalledOnce();
    expect(options.take).not.toHaveBeenCalled();
  }, 800);
  it("preserves 413 when oversized-stream cancellation never settles", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(new Uint8Array(MAX_BODY_BYTES + 1)); },
      cancel() { return new Promise<void>(() => {}); },
    });
    const options = setup();
    expect((await handlePlanRequest(request(body), options)).status).toBe(413);
    expect(options.take).not.toHaveBeenCalled();
  }, 800);
  it("preserves 413 when cancellation rejects", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(new Uint8Array(MAX_BODY_BYTES + 1)); },
      cancel() { throw new Error("private cancellation"); },
    });
    expect((await handlePlanRequest(request(body), setup())).status).toBe(413);
  });
  it("accepts split multibyte input and releases its reader", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ ...sample, city: "Café" }));
    const body = new ReadableStream<Uint8Array>({ start(c) {
      for (const byte of bytes) c.enqueue(new Uint8Array([byte]));
      c.close();
    } });
    const response = await handlePlanRequest(request(body), { env: {}, limiter: new PlanLimiter() });
    expect(response.status).toBe(200);
    expect((await response.json()).city).toBe("Café");
    expect(body.locked).toBe(false);
  });
  it("does not dispatch Qloo work after cancellation", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new QlooClient({ apiKey: "synthetic-only", fetch: fetcher, signal: AbortSignal.abort() });
    await expect(client.entities("/search", { query: "synthetic" }, "Synthetic")).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not dispatch narration after cancellation", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const result = await narrateDays([], { apiKey: "synthetic-only", fetch: fetcher, signal: AbortSignal.abort() });
    expect(result.source).toBe("template");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

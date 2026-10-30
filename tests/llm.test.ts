import { describe, expect, it, vi } from "vitest";
import { narrateDays, NEBIUS_MODEL, NEBIUS_URL } from "@/lib/llm";
import type { WeekendDay } from "@/lib/types";
import { createPlan } from "@/lib/plan";
import { QlooClient } from "@/lib/qloo";
import { MOCK_EXAMPLES } from "@/mock/qloo";

const days: WeekendDay[] = [{ id: "friday", name: "Friday", subtitle: "", intro: "", picks: [] }];

describe("narration only", () => {
  it("uses deterministic templates without credentials", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const first = await narrateDays(days, { fetch: fetcher });
    expect(first).toEqual(await narrateDays(days));
    expect(first.source).toBe("template");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses the exact Nebius configuration and disables thinking", async () => {
    const intros = { friday: "Follow the glow.", saturday: "Take the delicious detour.", sunday: "Turn a page, take a sip." };
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(intros) } }] }));
    expect(await narrateDays(days, { apiKey: "test-only", fetch: fetcher })).toEqual({ intros, source: "nebius" });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(NEBIUS_URL);
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ model: NEBIUS_MODEL, max_tokens: 400, chat_template_kwargs: { enable_thinking: false } });
    expect(body.messages[0].content).toContain("/no_think");
    expect(body.messages[1].content).not.toContain("receipt");
  });
  it.each(["not JSON", '{"friday":"only one day"}', '<think>hmm</think>{"friday":"hi"}'])("falls back on unusable narration: %s", async (content) => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content } }] }));
    expect((await narrateDays(days, { apiKey: "test-only", fetch: fetcher })).source).toBe("template");
  });
  it("sends only day IDs and activity kinds, never populated receipt data", async () => {
    const plan = await createPlan({ city: "Lisbon", favourites: MOCK_EXAMPLES[0].favourites }, { qloo: new QlooClient() });
    const first = plan.days[0].picks[0];
    first.entity.name = "PRIVATE_SYNTHETIC_VENUE";
    first.receipt.note = "PRIVATE_SYNTHETIC_RECEIPT";
    first.receipt.affinity = 0.123456789;
    const original = structuredClone(plan.days);
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ choices: [] }));
    await narrateDays(plan.days, { apiKey: "synthetic-only", fetch: fetcher });
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.messages[1]).toEqual({ role: "user", content: JSON.stringify([
      { day: "friday", activities: ["bar"] },
      { day: "saturday", activities: ["restaurant", "artist"] },
      { day: "sunday", activities: ["book", "cafe"] },
    ]) });
    expect(JSON.stringify(body)).not.toMatch(/PRIVATE_SYNTHETIC|0\.123456789/);
    expect(plan.days).toEqual(original);
  });
  it("falls back on a timeout or provider error", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => { throw new Error("timeout"); });
    expect((await narrateDays(days, { apiKey: "test-only", fetch: fetcher })).source).toBe("template");
  });
});

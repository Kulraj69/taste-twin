import { describe, expect, it, vi } from "vitest";
import { narrateDays, NEBIUS_MODEL, NEBIUS_URL } from "@/lib/llm";
import type { WeekendDay } from "@/lib/types";

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
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ choices: [{ message: { content: JSON.stringify(intros) } }] }));
    expect(await narrateDays(days, { apiKey: "test-only", fetch: fetcher })).toEqual({ intros, source: "nebius" });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(NEBIUS_URL);
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ model: NEBIUS_MODEL, max_tokens: 400, chat_template_kwargs: { enable_thinking: false } });
    expect(body.messages[0].content).toContain("/no_think");
    expect(body.messages[1].content).not.toContain("receipt");
  });
  it.each(["not JSON", '{"friday":"only one day"}', '<think>hmm</think>{"friday":"hi"}'])("falls back on unusable narration: %s", async (content) => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ choices: [{ message: { content } }] }));
    expect((await narrateDays(days, { apiKey: "test-only", fetch: fetcher })).source).toBe("template");
  });
  it("falls back on a timeout or provider error", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => { throw new Error("timeout"); });
    expect((await narrateDays(days, { apiKey: "test-only", fetch: fetcher })).source).toBe("template");
  });
});

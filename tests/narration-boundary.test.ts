import { describe, expect, it, vi } from "vitest";
import { narrateDays } from "@/lib/llm";

const intros = { friday: "Follow the glow.", saturday: "Take a detour.", sunday: "Turn a page." };
const content = JSON.stringify(intros);
const complete = { finish_reason: "stop", message: { role: "assistant", content } };

// Entirely synthetic protocol envelopes. No provider request or real credential.
async function narrate(choice: unknown, extra: Record<string, unknown> = {}) {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ ...extra, choices: [choice] }));
  return narrateDays([], { apiKey: "synthetic-test-only", fetch: fetcher });
}

const fallback = () => narrateDays([]);

describe("narration completion boundary", () => {
  it("accepts a completed text answer with an explicit empty refusal", async () => {
    expect(await narrate({ ...complete, message: { ...complete.message, refusal: null } }))
      .toEqual({ intros, source: "nebius" });
  });

  it.each(["length", "content_filter", "tool_calls", null, undefined])(
    "falls back on non-completion: %s", async (finish_reason) => {
      expect(await narrate({ ...complete, finish_reason })).toEqual(await fallback());
    },
  );

  it.each([
    { refusal: "Cannot comply." },
    { refusal: false },
    { tool_calls: [{ type: "function" }] },
    { tool_calls: {} },
    { function_call: { name: "other" } },
    { role: "tool" },
  ])("rejects incompatible message fields: %j", async (fields) => {
    expect(await narrate({ ...complete, message: { ...complete.message, ...fields } }))
      .toEqual(await fallback());
  });

  it("rejects an error envelope even when it also has usable content", async () => {
    expect(await narrate(complete, { error: { message: "synthetic failure" } }))
      .toEqual(await fallback());
  });

  it.each([{ choices: [] }, { choices: [complete, complete] }])("rejects ambiguous choice counts: %j", async ({ choices }) => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ choices }));
    expect(await narrateDays([], { apiKey: "synthetic-only", fetch: fetcher })).toEqual(await fallback());
  });

  it("rejects an answer with no assistant role", async () => {
    expect(await narrate({ ...complete, message: { content } })).toEqual(await fallback());
  });

  it("accepts empty refusal and tool-call fields", async () => {
    expect(await narrate({ ...complete, message: { ...complete.message, refusal: "", tool_calls: [] } }))
      .toEqual({ intros, source: "nebius" });
  });

  it.each([180, 181])("enforces the %i-character intro boundary", async (length) => {
    const candidate = { ...intros, friday: "x".repeat(length) };
    const result = await narrate({ ...complete, message: { ...complete.message, content: JSON.stringify(candidate) } });
    expect(result).toEqual(length === 180 ? { intros: candidate, source: "nebius" } : await fallback());
  });
});

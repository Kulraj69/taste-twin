import { record } from "./qloo";
import type { DayId, WeekendDay } from "./types";

export const NEBIUS_URL = "https://api.tokenfactory.nebius.com/v1/chat/completions";
export const NEBIUS_MODEL = "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B";

const templates: Record<DayId, string> = {
  friday: "Clock out. Follow your curiosity. Let the evening find its rhythm.",
  saturday: "A little flavour, a little volume, a very good detour.",
  sunday: "One more chapter. One more cup. Absolutely no rush.",
};

// The model only receives day labels and a mood. It cannot create or modify receipts.
export async function narrateDays(days: WeekendDay[], options: { apiKey?: string; fetch?: typeof fetch; signal?: AbortSignal } = {}) {
  const fallback = { intros: { ...templates }, source: "template" as const };
  if (!options.apiKey?.trim()) return fallback;
  try {
    options.signal?.throwIfAborted();
    const timeout = AbortSignal.timeout(8_000);
    const response = await (options.fetch ?? fetch)(NEBIUS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${options.apiKey.trim()}`, "Content-Type": "application/json" },
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
      cache: "no-store",
      body: JSON.stringify({
        model: NEBIUS_MODEL,
        max_tokens: 400,
        temperature: 0.7,
        chat_template_kwargs: { enable_thinking: false },
        messages: [
          { role: "system", content: '/no_think\nWrite three playful, short weekend mood intros. Return only JSON with keys "friday", "saturday", "sunday" and a single sentence (at most 180 characters) per value. No names, venues, dates, facts, ratings, recommendations or explanations of taste. No markdown.' },
          { role: "user", content: JSON.stringify(days.map((day) => ({ day: day.id, activities: day.picks.map((pick) => pick.kind) }))) },
        ],
      }),
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      return fallback;
    }
    const body = record(await response.json());
    options.signal?.throwIfAborted();
    const choices = Array.isArray(body.choices) ? body.choices : [];
    const choice = record(choices[0]);
    const message = record(choice.message);
    // Valid-looking JSON can still be a truncated, refused or tool-call answer.
    if (body.error != null || choices.length !== 1 || choice.finish_reason !== "stop"
      || message.role !== "assistant"
      || (message.refusal != null && message.refusal !== "")
      || (message.tool_calls != null && (!Array.isArray(message.tool_calls) || message.tool_calls.length > 0))
      || message.function_call != null) return fallback;
    const content = message.content;
    if (typeof content !== "string" || /<\/?think>/i.test(content)) return fallback;
    const parsed = record(JSON.parse(content));
    const intros = { ...templates };
    for (const id of ["friday", "saturday", "sunday"] as const) {
      const line = parsed[id];
      if (typeof line !== "string" || !line.trim() || line.length > 180 || /[\n\r<>]/.test(line)) return fallback;
      intros[id] = line.trim();
    }
    return { intros, source: "nebius" as const };
  } catch {
    return fallback;
  }
}

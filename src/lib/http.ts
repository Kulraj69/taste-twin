import { InputError, QlooError } from "./errors";
import { MAX_BODY_BYTES, validatePlanInput } from "./input";
import { createPlan } from "./plan";
import { QlooClient } from "./qloo";
import { clientIp, PlanLimiter, planLimiter } from "./rate-limit";
import type { PlanInput, WeekendPlan } from "./types";

async function readJson(request: Request): Promise<unknown> {
  const length = Number(request.headers.get("content-length"));
  if (length > MAX_BODY_BYTES) throw new InputError("That upload is too big. CSV files must be under 200 KB.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new InputError("Send your favourites and a city.");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let body = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new InputError("That upload is too big. CSV files must be under 200 KB.", 413);
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body);
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError("That request wasn’t valid JSON. Please try again.");
  } finally {
    reader.releaseLock();
  }
}

export async function handlePlanRequest(request: Request, options: {
  limiter?: PlanLimiter;
  now?: () => number;
  plan?: (input: PlanInput) => Promise<WeekendPlan>;
  env?: { QLOO_API_KEY?: string; NEBIUS_API_KEY?: string };
} = {}): Promise<Response> {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Please send your favourites as JSON." }, { status: 415, headers });
  }
  const env = options.env ?? process.env;
  const deadline = AbortSignal.timeout(52_000);
  const qloo = new QlooClient({ apiKey: env.QLOO_API_KEY, signal: deadline });
  try {
    const input = validatePlanInput(await readJson(request));
    const limit = (options.limiter ?? planLimiter).take(clientIp(request), (options.now ?? Date.now)());
    if (!limit.ok) {
      return Response.json({ error: limit.note, retryAfter: limit.retryAfter }, {
        status: 429, headers: { ...headers, "Retry-After": String(limit.retryAfter) },
      });
    }
    headers["X-RateLimit-Remaining"] = String(limit.remaining);
    const plan = options.plan
      ? await options.plan(input)
      : await createPlan(input, { qloo, nebiusApiKey: env.NEBIUS_API_KEY, signal: deadline });
    return Response.json(plan, { headers });
  } catch (error) {
    const status = error instanceof InputError || error instanceof QlooError ? error.status : 500;
    const message = error instanceof InputError || error instanceof QlooError ? error.message : "Your twin lost its train of thought. Please try again.";
    // Never expose provider bodies, credentials, stack traces or internal error messages.
    return Response.json({ error: message, trace: qloo.trace }, { status, headers });
  }
}

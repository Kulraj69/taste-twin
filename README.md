# Taste Twin

Live demo: https://taste-twin-mu.vercel.app (live mode: plans are generated from real Qloo hackathon API calls; the landing-page sample is still a labelled synthetic preview)


**Your taste. Your next weekend.** A weekend-planning prototype built for the Qloo Agentic Hackathon. The current demo uses invented data to show how films, artists, books and dishes can become a weekend itinerary. Live Qloo recommendations and optional LLM narration have not been verified.

- Friday: a bar to start the evening.
- Saturday: a restaurant/cuisine discovery and an artist for your gig mood.
- Sunday: a book and a cafe to read it in.

Every ticket opens a **“Why you’ll like it” receipt**: resolved favourites → the adapter query → the returned pick, affinity and shared tag IDs. In mock mode these are invented fixtures, not Qloo evidence. A Taste Twin persona shows the top returned taste tags, and an expandable agent trace exposes every lookup, result count, duration, error and cache hit.

Artist picks are music discoveries, not confirmed concerts. The suggested days are editorial slots, not reservations or opening-hour checks. Check current hours, menus and local event listings before going.

## Run locally

Requires Node.js **20.19+, 22.13+, or 24+** on a supported even-numbered release line and npm. The app uses Next.js **16.4.3**, React **19.3.0**, TypeScript **5.9.3**, Tailwind **v4**, and Vitest **4.1.12**. No sibling repository is needed.

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>. No API keys or environment files are needed for the synthetic demo. Run with both provider variables unset; Next.js automatically loads local environment files if present.

### Judge walkthrough (mock mode)

1. Open the app → see “Demo mode: synthetic data” and five preview tickets. The initial preview makes no provider calls.
2. Click **Midnight romantic**, **Analog wanderer** or **Curious daydreamer** → see a new synthetic weekend and a different persona for each preset.
3. Open **Why you’ll like it** → inspect the synthetic seed IDs, exact query, unrounded affinity and shared tag IDs. Close with Escape or the close button.
4. Expand **Agent trace**, then a step → see adapter parameters. The trace is returned with the completed plan; it is not streamed.
5. Filter **Saturday** → see the restaurant and artist picks. The artist is a discovery, not a booked gig.
6. Clear the favourites and upload a Letterboxd CSV → generate a CSV-only plan. Alternatively enter `dish: noodles` → generate a cuisine-only plan.

The local browser regression script exercises this flow, the mobile layout and the sixth-request rate limit. See `demo/mock-flow-results.json`. No recommendation quality or real-world impact is established by these checks.

For a local production run:

```bash
npm run build
npm start
```

There are no external image or font downloads, databases, authentication services or build-time API calls. All illustrations are CSS/SVG, and dependencies are installed locally using npm.

The interface is a moonlit retro terminal: original SVG mountains and stone ruins, a beige **TASTE TWIN 5150** enclosure, a green-blue CRT, and thermal-paper recommendations and receipts. Terminal text uses a local monospace font stack. Scanlines and film grain are static, decorative layers; the short, stepped text reveal and smooth scrolling respect `prefers-reduced-motion`. Native form labels, keyboard focus, the receipt dialog, and live status announcements remain available. The reference PNGs are design references only and are not served by the app.

## Mock and live modes

| Environment variable | Purpose |
| --- | --- |
| `QLOO_API_KEY` | A nonempty value enables live Qloo recommendations. With no key, every Qloo call uses the synthetic adapter. Obtain a hackathon key through the [Qloo hackathon guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide). |
| `NEBIUS_API_KEY` | Optional one-line day narration from Nebius Token Factory. Missing keys, timeouts, errors or invalid output fall back to deterministic templates. |

Set keys only in `.env.local` or the deployment environment; restart the server after changing them. Neither key is sent to the browser or included in the agent trace. No environment values or provider error bodies are logged.

**Mock mode is entirely invented.** `src/mock/qloo.ts` contains authored fake names, IDs, tags, scores and properties in the same response envelopes used by Qloo. All fixture entity and tag IDs start with `mock-`; no real Qloo responses were copied, anonymized or committed. The UI labels these plans **“Demo mode: synthetic data.”** Arbitrary user inputs map to invented stand-ins, so demo results are illustrative. Three example tastes produce distinct personas; place fixtures depend on the city. This is not a real recommendation engine. The example input suggestions switch to real titles in live mode; these titles are not mock provider responses.

The initial page always shows a clearly labelled synthetic sample, even in live mode. Rendering, prefetching and builds never spend Qloo or Nebius calls. Submitting the form or clicking an example requests a new plan. A live Qloo failure never silently switches the result to mock data: partial plans leave failed stops open, and total failures return a helpful error.

## How the agent uses Qloo

All Qloo calls are **GET** requests to `https://hackathon.api.qloo.com` with `X-Api-Key` authentication. The only endpoint paths are:

| Endpoint | Parameters and purpose |
| --- | --- |
| `/search` | `query`, `types`, `take`: resolve movie, artist and book titles to entity IDs. Typed prefixes narrow the search. CSV release years help choose between returned matches. |
| `/v2/tags` | `filter.query`, `take`: resolve dishes/cuisines and discover valid bar, restaurant and cafe category IDs. Taxonomy IDs are never guessed. |
| `/v2/insights` | `filter.type=urn:entity:place`, `signal.interests.entities`, optional `signal.interests.tags`, `filter.location.query`, `filter.tags`: discover places in the selected city and category. |
| `/v2/insights` | `filter.type=urn:entity:artist` or `urn:entity:book`, with the resolved interest signals: discover music and books. Place/location filters are not sent for these types. |
| `/v2/insights` | **`filter.type=urn:tag`**, with the interest signals: taste analysis for the persona and shared-tag evidence. The tag type is `urn:tag`, not `urn:entity:tag`. |

The app never uses `/recs` or `/recommendations`.

1. Resolve up to 20 distinct interests, with bounded concurrent lookups. Dishes resolve to cuisine tags; they are not fabricated food entities. Dish-only plans use `signal.interests.tags`.
2. Analyze the combined taste signal and discover valid place-category tags.
3. Request five discoveries. Multiple place filters use `operator.filter.tags=intersection` so the lunch must match both restaurant category and cuisine (Qloo defaults to union). If this returns no matches, relax that cuisine filter once while retaining the city, restaurant category and interest signal. Both attempts appear in the trace. Missing category tags leave the corresponding place stop open.
4. Choose returned entities, excluding existing seeds and already chosen picks. Do not invent replacements for absent results.
5. Build receipts deterministically, then optionally ask the LLM for three short mood intros.

### Evidence rules

- The receipt contains the exact insight parameters, referenced trace step, selected entity ID and source seed/search step IDs.
- `query.affinity` is preserved as a number and displayed without rounding or conversion to a percentage. It is a score for the **complete query signal**, not a probability or an individual favourite’s contribution. Absent or invalid scores remain `null` and display “Not returned.”
- A shared tag must have the **same ID** on the picked entity and either a signalled seed or the taste-analysis response. Matching names alone are insufficient. Picked tag names, IDs and types are preserved; the receipt identifies which seeds and/or analysis support each tag.
- No returned overlap means no tag explanation. Missing taste analysis does not prevent showing direct seed-to-pick tag overlap.
- Search results can be ambiguous. In live mode, a changed resolved title is disclosed in the plan notes, and every receipt shows both the original input and resolved title.

### Storage and timeouts

Live responses are cached in a private server-side `Map` for **10 minutes**, up to **500 entries**, separated by a hash of the credential and canonical query. The cache clones entries to avoid mutation and never caches failures. Qloo fetches use `cache: "no-store"`; live responses are never written to disk, Next’s persistent fetch cache or this repository. API responses also use `Cache-Control: no-store`.

Qloo calls time out after 12 seconds, narration after 8 seconds, with a 52-second request deadline inside a 60-second Vercel function budget. A partial result can still succeed when individual calls fail.

## Narration

`src/lib/llm.ts` calls the OpenAI-compatible endpoint:

```text
https://api.tokenfactory.nebius.com/v1/chat/completions
model: nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B
max_tokens: 400
system prompt: /no_think
chat_template_kwargs: { enable_thinking: false }
```

One request writes a short intro for each day. The model receives only day labels and activity kinds, not the CSV, favourites, scores or receipts. Its output never selects entities or modifies evidence. Templates are the fallback on every narration failure.

## API and input limits

```http
POST /api/plan
Content-Type: application/json

{
  "favourites": ["movie: Amélie", "artist: Khruangbin", "dish: ramen"],
  "city": "Lisbon",
  "letterboxdCsv": "Date,Name,Year,Letterboxd URI\n2026-01-01,Amélie,2001,https://letterboxd.com/film/amelie/"
}
```

`favourites` is required and can be empty with a CSV. `letterboxdCsv` is optional. The success JSON includes `mode`, `city`, `seeds`, `cuisineTags`, `persona`, `days`, `trace`, `warnings` and `narration`. Each trace step has `id`, `label`, `endpoint`, `params`, `count`, `ms`, `source` (`live`, `cache`, `synthetic`) and `status`.

- At most **20 typed favourites**, 200 characters per favourite and 80 characters per city.
- CSV: **200 KiB / 204,800 UTF-8 bytes**, with `Date,Name,Year,Letterboxd URI` columns and optional `Rating`. Quoted commas, doubled quotes, BOM, CRLF and multiline quoted titles are supported. URLs in a CSV are never fetched.
- At most **20 combined unique interests** are resolved. Typed entries go first, followed by the highest-rated CSV films (export order for rating ties or unrated lists). Truncation is disclosed.
- A bounded streaming JSON reader stops oversized bodies even without `Content-Length`; its separate transport limit allows JSON escaping overhead.
- **5 plans per IP per rolling hour** and **200 per UTC day** across the process, including mock plans and valid requests whose generation later fails. A rejected request returns friendly **429 JSON**, `retryAfter` seconds and a `Retry-After` header without running the agent.
- Invalid input returns 400/413/415/422 as appropriate; upstream failures return 502/503. Raw upstream errors and credentials are never returned.

The in-memory limiter follows `sarkari-speedrun`’s rolling-window/UTC-day pattern. **Memory is per instance**: restarts reset it and separate Vercel instances do not share quotas. These are soft deployment-wide caps; replace the store with Redis/KV for a strict multi-instance global limit. On Vercel, the client IP uses the platform-overwritten `x-vercel-forwarded-for` header. Other deployments must configure their proxy to overwrite forwarded IP headers.

## Checks

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

The Vitest suite covers CSV parsing, input bounds, Qloo parameters and response shapes, exact receipts, HTTP transport/cache behavior, rate limits, narration fallbacks, the full mock pipeline and API, and controlled upstream failure/relaxation paths. All transport fixtures are synthetic, and tests require no credentials or network access. Actual provider availability and account permissions require a live-key smoke test.

The October 28 fresh-install check found dependency advisories in the previous Vitest 3 test toolchain. Vitest is now pinned to 4.1.12; post-upgrade verification evidence is in `demo/handoff-fixed/checks.json`. `demo/handoff/checks.json` preserves the earlier, affected dependency run. Dependency audit results describe that check only, not application security or live-provider safety.

## Vercel

The app is ready for a standard Vercel Next.js project. `vercel.json` specifies `npm install --include=dev` so TypeScript and build tooling remain available during the build. Configure the two optional environment variables in project settings to enable live mode/narration. No deployment or push is performed by this project’s setup.

## License

MIT · Copyright © 2026 Kulraj Singh. See [LICENSE](LICENSE).

## Switching to live Qloo
Live validation is still blocked on access to Qloo. Kulraj must configure access through an approved secure channel; never paste keys into a draft, report or chat. A configured key selects the live adapter, but does not prove that it works. Verify seed resolution, category tags, recommendations and receipts with the real service before claiming live integration. Keep the disclosure until then.

Do not run `scripts/go-live.sh` as a local check: it changes the remote deployment. Pushing, deploying and submitting require separate explicit approval.

## Isolated local verification and recording

For this workspace, where existing environment files must not be read:

```bash
python scripts/local-check.py --serve
# In another terminal, after the production server is ready:
python scripts/mock-flow.py
```

The first script stages named source/config files in the directory selected by `TMPDIR`, reuses installed dependencies with hardlinks, and starts subprocesses with an allowlisted environment. It runs `npm test`, `npm run lint`, `npm run build`, then `npm run typecheck`; no dotenv copying occurs. Add `--fresh` to install with `npm ci` instead of reusing dependencies. It serves only `127.0.0.1:3101`. Restart it before repeating the browser test because quotas are in memory. Both scripts accept `--output demo/handoff` to preserve earlier evidence. The second script needs Python Playwright plus installed Chromium and records the real local app. Files in `demo/` are local evidence, not a public upload.

## Submission status

Verified October 29, 2026: the hackathon key works against `https://hackathon.api.qloo.com`; `/search`, `/v2/tags` and `/v2/insights` returned live data for a Lisbon plan (12 calls, 0 errors) both locally and on the Vercel deployment. Demo recordings contain Qloo data and are kept out of the repository, per Qloo's terms.

Official-page search results checked October 28, 2026 consistently show **October 30, 2026, 11:45 PM EDT = October 31, 2026, 9:15 AM IST**. Direct Devpost access is blocked by Cloudflare here, so verify the signed-in form before acting. The indexed overview says demo videos are **not required**; a local mock recording is nevertheless included. See the source/evidence notes in `submission-draft.md`.

# Taste Twin — Devpost draft (do not submit without Kulraj's yes)

**Tagline:** A weekend planner with a receipt for every pick.

**Status:** Local draft only. The October 29 operator handoff reports live Qloo and Nebius success; existing live footage is preserved. This reconciliation checks public landing availability, historical source and local media, not a new provider run. The initial preview and key-free local app remain synthetic. Current local narration guards and document fixes are not pushed or deployed. Mock tests establish neither recommendation quality nor eligibility.

**Demo:** https://taste-twin-mu.vercel.app
**Repo:** https://github.com/Kulraj69/taste-twin (MIT)

## Inspiration
A list of popular places is not the same as a weekend you would choose. Taste Twin explores whether favourites from films, music and books can help shape a trip. The prototype is built around a Qloo adapter, with receipts that make its inputs and outputs inspectable.

## What it does
Type favourites or upload a Letterboxd CSV, then choose a city. Taste Twin looks for a bar, a restaurant, an artist discovery, a book and a café. Missing results stay open. Artist picks are not confirmed gigs. Each ticket opens a receipt with resolved inputs, query parameters, affinity and shared tag IDs when returned. The hosted app is configured for live Qloo; the initial preview and key-free local demo are labelled synthetic. The trace appears when planning finishes; it is not streamed.

## How we built it
- Agent loop: resolve seeds with `/search`, find cuisine and place-category tags with `/v2/tags`, pull cross-domain picks from `/v2/insights` (places with `filter.location.query`, artists, books), and run taste analysis on the seeds for the shared-tag receipts.
- Receipts are built deterministically from adapter responses. Optional NVIDIA Nemotron narration through Nebius Token Factory writes day intros, never picks or evidence. Generated prose is unverified mood text, not booking or venue information; the local UI labels it separately. The key-free local demo uses templates. The earlier operator reports live narration; the stored live-result summary does not independently prove its provider or completion status.
- Next.js on Vercel, rate limits per IP and per day, server-only cache, synthetic mock mode for when no key is set.
- Dreamcore 80s terminal UI: beige hardware, CRT glow, scanlines, printed receipts.

## Challenges
The receipt had to show evidence, not just a convincing explanation. We kept the returned affinity score unchanged and matched shared tags by ID, not by name. The score belongs to the whole query, so we don't present it as proof that one favourite caused a recommendation. The language model only writes day intros; it cannot change the picks or receipts.

Missing results needed an honest path too. If the restaurant search is too narrow, the agent tries once without the cuisine filter but keeps the city and restaurant category. If a stop still has no result, it stays open rather than getting an invented replacement. The initial preview is synthetic even when live access is configured. Local tests cover query shapes, receipts and failure paths; they do not establish recommendation quality.

During this local pass, regression tests showed that the JSON gate accepted `application/jsonp` and `application/json-invalid` as JSON. It now compares the exact media type and still accepts a charset parameter. The new negative cases failed before the fix and passed afterward. Browser checks also exercised CSV-only and cuisine-only plans, receipt open/close, the mobile layout and the rate-limit message. These observations are local evidence, not a live integration claim.

## What's next
Compare live suggestions against a popular-places baseline and ask consenting users which picks they would keep. Check ambiguous resolutions and unsuitable place categories. No comparative study or impact result is claimed. Sharing and group-taste features can wait.

## Verification notes (not submission prose)
- Current test/build/recording results are stored under `demo/reconciliation-*`; earlier `demo/handoff-fixed/` is historical, not the current source revision.
- Existing `demo/live/taste-twin-live.mp4` fully decodes: 33.68 seconds, 1280×900, silent. The historical recorder checks live source labels and five picks but not every trace status or narration provider. Its opening caption precedes generation on a synthetic preview; review before use. No new live plan was requested here.
- Public landing HTTP 200/live badge/synthetic label and public README at 767e5f0 were independently checked October 29. This does not certify the deployed source revision or current provider compatibility. No raw provider data or credentials belong in source commits.

## Deadline and entry requirements
Read-only recheck on October 28, 2026: search results for the official [overview](https://qloo.devpost.com/), [schedule](https://qloo.devpost.com/details/dates) and [rules](https://qloo.devpost.com/rules) agree on October 30, 2026 at 11:45 PM EDT. Python zoneinfo converts this to **October 31, 2026 at 9:15 AM IST**, not October 30 IST. Direct requests failed extraction and the browser hit Cloudflare, so this is search-index corroboration, not direct authenticated verification.

The indexed overview requires a working externally hosted demo, public source repository, description and visible open-source license. It explicitly says a demo video is not required. The challenge asks for Qloo API use; a synthetic-only entry must not be assumed eligible. Recheck these points on the actual submission form. No submission form or API was accessed.

## Operator follow-through
Entry completion was already approved in the October 28 21:14 queue directive. Grok Bot handles the authenticated form after checking ownership, current rules, entrant declarations and exact public source/app parity. Do not create a duplicate entry or re-request that same approval. No credentials are needed for local tests.

Separate exact action if releasing this local fix: “Approve pushing the reviewed Taste Twin reconciliation changes to Kulraj69/taste-twin and deploying that exact revision.” A live narration-compatibility test needs its own provider-call scope/budget. Optional media upload needs reviewed terms, file, destination and visibility. Existing local paths are not video URLs.

Canonical proposed form fields and evidence boundaries: `/workspace/devpost/hermes-reports/submit-ready/taste-twin.md` (workspace operator document, not a public repository dependency).

The exact authenticated form schema, participant confirmations and any optional public video URL remain unknown. Nothing was submitted, pushed, deployed or uploaded.

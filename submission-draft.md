# Taste Twin — Devpost draft (do not submit without Kulraj's yes)

**Tagline:** A weekend planner with a receipt for every pick. Try the clearly labelled synthetic demo.

**Status:** Local draft only. No live Qloo or Nebius calls have been verified. Mock results do not demonstrate Qloo recommendation quality or establish hackathon eligibility.

**Demo:** https://taste-twin-mu.vercel.app
**Repo:** https://github.com/Kulraj69/taste-twin (MIT)

## Inspiration
A list of popular places is not the same as a weekend you would choose. Taste Twin explores whether favourites from films, music and books can help shape a trip. The prototype is built around a Qloo adapter, with receipts that make its inputs and outputs inspectable.

## What it does
Type favourites or upload a Letterboxd CSV, then choose a city. The demo returns a Friday-to-Sunday itinerary: a bar, a restaurant, an artist discovery, a book and a café. Artist picks are not confirmed gigs. Each ticket opens a receipt with resolved inputs, query parameters, affinity and shared tag IDs. In the current demo, all of that evidence is synthetic. The trace shows calls to the local adapter and appears when planning finishes; it is not streamed.

## How we built it
- Agent loop: resolve seeds with `/search`, find cuisine and place-category tags with `/v2/tags`, pull cross-domain picks from `/v2/insights` (places with `filter.location.query`, artists, books), and run taste analysis on the seeds for the shared-tag receipts.
- Receipts are built deterministically from adapter responses. Optional NVIDIA Nemotron narration through Nebius Token Factory is implemented but unverified live. The local demo uses deterministic day intros, not an LLM.
- Next.js on Vercel, rate limits per IP and per day, server-only cache, synthetic mock mode for when no key is set.
- Dreamcore 80s terminal UI: beige hardware, CRT glow, scanlines, printed receipts.

## Challenges
The receipt had to show evidence, not just a convincing explanation. We kept the returned affinity score unchanged and matched shared tags by ID, not by name. The score belongs to the whole query, so we don't present it as proof that one favourite caused a recommendation. The language model only writes day intros; it cannot change the picks or receipts.

Missing results needed an honest path too. If the restaurant search is too narrow, the agent tries once without the cuisine filter but keeps the city and restaurant category. If a stop still has no result, it stays open rather than getting an invented replacement. We don't have a Qloo key yet, so the demo uses clearly labelled synthetic data. Local tests cover the query shapes, receipts and failure paths, but live Qloo behaviour still needs checking with a key.

During this local pass, regression tests showed that the JSON gate accepted `application/jsonp` and `application/json-invalid` as JSON. It now compares the exact media type and still accepts a charset parameter. The new negative cases failed before the fix and passed afterward. Browser checks also exercised CSV-only and cuisine-only plans, receipt open/close, the mobile layout and the rate-limit message. These observations are local evidence, not a live integration claim.

## What's next
First, validate the Qloo adapter against the real service and check whether the picks are useful. Live access is a prerequisite to claiming a Qloo-powered result. Sharing or group-taste features can wait.

## Verification notes (not submission prose)
- `npm test`: 67 tests passed across six files. `npm run lint`, `npm run build` and `npm run typecheck`: exit 0 in the isolated local copy.
- `python scripts/mock-flow.py`: ten browser checks passed; five synthetic plans, desktop and 390px mobile, no browser page errors. Local recording: `demo/taste-twin-mock.mp4`.
- The existing Challenges paragraphs were already edited before this run. They were preserved and extended only with observed evidence. No claim of historical live testing is made.

## Deadline and entry requirements
Read-only recheck on October 28, 2026: search results for the official [overview](https://qloo.devpost.com/), [schedule](https://qloo.devpost.com/details/dates) and [rules](https://qloo.devpost.com/rules) agree on October 30, 2026 at 11:45 PM EDT. Python zoneinfo converts this to **October 31, 2026 at 9:15 AM IST**, not October 30 IST. Direct requests failed extraction and the browser hit Cloudflare, so this is search-index corroboration, not direct authenticated verification.

The indexed overview requires a working externally hosted demo, public source repository, description and visible open-source license. It explicitly says a demo video is not required. The challenge asks for Qloo API use; a synthetic-only entry must not be assumed eligible. Recheck these points on the actual submission form. No submission form or API was accessed.

## Needs Kulraj
- “Configure Qloo access through an approved secure channel and authorize a separately scoped live smoke test; do not send the key in chat.”
- “Review the local Taste Twin changes, then approve pushing them to Kulraj69/taste-twin and deploying the updated demo.”
- “Confirm entrant details, eligibility, the live deadline and the final local payload before separately approving submission to Qloo Agentic Hackathon.”
- Optional, not an indexed entry requirement: “Approve uploading demo/taste-twin-mock.mp4 as a clearly labelled synthetic Taste Twin demo.”

The exact authenticated form schema, participant confirmations and any optional public video URL remain unknown. Nothing was submitted, pushed, deployed or uploaded.

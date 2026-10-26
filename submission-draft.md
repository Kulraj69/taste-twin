# Taste Twin — Devpost draft (do not submit without Kulraj's yes)

**Tagline:** Tell an old terminal what you love. It prints a weekend in a city you've never been to, with a receipt for every pick.

**Demo:** https://taste-twin-mu.vercel.app
**Repo:** https://github.com/Kulraj69/taste-twin (MIT)

## Inspiration
City guides tell you what's popular. They don't know that you rewatch slow films at 2 AM. Taste is portable across categories: the person who loves a certain record probably likes a certain kind of bar. Qloo models exactly that, so we built an agent around it.

## What it does
You type favourites (films, artists, books, dishes) or upload your Letterboxd export, then pick a city. Taste Twin plans Friday to Sunday: a bar, a place to eat, a gig, a book and a café. Each pick prints as a receipt showing the chain from your favourite, through the Qloo signal, to the pick, with the affinity score and shared tags exactly as Qloo returned them. An agent trace panel lists every Qloo call it made.

## How we built it
- Agent loop: resolve seeds with `/search`, find cuisine/genre tags with `/v2/tags`, pull cross-domain picks from `/v2/insights` (places with `filter.location.query`, artists, books), and run taste analysis on the seeds for the shared-tag receipts.
- Receipts are built deterministically from Qloo data. Nvidia Nemotron (Nebius Token Factory) only writes a one-line intro per day, with a template fallback.
- Next.js on Vercel, rate limits per IP and per day, server-only cache, synthetic mock mode for when no key is set.
- Dreamcore 80s terminal UI: beige hardware, CRT glow, scanlines, printed receipts.

## Challenges
[fill in after live testing]

## What's next
Spotify import, shareable receipt cards, group weekends that blend two tastes.

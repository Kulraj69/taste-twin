# Taste Twin — local synthetic demo

Recorded file: `demo/taste-twin-mock.mp4` (33.72 seconds, silent H.264, 1280×900).
Source: the real local production app, driven by `scripts/mock-flow.py`. The video is not a live Qloo demonstration. No upload was made.

## What the recording shows

1. The synthetic-mode badge and five-ticket preview. Caption: “Invented data. No live Qloo or LLM calls.”
2. A synthetic Letterboxd CSV, with Tokyo selected, followed by a real local form submission.
3. Five returned synthetic picks. Artist discovery is not a confirmed concert.
4. A receipt: resolved input, exact adapter parameters, unrounded invented score and shared tag IDs.
5. The expandable trace, labelled as synthetic. It arrives with the completed response, not one call at a time.
6. Presets changing the itinerary and persona. The caption explicitly says these are not validated recommendations.

The browser check also tests a 390px mobile viewport, cuisine-only generation and rate-limit handling. These checks are saved in `demo/mock-flow-results.json`; the desktop recording does not claim to show the mobile flow. Mobile evidence is `demo/weekend-mobile.png`.

## Optional narration for the synthetic recording (October 29 revision)

“This is Taste Twin, a weekend planner with a receipt for every pick. This recording uses invented data, not live Qloo recommendations. I upload a synthetic film diary and choose Tokyo. The app gives me places, an artist and a book. The artist is a discovery, not a booked gig. The receipt shows the resolved input, query, score and shared tags. The trace makes those steps inspectable. This shows the local workflow, not recommendation quality or current live-provider compatibility.”

## Reproduce locally

From `/workspace/devpost/qloo`, start `python scripts/local-check.py --serve` and wait for Ready. In another terminal run `python scripts/mock-flow.py`. Restart the server before repeating the flow so its in-memory quota is reset. The recording includes captions added by the test harness; those captions do not replace or simulate app results.

Convert the generated WebM with:

```bash
ffmpeg -hide_banner -loglevel error -i demo/taste-twin-mock.webm -c:v libx264 -crf 22 -pix_fmt yuv420p -movflags +faststart -an demo/taste-twin-mock.mp4
```

Do not upload without separate approval. Search-index evidence from the official overview says videos are not required for this event; verify the current form. Never relabel this recording as live after enabling a key—record a new, verified live flow instead.

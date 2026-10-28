#!/usr/bin/env python3
"""Record a short demo of the deployed app using real Qloo data (no keys needed client-side)."""
import json, sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

URL = sys.argv[1] if len(sys.argv) > 1 else 'https://taste-twin-mu.vercel.app'
OUT = Path(__file__).resolve().parents[1] / 'demo' / 'live'
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={'width': 1280, 'height': 900}, record_video_dir=str(OUT / 'raw'),
                        record_video_size={'width': 1280, 'height': 900}, reduced_motion='reduce')
    page = ctx.new_page()
    page.goto(URL, wait_until='networkidle')

    def caption(t, ms=3500):
        page.evaluate('''t => {let e=document.getElementById('rc');if(!e){e=document.createElement('div');e.id='rc';document.body.append(e);}
          e.textContent=t;e.style.cssText='position:fixed;bottom:0;left:0;right:0;padding:14px 24px;background:#111827;color:#fff;font:16px monospace;z-index:9999;text-align:center;pointer-events:none';}''', t)
        page.wait_for_timeout(ms)

    expect(page.get_by_text('Live discoveries by Qloo', exact=True).first).to_be_visible()
    caption('Taste Twin: LIVE mode. Real Qloo Insights API calls.')
    page.locator('#favourites').scroll_into_view_if_needed()
    page.locator('#favourites').fill('Inception\nRadiohead\nDune')
    page.locator('#city').fill('Lisbon')
    caption('Favourites: Inception, Radiohead, Dune. City: Lisbon.')
    with page.expect_response(lambda r: r.url.endswith('/api/plan') and r.request.method == 'POST', timeout=90000) as pend:
        page.get_by_role('button', name='Find my weekend').click()
    r = pend.value
    assert r.status == 200, r.status
    plan = r.json()
    assert plan['mode'] == 'live' and all(s['source'] == 'live' for s in plan['trace'])
    expect(page.locator('.pick-ticket')).to_have_count(5, timeout=30000)
    page.locator('#weekend-title').scroll_into_view_if_needed()
    caption('Five picks from live Qloo results. Artist picks are not confirmed gigs.', 5000)
    page.locator('.receipt-button').first.click()
    expect(page.get_by_role('dialog')).to_be_visible()
    caption('Receipt: seed -> /v2/insights query -> affinity and shared tags, as returned by Qloo.', 6000)
    page.keyboard.press('Escape')
    page.locator('#agent-trace > summary').click()
    page.locator('#agent-trace').scroll_into_view_if_needed()
    caption(f"Agent trace: {len(plan['trace'])} live Qloo calls (/search, /v2/tags, /v2/insights).", 6000)
    page.screenshot(path=str(OUT / 'live-trace.png'))
    video = page.video
    ctx.close()
    video.save_as(str(OUT / 'taste-twin-live.webm'))
    b.close()
json.dump({'url': URL, 'steps': len(plan['trace']), 'picks': [x['entity']['name'] for d in plan['days'] for x in d['picks']]},
          open(OUT / 'live-demo-result.json', 'w'), indent=1)
print('ok', len(plan['trace']))

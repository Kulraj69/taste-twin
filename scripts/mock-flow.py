#!/usr/bin/env python3
"""Exercise the real local production app and record its synthetic demo.
Requires the loopback server from local-check.py --serve, Python Playwright,
and its Chromium/ffmpeg installations. Never visits external URLs.
"""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'demo'
URL = 'http://127.0.0.1:3101'
CSV = 'Date,Name,Year,Letterboxd URI,Rating\n2026-01-01,The Last Tram to Marigold,2021,https://example.invalid/film,5\n'


def main():
    global OUT, URL
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=OUT)
    parser.add_argument('--port', type=int, default=3101)
    args = parser.parse_args()
    OUT = args.output
    URL = f'http://127.0.0.1:{args.port}'
    OUT.mkdir(exist_ok=True)
    errors, external, checks, plans = [], [], [], []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 900},
                                      record_video_dir=str(OUT / 'raw'),
                                      record_video_size={'width': 1280, 'height': 900},
                                      reduced_motion='reduce')
        def guard(route):
            if urlparse(route.request.url).hostname not in ('127.0.0.1', 'localhost'):
                external.append(route.request.url)
                route.abort()
            else:
                route.continue_()
        context.route('**/*', guard)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        response = page.goto(URL, wait_until='networkidle')
        assert response.status == 200
        expect(page.locator('.pick-ticket')).to_have_count(5)
        expect(page.get_by_text('Demo mode: synthetic data', exact=True).first).to_be_visible()
        checks.append('Initial synthetic preview: five tickets, labelled demo mode')

        def caption(text):
            # Recording annotation only; it does not replace app content or results.
            page.evaluate('''text => {
              let el = document.getElementById('recording-caption');
              if (!el) { el=document.createElement('div'); el.id='recording-caption'; document.body.append(el); }
              el.textContent='LOCAL MOCK DEMO — '+text;
              el.style.cssText='position:fixed;bottom:0;left:0;right:0;padding:14px 24px;background:#111827;color:white;font:16px monospace;z-index:9999;text-align:center;pointer-events:none';
            }''', text)
            page.wait_for_timeout(4000)

        caption('Invented data. No live Qloo or LLM calls.')
        page.locator('#favourites').scroll_into_view_if_needed()
        page.locator('#favourites').fill('')
        page.get_by_role('button', name='Find my weekend').click()
        expect(page.locator('.form-error[role="alert"]')).to_contain_text('Give your twin a favourite')
        checks.append('Empty favourites: client validation, no generation')
        page.locator('#letterboxd').set_input_files({'name': 'synthetic-letterboxd.csv', 'mimeType': 'text/csv', 'buffer': CSV.encode()})
        expect(page.locator('.upload-complete')).to_contain_text('1 films ready')
        page.locator('#city').fill('Tokyo')
        caption('Upload a synthetic Letterboxd CSV. Choose Tokyo.')

        def generate(action):
            with page.expect_response(lambda r: r.url == URL + '/api/plan' and r.request.method == 'POST') as pending:
                action()
            result = pending.value
            assert result.status == 200, result.status
            plan = result.json()
            assert plan['mode'] == 'mock'
            assert plan['narration'] == 'template'
            picks = [pick for day in plan['days'] for pick in day['picks']]
            assert len(picks) == 5
            assert all(pick['entity']['entityId'].startswith('mock-') for pick in picks)
            assert all(step['source'] == 'synthetic' for step in plan['trace'])
            for pick in picks:
                receipt = pick['receipt']
                assert receipt['affinity'] == pick['entity']['affinity']
                assert receipt['signal']['params'] == next(s['params'] for s in plan['trace'] if s['id'] == receipt['signal']['traceId'])
            expect(page.locator('#weekend-title')).to_contain_text(plan['city'])
            expect(page.locator('.pick-ticket')).to_have_count(5)
            plans.append({'city': plan['city'], 'persona': plan['persona']['title'],
                          'picks': [pick['entity']['name'] for pick in picks], 'trace_steps': len(plan['trace'])})
            return plan

        generate(lambda: page.get_by_role('button', name='Find my weekend').click())
        checks.append('CSV-only Tokyo plan: synthetic receipts, exact scores and query trace')
        page.locator('#weekend-title').scroll_into_view_if_needed()
        caption('Five synthetic discoveries. Artist picks are not confirmed gigs.')
        page.locator('.receipt-button').first.click()
        expect(page.get_by_role('dialog')).to_be_visible()
        expect(page.get_by_role('dialog')).to_contain_text('Demo mode: synthetic data')
        expect(page.get_by_role('dialog')).to_contain_text('GET /v2/insights')
        page.wait_for_timeout(5000)
        page.locator('.affinity-proof').scroll_into_view_if_needed()
        badge = page.get_by_role('dialog').locator('.mode-badge')
        expect(badge).to_be_in_viewport()
        page.wait_for_timeout(5000)
        page.screenshot(path=str(OUT / 'receipt-desktop.png'))
        page.keyboard.press('Escape')
        expect(page.get_by_role('dialog')).not_to_be_visible()
        checks.append('Receipt opens with synthetic label and closes with Escape')
        page.locator('#agent-trace > summary').click()
        page.locator('#agent-trace').scroll_into_view_if_needed()
        expect(page.locator('#agent-trace')).to_contain_text('No Qloo network requests were made')
        page.locator('#agent-trace .trace-list details').first.locator('summary').click()
        caption('Trace arrives after the plan, not as a live stream. All calls use the adapter.')
        page.screenshot(path=str(OUT / 'trace-desktop.png'))
        checks.append('Expandable trace identifies the synthetic adapter')
        page.get_by_role('button', name='Saturday', exact=True).click()
        expect(page.locator('.pick-ticket')).to_have_count(2)
        page.get_by_role('button', name='The whole weekend', exact=True).click()
        checks.append('Day filter shows two Saturday picks and restores the weekend')

        personas = []
        for index in range(3):
            plan = generate(lambda i=index: page.locator('.example-button').nth(i).click())
            personas.append(plan['persona']['title'])
            assert page.locator('.upload-complete').count() == 0
        assert len(set(personas)) == 3
        checks.append('All three presets produce distinct personas and clear CSV input')
        page.locator('#weekend-title').scroll_into_view_if_needed()
        caption('Three presets produce different invented weekends, not validated recommendations.')
        page.screenshot(path=str(OUT / 'weekend-desktop.png'))
        video = page.video
        context.close()
        video.save_as(str(OUT / 'taste-twin-mock.webm'))

        mobile = browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
        mobile.route('**/*', guard)
        page = mobile.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(URL, wait_until='networkidle')
        page.locator('#favourites').fill('dish: noodles')
        page.locator('#city').fill('Berlin')
        plan = generate(lambda: page.get_by_role('button', name='Find my weekend').click())
        assert len(plan['seeds']) == 0 and len(plan['cuisineTags']) == 1
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        page.screenshot(path=str(OUT / 'weekend-mobile.png'))
        page.locator('.receipt-button').first.click()
        expect(page.get_by_role('dialog')).to_be_visible()
        expect(page.get_by_role('dialog')).to_contain_text('Cuisine interest')
        page.get_by_role('button', name='Close receipt', exact=True).click()
        expect(page.get_by_role('dialog')).not_to_be_visible()
        checks.append('390px mobile cuisine-only plan: no horizontal overflow; receipt open/close')
        with page.expect_response(lambda r: r.url == URL + '/api/plan') as limited:
            page.get_by_role('button', name='Find my weekend').click()
        assert limited.value.status == 429
        assert int(limited.value.headers['retry-after']) > 0
        expect(page.locator('.form-error[role="alert"]')).to_contain_text('Try again')
        expect(page.locator('.pick-ticket')).to_have_count(5)
        checks.append('Sixth request: 429, Retry-After, useful message; previous plan preserved')
        assert not errors, errors
        assert not external, external
        checks.append('No browser page errors and no attempted external browser requests')
        mobile.close()
        browser.close()
    result = {'checks': checks, 'plans': plans, 'browser_errors': errors, 'external_requests': external}
    (OUT / 'mock-flow-results.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()

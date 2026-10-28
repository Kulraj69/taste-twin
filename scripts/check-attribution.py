#!/usr/bin/env python3
"""Controlled UI regression, NOT a provider integration or demo recording."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

URL = 'http://127.0.0.1:3101'
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto(URL, wait_until='networkidle')
    response = page.request.post(URL + '/api/plan', data={'city': 'Lisbon', 'favourites': ['dish: noodles']})
    assert response.status == 200
    plan = response.json()
    checks = []
    for mode in ('mock', 'live'):
        for narration in ('nebius', 'template'):
            # Change only classification flags in a local synthetic response.
            # This tests displayed attribution, not provider compatibility.
            fixture = {**plan, 'mode': mode, 'narration': narration}
            page.route('**/api/plan', lambda route: route.fulfill(json=fixture))
            page.get_by_role('button', name='Find my weekend').click()
            credit = page.locator('.narration-credit')
            expect(credit).to_contain_text('Nemotron on Nebius' if narration == 'nebius' else 'Template day intros')
            expect(credit).to_contain_text('Synthetic receipts from invented data' if mode == 'mock' else 'Taste receipts built from Qloo data')
            if mode == 'mock':
                expect(credit).not_to_contain_text('from Qloo data')
            checks.append({'mode': mode, 'narration': narration, 'credit': credit.inner_text()})
            page.unroute('**/api/plan')
    page.locator('.receipt-button').first.click()
    page.locator('.affinity-proof').scroll_into_view_if_needed()
    badge = page.get_by_role('dialog').locator('.mode-badge')
    expect(badge).to_be_in_viewport()
    bounds = badge.bounding_box()
    assert bounds is not None and bounds['y'] >= 0
    assert bounds['y'] + bounds['height'] <= page.viewport_size['height']
    disclosure = {'text': badge.inner_text(), 'bounds': bounds, 'viewport': page.viewport_size, 'after_affinity_scroll': True}
    browser.close()
output = Path(__file__).resolve().parents[1] / 'demo/handoff-fixed/attribution-checks.json'
output.write_text(json.dumps({'controlled_fixture_not_live_evidence': True, 'checks': checks, 'scrolled_receipt_disclosure': disclosure}, indent=2) + '\n')
print('PASS four controlled narration/data-mode attribution combinations')

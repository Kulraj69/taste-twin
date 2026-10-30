#!/usr/bin/env python3
"""Controlled UI regression, NOT a provider or filmed demo run."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=3101)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
url = f'http://127.0.0.1:{args.port}'
checks = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto(url)
    response = page.request.post(url + '/api/plan', data={'city': 'Tokyo', 'favourites': ['dish: noodles']})
    assert response.status == 200
    plan = response.json()
    assert plan['mode'] == 'mock' and plan['narration'] == 'template'

    for narration in ['nebius', 'template']:
        fixture = json.loads(json.dumps(plan))
        fixture['narration'] = narration
        fixture['days'][0]['intro'] = 'Visit Invented Bistro at 8pm; your reservation is confirmed.'
        page.route('**/api/plan', lambda route: route.fulfill(json=fixture))
        page.get_by_role('button', name='Find my weekend').click()
        expect(page.locator('.day-intro').first).to_contain_text('Invented Bistro')
        warning = page.get_by_role('note').filter(has_text='AI mood text below is unverified')
        if narration == 'nebius':
            expect(warning).to_be_visible()
        else:
            expect(warning).to_have_count(0)
        page.locator('.receipt-button').first.click()
        expect(page.get_by_role('dialog')).to_contain_text('Demo mode: synthetic data')
        expect(page.get_by_role('dialog')).not_to_contain_text('reservation is confirmed')
        page.keyboard.press('Escape')
        checks.append(f'{narration}: warning visibility and first receipt display only')
        page.unroute('**/api/plan')
    browser.close()
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps({'scope': 'controlled synthetic UI fixture, not live generation', 'checks': checks}, indent=2))
print(json.dumps(checks))

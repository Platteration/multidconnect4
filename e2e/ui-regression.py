"""Run against a development server: python e2e/ui-regression.py URL.

Requires Python Playwright and Chromium (PW_CHROMIUM overrides its path).
Use development mode to exercise React Native's desktop ScrollView assertion.
"""
import os
import sys
from playwright.sync_api import expect, sync_playwright

url = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5176'
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.getenv('PW_CHROMIUM', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(url, wait_until='networkidle', timeout=120000)
    page.get_by_role('button', name='Skip', exact=True).click()
    page.get_by_role('button', name='row 6 column 1 empty', exact=True).click()
    expect(page.get_by_role('button', name='row 1 column 1 red', exact=True)).to_be_visible()
    page.wait_for_timeout(400)
    page.reload(wait_until='networkidle')
    expect(page.get_by_role('button', name='row 1 column 1 red', exact=True)).to_be_visible()
    for width, height in [(390, 844), (844, 390), (1440, 1000)]:
        page.set_viewport_size({'width': width, 'height': height})
        expect(page.get_by_role('button', name='row 1 column 1 red', exact=True)).to_be_visible()
        expect(page.get_by_role('button', name='Undo', exact=True)).to_be_enabled()
    page.get_by_role('button', name='Undo', exact=True).click()
    expect(page.get_by_role('button', name='row 1 column 1 empty', exact=True)).to_be_visible()
    assert not errors, '\n'.join(errors)
    browser.close()
print('PASS: desktop drop, reload, phone/landscape resize and undo; no page errors')

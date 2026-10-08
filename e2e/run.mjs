// The website, end to end: the built site (scripts/build-web.mjs --base /multidconnect4) served
// under that sub-path by e2e/serve.mjs, which answers with the headers public/_headers writes and
// the 404s public/_redirects writes, and the game played in Chromium under them.
//
// It fails on any Content-Security-Policy or Trusted Types violation (the page's own
// securitypolicyviolation events and the console's reports), any page error, any console error,
// and any request outside the site's sub-path, and it plays the game: the welcome, a drop for each
// side, a time travel that branches a timeline, an undo, a spin, the sounds, Play by message
// (copy, then the link it makes), the settings, a reload that keeps the game, and a game against
// the bot. Then the not-found page, the repository's own files, the site built for GitHub Pages
// and served as Pages serves it, and the safety net: a bundle that does not load, a bundle that
// throws, no JavaScript at all, and failures from scripts that are not the site's, which must
// not leave the note over a game that works.
//
//   npm run test:e2e        builds the site, then runs this
//   node e2e/run.mjs        runs this against the dist-web/ already built
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { finishForHost } from '../scripts/build-web.mjs';
import { headersFor, parseHeaders, serveSite } from './serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const BASE = '/multidconnect4';
const SITE = path.join(root, 'dist-web');
const NOT_FOUND = 'That page isn’t here';
/** What the Vibration row says in a browser: src/ui/SettingsModal.tsx's WEB_VIBRATION_HINT. */
const WEB_VIBRATION_HINT = 'A browser cannot vibrate for the game; the phone app can.';

// Playwright is a devDependency. Missing, this fails rather than skips: a skipped browser suite
// reads as a passed one.
const { chromium } = require('playwright');

if (!fs.existsSync(path.join(SITE, 'index.html'))) {
  console.error(`e2e: no site in ${path.relative(root, SITE)}; run npm run test:e2e, which builds it first`);
  process.exit(1);
}
const index = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
assert.ok(index.includes(`src="${BASE}/_expo/static/js/web/`), `the site was built for ${BASE}: run node scripts/build-web.mjs --base ${BASE}`);

const headerRules = parseHeaders(fs.readFileSync(path.join(SITE, '_headers'), 'utf8'));
// The page carries the header's policy as a <meta> too, less frame-ancestors, which a meta cannot
// set: a host with no headers of its own (GitHub Pages) still holds the game to it.
const policy = headersFor(headerRules, '/').headers.get('content-security-policy');
const metas = [...index.matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]+)" \/>/g)].map((m) => m[1]);
assert.deepEqual(metas, [policy.split('; ').filter((d) => !d.startsWith('frame-ancestors')).join('; ')], 'the built page carries the policy once, as _headers writes it');
const site = await serveSite({ root: SITE, base: BASE });
// The full Chromium build, not the headless shell: only the full browser fetches the favicon,
// which is what showed that the policy needs img-src.
const browser = await chromium.launch({ channel: 'chromium' });
const problems = [];

/** Every path a response in the browser came from, to check its headers off the browser too. */
const seen = new Set();

/**
 * Watches a page for everything this suite fails on. `expected` names the console errors and
 * page errors a scenario causes on purpose (the caller may add to it and empty it again);
 * nothing excuses a policy violation or a request outside the site.
 */
async function watched(context, label, expected = []) {
  const page = await context.newPage();
  const allowed = (text) => expected.some((re) => re.test(text));
  await page.exposeBinding('__e2eViolation', (_source, report) => problems.push(`${label}: policy violation: ${report}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__e2eViolation(`${e.violatedDirective} blocked ${e.blockedURI || '(inline)'} at ${e.sourceFile}:${e.lineNumber} ${e.sample}`);
    });
    // Every sound the game plays, and whether the browser let it.
    window.__e2ePlays = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      const name = String(this.currentSrc || this.src).split('/').pop().split('.')[0];
      const result = play.call(this);
      result.then(
        () => window.__e2ePlays.push(`${name} played`),
        (e) => window.__e2ePlays.push(`${name} refused: ${e.name}`),
      );
      return result;
    };
    // Every write to the clipboard through the API Permissions-Policy governs. Under
    // clipboard-write=() it is refused and expo-clipboard falls back to execCommand('copy'),
    // which still says "Copied", so the note alone would not show the policy is right.
    window.__e2eClipboard = [];
    if (navigator.clipboard) {
      const writeText = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = (text) => {
        const result = writeText(text);
        result.then(
          () => window.__e2eClipboard.push('written'),
          (e) => window.__e2eClipboard.push(`refused: ${e.name}`),
        );
        return result;
      };
    }
  });
  page.on('console', (m) => {
    const text = m.text();
    if (/Content.Security.Policy|Trusted Type/i.test(text) || (m.type() === 'error' && !allowed(text))) problems.push(`${label}: console.${m.type()}: ${text}`);
  });
  page.on('pageerror', (e) => {
    if (!allowed(e.message)) problems.push(`${label}: page error: ${e.message}`);
  });
  page.on('request', (r) => {
    const url = r.url();
    if (!url.startsWith(site.url) && url !== `${site.origin}${BASE}`) problems.push(`${label}: request outside the site: ${url}`);
  });
  page.on('response', (r) => {
    const url = new URL(r.url());
    if (!url.pathname.startsWith(`${BASE}/`)) return;
    // Every response carries exactly what _headers gives its path. Strict-Transport-Security
    // is the exception here: a browser ignores it from a plain-HTTP origin and does not keep it
    // with a cached response, so it is checked off the browser instead, below.
    const sitePath = decodeURIComponent(url.pathname.slice(BASE.length));
    seen.add(sitePath);
    const want = headersFor(headerRules, sitePath).headers;
    const got = r.headers();
    for (const [name, value] of want) {
      if (name !== 'strict-transport-security' && got[name] !== value) problems.push(`${label}: ${url.pathname} answered ${name}: ${got[name]}, not ${value}`);
    }
  });
  page.setDefaultTimeout(15000);
  return page;
}

const button = (page, name) => page.getByRole('button', { name, exact: true });
const press = async (page, name) => {
  await button(page, name).click();
};
/** The labels of every cell of the big board that holds a disc. */
const discs = async (page) =>
  (await page.getByRole('button', { name: /^row \d+ column \d+ (red|yellow)$/ }).evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))).sort();

/** WCAG contrast of an element's text against the background of the card it sits on. */
async function contrast(page, selector, cardSelector) {
  return page.evaluate(
    ([sel, card]) => {
      const rgb = (c) => c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
      const lum = ([r, g, b]) => {
        const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const el = document.querySelector(sel);
      const fg = lum(rgb(getComputedStyle(el).color));
      const ownBg = getComputedStyle(el).backgroundColor;
      const bg = lum(rgb(ownBg !== 'rgba(0, 0, 0, 0)' ? ownBg : getComputedStyle(document.querySelector(card)).backgroundColor));
      return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    },
    [selector, cardSelector],
  );
}

let current = 'setup';
async function step(name, fn) {
  current = name;
  await fn();
  console.log(`ok - ${name}`);
}

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['clipboard-write'] });
  const expected = [];
  const page = await watched(context, 'game', expected);
  let code = '';

  await step('the page loads under the policy, and the welcome opens', async () => {
    const response = await page.goto(site.url);
    assert.equal(response.status(), 200);
    assert.ok(response.headers()['content-security-policy'].includes("frame-ancestors 'none'"));
    assert.equal(await page.title(), '5D Connect Four');
    await button(page, 'Next').waitFor();
    assert.equal(await page.locator('#boot-failed').isHidden(), true, 'the safety net stays out of sight when the game starts');
    await press(page, 'Next');
    await press(page, 'Next');
    await press(page, 'Just play');
    await button(page, 'Just play').waitFor({ state: 'detached' });
  });

  await step('each side drops a disc', async () => {
    await press(page, 'row 1 column 4 empty');
    await button(page, 'row 1 column 4 red').waitFor();
    await press(page, 'row 1 column 3 empty');
    await button(page, 'row 1 column 3 yellow').waitFor();
  });

  await step('a disc travels into the past and branches a timeline', async () => {
    await press(page, 'row 1 column 4 red');
    await press(page, 'Timeline 1 turn 0, Red to move, travel target');
    await press(page, 'row 1 column 1 empty');
    await button(page, 'Timeline 2 turn 1, Yellow to move, waiting').waitFor();
    await page.getByText('Yellow to move · 2 boards waiting').waitFor();
  });

  await step('undo takes the travel back', async () => {
    await press(page, 'Undo');
    await button(page, 'Timeline 2 turn 1, Yellow to move, waiting').waitFor({ state: 'detached' });
    await page.getByText('Red to move · 1 board waiting').waitFor();
  });

  await step('the board spins, and every disc falls to the new bottom', async () => {
    await press(page, 'Spin right ↻');
    // Seven wide and six tall becomes six wide and seven tall.
    await button(page, 'row 7 column 6 empty').waitFor();
    await page.getByText('Yellow to move · 1 board waiting').waitFor();
  });

  await step('the sounds play, from the site itself', async () => {
    await page.waitForFunction(() => window.__e2ePlays.some((p) => p.startsWith('spin')));
    const plays = await page.evaluate(() => window.__e2ePlays);
    for (const sound of ['thud', 'warp', 'spin']) assert.ok(plays.includes(`${sound} played`), `${sound} played: ${plays.join(', ')}`);
  });

  await step('Play by message copies the code', async () => {
    await press(page, 'Menu');
    await press(page, 'Play by message');
    code = (await page.getByText(/^5DC4\./).innerText()).trim();
    assert.match(code, /^5DC4\.[A-Za-z0-9_-]+/);
    await press(page, 'Copy');
    await page.getByText('Copied. Paste it into any message.').waitFor();
    assert.deepEqual(await page.evaluate(() => window.__e2eClipboard), ['written']);
    await press(page, 'Close');
  });

  await step('Share… with no share sheet in this browser copies instead, and says so', async () => {
    // Chromium on Linux has no navigator.share; the button must still do something visible.
    assert.equal(await page.evaluate(() => 'share' in navigator), false);
    await press(page, 'Menu');
    await press(page, 'Play by message');
    await press(page, 'Share…');
    // The sheet keeps its note from the Copy above, so what shows the fallback ran is the
    // second write to the clipboard.
    await page.waitForFunction(() => window.__e2eClipboard.length === 2);
    assert.deepEqual(await page.evaluate(() => window.__e2eClipboard), ['written', 'written']);
    await page.getByText('Copied. Paste it into any message.').waitFor();
    await press(page, 'Close');
  });

  await step('the settings sheet works, and says what a browser cannot do', async () => {
    await press(page, 'Menu');
    await press(page, 'Settings');
    await page.getByText(WEB_VIBRATION_HINT).waitFor();
    assert.equal(await page.getByRole('switch', { name: 'Vibration' }).isDisabled(), true, 'the Vibration switch cannot be pressed in a browser');
    assert.equal(await page.getByRole('switch', { name: 'Sound' }).isDisabled(), false);
    await press(page, 'Dark');
    await press(page, 'Done');
    // The screen behind the header, now in the dark palette's background (src/ui/theme.ts).
    const screen = () =>
      page.evaluate(() => {
        for (let el = document.elementFromPoint(4, 4); el; el = el.parentElement) {
          const bg = getComputedStyle(el).backgroundColor;
          if (bg !== 'rgba(0, 0, 0, 0)') return bg;
        }
        return null;
      });
    await page.waitForFunction(() => !document.querySelector('[aria-modal="true"]'));
    assert.equal(await screen(), 'rgb(25, 35, 45)');
  });

  await step('a reload brings the same game back', async () => {
    const before = await discs(page);
    assert.ok(before.length >= 2);
    await page.reload();
    await button(page, 'Menu').waitFor();
    await page.waitForFunction((n) => document.querySelectorAll('[aria-label$=" red"], [aria-label$=" yellow"]').length >= n, before.length);
    assert.deepEqual(await discs(page), before);
  });

  await step('a link carrying a game code loads it, and leaves the address clean', async () => {
    await page.goto(`${site.url}?code=${encodeURIComponent(code)}`);
    await page.getByText('Load the shared game?').waitFor();
    await press(page, 'Load the shared game');
    await page.waitForFunction(() => !location.search.includes('code='));
    assert.equal(new URL(page.url()).pathname, `${BASE}/`);
    await page.getByText('Yellow to move · 1 board waiting').waitFor();
  });

  await step('the bot answers a move', async () => {
    await press(page, 'Menu');
    await press(page, 'New game');
    await press(page, 'Yes, new game');
    await press(page, 'Me against a bot');
    await press(page, 'Start');
    await press(page, 'row 1 column 4 empty');
    await page.waitForFunction(() => document.querySelectorAll('[aria-label$=" yellow"]').length >= 1);
  });

  await step('an address that is not part of the site answers the not-found page', async () => {
    // Chromium reports the 404 of the page it was sent to as a console error.
    expected.push(/the server responded with a status of 404/);
    const response = await page.goto(`${site.url}no/such/page`);
    assert.equal(response.status(), 404);
    assert.equal(await page.title(), 'Page not found · 5D Connect Four');
    await page.getByText(NOT_FOUND).waitFor();
    for (const scheme of ['dark', 'light']) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const sel of ['.not-found-card h1', '.not-found-card p', '.not-found-button']) {
        const ratio = await contrast(page, sel, '.not-found-card');
        assert.ok(ratio >= 4.5, `${sel} in the ${scheme} scheme: contrast ${ratio.toFixed(2)}, under 4.5`);
      }
    }
    await page.getByRole('link', { name: 'Open 5D Connect Four' }).click();
    await page.waitForURL(site.url);
    await button(page, 'Menu').waitFor();
    expected.length = 0;
  });

  await step("the repository's own files, and the configurations, are not part of the site", async () => {
    // The repository's files 404 because the build holds none of them; the configurations,
    // .nojekyll and metadata.json are in a build for any host, and _redirects refuses them.
    for (const file of ['README.md', '.git/config', '.git/HEAD', 'deploy/nginx.conf', '_headers', '_redirects', '.htaccess', '.nojekyll', 'metadata.json', 'package.json', 'app.json', '_expo/', 'assets/']) {
      const response = await page.request.get(`${site.url}${file}`);
      assert.equal(response.status(), 404, `${file} answered ${response.status()}`);
      assert.ok((await response.text()).includes(NOT_FOUND), `${file} answered the not-found page`);
    }
    for (const file of ['', 'index.html', 'guard.js', 'site.css', 'favicon.ico', 'robots.txt', '.well-known/security.txt', '404.html']) {
      const response = await page.request.get(`${site.url}${file}`);
      assert.equal(response.status(), 200, `${file || '/'} answered ${response.status()}`);
    }
  });

  await step('every path the game loaded answers every header _headers gives it, HSTS included', async () => {
    assert.ok(seen.size >= 6, `paths seen: ${[...seen].join(', ')}`);
    for (const sitePath of seen) {
      const response = await page.request.get(`${site.origin}${BASE}${sitePath}`);
      const got = response.headers();
      for (const [name, value] of headersFor(headerRules, sitePath).headers) assert.equal(got[name], value, `${sitePath}: ${name}`);
    }
  });
  await context.close();

  await step('the policy bites: no page can frame the game, and no script writes HTML from a string', async () => {
    // Deliberate violations, so this page is not one `watched` reports on.
    const bare = await browser.newContext();
    const p = await bare.newPage();
    const refusals = [];
    p.on('console', (m) => refusals.push(m.text()));
    await p.setContent(`<iframe src="${site.url}" width="400" height="400"></iframe>`);
    // A refused frame is left on the browser's error page, having loaded nothing of the game.
    const frame = () => p.frames().find((f) => f !== p.mainFrame());
    for (let i = 0; i < 100 && !refusals.some((t) => /frame-ancestors/.test(t)); i += 1) await p.waitForTimeout(100);
    assert.ok(refusals.some((t) => /Refused to frame .* "frame-ancestors 'none'"/.test(t)), `framing refused: ${refusals.join(' | ')}`);
    assert.equal(frame()?.url(), 'chrome-error://chromewebdata/');
    await p.goto(site.url);
    await button(p, 'Skip').waitFor();
    const written = await p.evaluate(() => {
      try {
        document.body.insertAdjacentHTML('beforeend', '<img src=x onerror="window.__xss=1">');
        return 'written';
      } catch (e) {
        return e.name;
      }
    });
    assert.equal(written, 'TypeError', 'Trusted Types refuse a string written as HTML');
    await bare.close();
  });

  await step("on GitHub Pages, which reads none of the hosts' files, the page's own <meta> holds the game to the policy", async () => {
    // GitHub Pages sends none of _headers and reads no _redirects. The game must still play under
    // the <meta> alone, and the <meta> must still bite. The site is the one a build with
    // `--host github-pages` writes: this build in a copy, less the .nojekyll a build for any host
    // gets, so that what the copy holds is what finishing it for GitHub Pages put there.
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'multidconnect4-pages-'));
    fs.cpSync(SITE, folder, { recursive: true });
    fs.rmSync(path.join(folder, '.nojekyll'));
    finishForHost(folder, 'github-pages');
    const pages = await serveSite({ root: folder, base: BASE, host: 'github-pages' });
    try {
      const bare = await browser.newContext();
      const p = await bare.newPage();
      const reports = [];
      p.on('console', (m) => {
        if (m.type() === 'error' || /Content.Security.Policy|Trusted Type/i.test(m.text())) reports.push(m.text());
      });
      p.on('pageerror', (e) => reports.push(e.message));
      const response = await p.goto(pages.url);
      assert.equal(response.headers()['content-security-policy'], undefined);
      await button(p, 'Skip').click();
      await button(p, 'row 1 column 4 empty').click();
      await button(p, 'row 1 column 4 red').waitFor();
      assert.deepEqual(reports, [], 'the game plays under the <meta> with nothing refused');
      const written = await p.evaluate(() => {
        try {
          document.body.insertAdjacentHTML('beforeend', '<b>x</b>');
          return 'written';
        } catch (e) {
          return e.name;
        }
      });
      assert.equal(written, 'TypeError', 'the <meta> enforces Trusted Types');
      // Pages serves whatever the folder holds, so a build for it holds no host's configuration;
      // and .nojekyll, without which a branch deploy runs Jekyll, which drops _expo/ (the game).
      for (const file of ['_headers', '_redirects', '.htaccess']) {
        assert.equal((await p.request.get(`${pages.url}${file}`)).status(), 404, `${file} is not in a build for GitHub Pages`);
      }
      assert.equal((await p.request.get(`${pages.url}.nojekyll`)).status(), 200);
      assert.deepEqual(pages.outside, []);
      await bare.close();
    } finally {
      pages.server.close();
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  await step('a bundle that does not load leaves a note, not a blank page', async () => {
    const failed = await browser.newContext();
    const p = await watched(failed, 'no bundle', [/Failed to load resource/]);
    await p.route('**/_expo/static/js/**', (route) => route.abort());
    await p.goto(site.url);
    await p.locator('#boot-failed').waitFor({ state: 'visible' });
    for (const scheme of ['dark', 'light']) {
      await p.emulateMedia({ colorScheme: scheme });
      const ratio = await contrast(p, '#boot-failed', '#boot-failed');
      assert.ok(ratio >= 4.5, `the note in the ${scheme} scheme: contrast ${ratio.toFixed(2)}, under 4.5`);
    }
    await failed.close();
  });

  await step('a bundle that throws while starting leaves the same note', async () => {
    const thrown = await browser.newContext();
    const p = await watched(thrown, 'throwing bundle', [/e2e: the bundle throws while starting/]);
    await p.route('**/_expo/static/js/**', (route) =>
      route.fulfill({
        status: 200,
        // The headers the real bundle is served with, so this one runs under the same policy.
        headers: Object.fromEntries(headersFor(headerRules, new URL(route.request().url()).pathname.slice(BASE.length)).headers),
        contentType: 'text/javascript',
        body: 'throw new Error("e2e: the bundle throws while starting");',
      }),
    );
    await p.goto(site.url);
    await p.locator('#boot-failed').waitFor({ state: 'visible' });
    await thrown.close();
  });

  /**
   * A page where another script fails while the game starts: after the page is parsed and before
   * the deferred bundle has drawn, the window the note used to stay up in for good, over a game
   * that played. `fault` is 'throw' or 'reject', done at that moment, or 'load', a script element
   * the page was given (see below) that fails to load then. Whether the note ever showed is kept.
   */
  async function foreignFailure(context, fault) {
    await context.addInitScript((kind) => {
      window.__e2eNoteShown = false;
      window.addEventListener(
        'error',
        (e) => {
          if (e.target && e.target.tagName === 'SCRIPT' && e.target.src.includes('/elsewhere/')) {
            window.__e2eRootChildren = document.getElementById('root').childElementCount;
            window.__e2eForeignFailed = true;
          }
        },
        true,
      );
      document.addEventListener('readystatechange', () => {
        if (document.readyState !== 'interactive') return;
        const note = document.getElementById('boot-failed');
        new MutationObserver(() => {
          if (!note.hidden) window.__e2eNoteShown = true;
        }).observe(note, { attributes: true });
        if (kind === 'load') return;
        setTimeout(() => {
          window.__e2eRootChildren = document.getElementById('root').childElementCount;
          if (kind === 'throw') throw new Error('e2e: a foreign script throws');
          void Promise.reject(new Error('e2e: a foreign promise rejects'));
        }, 0);
      });
    }, fault);
  }
  /** The game plays, the note is out of sight, and the failure came before the first draw. */
  async function playsWithoutNote(p) {
    await p.goto(site.url);
    await button(p, 'Skip').click();
    await button(p, 'row 1 column 4 empty').click();
    await button(p, 'row 1 column 4 red').waitFor();
    assert.equal(await p.evaluate(() => window.__e2eRootChildren), 0, 'the failure came before the game drew');
    assert.equal(await p.locator('#boot-failed').isHidden(), true, 'no "could not start" over a game that plays');
  }

  await step("an error thrown by a script that is not the site's never shows the note", async () => {
    // A browser extension, or anything else that runs script in the page. Its error names a file
    // that is not one of the site's (here none at all), so the guard does not count it.
    const noisy = await browser.newContext();
    const p = await watched(noisy, 'foreign throw', [/e2e: a foreign script throws/]);
    await foreignFailure(noisy, 'throw');
    await playsWithoutNote(p);
    assert.equal(await p.evaluate(() => window.__e2eNoteShown), false, 'the note never showed');
    await noisy.close();
  });

  await step("a script that is not the site's failing to load never shows the note", async () => {
    // A host or a proxy that writes a script of its own into the page, deferred and so run (here,
    // failing to load) after the page is parsed and before the game's bundle. A script built in
    // the page instead could not even be given an address: Trusted Types refuse it. The address
    // is outside the site, so `watched`, which fails on any such request, is not used: the
    // request is stopped in the browser and never reaches the server.
    const noisy = await browser.newContext();
    const p = await noisy.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
    });
    await p.route(`${site.origin}/elsewhere/**`, (route) => route.abort());
    await p.route(site.url, async (route) => {
      const response = await route.fetch();
      const html = (await response.text()).replace('</head>', '<script src="/elsewhere/missing.js" defer></script></head>');
      await route.fulfill({ response, body: html });
    });
    await foreignFailure(noisy, 'load');
    await playsWithoutNote(p);
    assert.equal(await p.evaluate(() => window.__e2eForeignFailed), true, 'the foreign script failed to load');
    assert.equal(await p.evaluate(() => window.__e2eNoteShown), false, 'the note never showed');
    assert.deepEqual(errors, []);
    await noisy.close();
  });

  await step("a promise rejected by a script that is not the site's is taken back once the game draws", async () => {
    // A rejection names no script, so the guard cannot tell whose it was and may show the note;
    // the game drawing is what withdraws it.
    const noisy = await browser.newContext();
    const p = await watched(noisy, 'foreign rejection', [/e2e: a foreign promise rejects/]);
    await foreignFailure(noisy, 'reject');
    await playsWithoutNote(p);
    await noisy.close();
  });

  await step('with JavaScript off, the page says what it needs', async () => {
    const off = await browser.newContext({ javaScriptEnabled: false });
    const p = await watched(off, 'no JavaScript');
    await p.goto(site.url);
    // Playwright's text search skips <noscript>, so the note is read by its own selector.
    const note = p.locator('noscript > .site-note');
    assert.equal(await note.isVisible(), true);
    assert.match(await note.innerText(), /^5D Connect Four needs JavaScript\./);
    assert.equal(await p.locator('#boot-failed').isHidden(), true);
    await off.close();
  });

  await step('a phone-sized window plays too', async () => {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = await watched(phone, 'phone');
    await p.goto(site.url);
    await button(p, 'Skip').tap();
    await button(p, 'row 1 column 4 empty').tap();
    await button(p, 'row 1 column 4 red').waitFor();
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no sideways scroll');
    await phone.close();
  });

  current = 'the whole run';
  assert.deepEqual(site.outside, [], 'requests that reached the server outside the site');
  assert.deepEqual(site.twice, [], 'paths two _headers rules both set a header for');
  assert.deepEqual(problems, [], 'violations, errors and requests outside the site');
  console.log(`e2e: passed, ${site.requests.length} requests, all inside ${BASE}/`);
} catch (error) {
  console.error(`not ok - ${current}`);
  console.error(error);
  if (problems.length) console.error(problems.join('\n'));
  const shots = path.join(os.tmpdir(), 'multidconnect4-e2e');
  fs.mkdirSync(shots, { recursive: true });
  for (const [i, context] of browser.contexts().entries()) {
    for (const [j, p] of context.pages().entries()) await p.screenshot({ path: path.join(shots, `${i}-${j}.png`) }).catch(() => {});
  }
  console.error(`screenshots of the open pages: ${shots}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  site.server.close();
}

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
// The host above runs no API, as GitHub Pages and Netlify run none: the page asks for
// api/config once, is answered 404, and draws no sign-in and no shop. Then the same site is
// served with the sign-in and shop API beside it (server/kit with server/catalogue.js, as
// Cloudflare Pages runs functions/api/[[path]].js), its Google and Stripe the fakes of
// server/fakes.mjs handed to the kit as its `fetch`, and the whole flow is played under the
// site's policy: sign in (Google's authorize page answered by page.route with the redirect back
// to the callback), buy (Checkout's page answered the same way), Stripe's signed webhook, the
// pack drawn as owned, sign out, sign in again, delete the account, and a sign-in that fails.
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
import catalogue from '../server/catalogue.js';
import { createFakes, envFor, signedDelivery } from '../server/fakes.mjs';
import { createNodeHandler } from '../server/kit/node.js';
import { createMemoryStore } from '../server/kit/store.js';
import { headersFor, parseHeaders, serveSite } from './serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const BASE = '/multidconnect4';
const SITE = path.join(root, 'dist-web');
const NOT_FOUND = 'That page isn’t here';
/** What the Vibration row says in a browser: src/ui/SettingsModal.tsx's WEB_VIBRATION_HINT. */
const WEB_VIBRATION_HINT = 'A browser cannot vibrate for the game; the phone app can.';
/** The About card's sentence on a site with no account, and on one with: src/app/accountModel.ts. */
const PRIVACY_OFFLINE = 'Nothing leaves your device. There is no server, no account and no analytics; a game code goes only where you send it.';
const PRIVACY_WITH_ACCOUNT = /^Nothing leaves your device unless you sign in or buy\. Signing in with Google tells this site an account id/;
/** What Extras draws where Buy was while a payment is on its way (WORDS.processing), and the tab's note of it. */
const PROCESSING = 'Payment received — processing';
const PENDING_KEY = 'multidconnect4.purchasePending.v1';
/** The board skins' colours (src/ui/theme.ts), as a computed style writes them. */
const NEON_BOARD = 'rgb(18, 20, 42)';
const CLASSIC_BOARD = 'rgb(42, 85, 200)';
/**
 * Whether the big board is drawn in that colour: the frame two levels above its first cell
 * (src/ui/DiscBoard.tsx). Not any element in that colour: the Look row's swatches carry every
 * skin's.
 */
const drawn = (color) => {
  const frame = document.querySelector('[aria-label^="row "][aria-label*=" column "]')?.parentElement?.parentElement;
  return !!frame && getComputedStyle(frame).backgroundColor === color;
};
/** The headers server/kit sends on every answer of its own (server/kit/http.js, API_HEADERS). */
const API_HEADERS = {
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'referrer-policy': 'no-referrer',
  'cross-origin-resource-policy': 'same-origin',
};

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

/** The api/config probes a host without the API answered 404, page by page: see `watched`. */
const configProbes = [];

/**
 * Watches a page for everything this suite fails on. `expected` names the console errors and
 * page errors a scenario causes on purpose (the caller may add to it and empty it again);
 * nothing excuses a policy violation or a request outside the site. `on` is the host the page
 * is served by; `leaves`, the outside addresses the page may navigate to, each answered by
 * page.route in the browser and never sent (Google's authorize page and Stripe's Checkout).
 *
 * The one console error excused everywhere is Chromium's line for the page's own api/config
 * when it is a 404, as it is on every host that runs no API: it is counted in configProbes,
 * matched by the address it is reported at, not by its words.
 */
async function watched(context, label, expected = [], { on = site, leaves = [] } = {}) {
  const page = await context.newPage();
  const allowed = (text) => expected.some((re) => re.test(text));
  page.left = [];
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
    if (m.type() === 'error' && m.location().url === `${on.url}api/config` && /the server responded with a status of 404/.test(text)) {
      configProbes.push(label);
      return;
    }
    if (/Content.Security.Policy|Trusted Type/i.test(text) || (m.type() === 'error' && !allowed(text))) problems.push(`${label}: console.${m.type()}: ${text}`);
  });
  page.on('pageerror', (e) => {
    if (!allowed(e.message)) problems.push(`${label}: page error: ${e.message}`);
  });
  page.on('request', (r) => {
    const url = r.url();
    if (url.startsWith(on.url) || url === `${on.origin}${BASE}`) return;
    if (r.isNavigationRequest() && leaves.some((prefix) => url.startsWith(prefix))) page.left.push(url);
    else problems.push(`${label}: request outside the site: ${url}`);
  });
  page.on('response', (r) => {
    const url = new URL(r.url());
    if (!url.pathname.startsWith(`${BASE}/`)) return;
    if (on.hasApi && url.pathname.startsWith(`${BASE}/api/`)) {
      // The API's own answers carry its headers, not _headers', which a host does not apply to
      // a Function (Cloudflare Pages) or a proxied location (nginx). On a host without the API
      // the path is the not-found page's, under _headers like any other.
      const got = r.headers();
      for (const [name, value] of Object.entries(API_HEADERS)) if (got[name] !== value) problems.push(`${label}: ${url.pathname} answered ${name}: ${got[name]}, not ${value}`);
      return;
    }
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
/** Opens a sheet from the menu, once the menu has gone: while it fades, its own Close is a second one. */
const openFromMenu = async (page, item) => {
  await press(page, 'Menu');
  await press(page, item);
  await button(page, item).waitFor({ state: 'detached' });
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

  await step('with no API on the host, the page asked for api/config once and draws no sign-in and no shop', async () => {
    // GitHub Pages and Netlify run nothing: api/config is the not-found page, and the account and
    // the shop do not exist. The About card keeps its sentence, and the Supporter pack is what the
    // phone app shows, every look free.
    await openFromMenu(page, 'Settings');
    await page.getByText(PRIVACY_OFFLINE).waitFor();
    assert.equal(await button(page, 'Sign in with Google').count(), 0);
    await press(page, 'Done');
    await openFromMenu(page, 'Extras');
    await page.getByText('The store is not wired up in this build, so everything is unlocked for everyone.').waitFor();
    assert.equal(await button(page, 'Buy').count(), 0);
    assert.equal(await button(page, 'Sign in to buy').count(), 0);
    await press(page, 'Close');
    const asked = site.requests.filter((p) => p.startsWith(`${BASE}/api/`));
    assert.deepEqual(asked, [`${BASE}/api/config`], 'one question per page load, and nothing after the 404');
    assert.deepEqual(configProbes, ['game']);
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
    for (const file of ['README.md', '.git/config', '.git/HEAD', 'deploy/nginx.conf', '_headers', '_redirects', '.htaccess', '_routes.json', '.nojekyll', 'metadata.json', 'package.json', 'app.json', '_expo/', 'assets/', 'server/catalogue.js', 'functions/api/[[path]].js']) {
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

  await step('with the API beside the site: sign in with Google, buy, the webhook, the pack owned, sign out, delete', async () => {
    // The site as Cloudflare Pages serves it with functions/api/[[path]].js: server/kit with this
    // app's catalogue, answering <base>/api/*, its Google and Stripe the fakes it is handed as
    // its fetch. APP_URL is this host's own address, as on a deployment.
    const fakes = await createFakes();
    let handler = null;
    const shop = await serveSite({ root: SITE, base: BASE, api: (req, res) => handler(req, res) });
    const logs = [];
    handler = createNodeHandler({ catalogue, env: envFor(shop.url), store: createMemoryStore(), fetch: fakes.fetch, log: (level, message) => logs.push(`${level}: ${message}`) });
    assert.deepEqual(handler.features, { signIn: true, shop: true });
    const GOOGLE = 'https://accounts.google.com/o/oauth2/v2/auth?';
    const CHECKOUT = 'https://checkout.stripe.com/c/pay/';
    const visitor = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    // Only Checkout is ever navigated to: the page goes there itself. Google's authorize page is
    // reached by the kit's redirect, which the browser is never let follow (below).
    const p = await watched(visitor, 'account', [], { on: shop, leaves: [CHECKOUT] });
    try {
      // Google's side. Playwright routes a request but not the ones a redirect makes (its
      // route() note: "the handler will only be called for the first url if the response is a
      // redirect"), so the authorize page is answered where the redirect to it is made: the
      // kit's own answer to api/auth/google/start is fetched as it is, the authorize URL in it
      // checked as Google checks it (fakes.consent), and the browser sent on to the callback
      // that Google would send it to, with the kit's sign-in cookie; or, refusing, with Google's
      // `error=access_denied`. A request to accounts.google.com itself is one `watched` fails on.
      const answered = [];
      let refuse = false;
      await p.route(`${shop.url}api/auth/google/start?*`, async (route) => {
        const response = await route.fetch({ maxRedirects: 0 });
        const url = response.headers()['location'] ?? '';
        assert.equal(response.status(), 302);
        assert.ok(url.startsWith(GOOGLE), url);
        answered.push(url);
        let back;
        if (refuse) {
          const asked = new URL(url).searchParams;
          back = new URL(asked.get('redirect_uri'));
          back.searchParams.set('error', 'access_denied');
          back.searchParams.set('state', asked.get('state'));
        } else {
          back = fakes.consent(url, { sub: '1001', email: 'ada@example.com' });
        }
        assert.equal(`${back.origin}${back.pathname}`, `${shop.url}api/auth/google/callback`);
        await route.fulfill({ response, headers: { ...response.headers(), location: back.href } });
      });
      // Stripe's side: Checkout, paid at once, sends the visitor back to success_url.
      const checkouts = [];
      await p.route('https://checkout.stripe.com/**', (route) => {
        const url = route.request().url();
        answered.push(url);
        checkouts.push(url);
        return route.fulfill({ status: 302, headers: { location: `${shop.url}?purchase=success` } });
      });
      const title = (badge) => p.getByText(badge ? '5D Connect Four ✦' : '5D Connect Four', { exact: true });
      const settings = () => openFromMenu(p, 'Settings');
      const signIn = async () => {
        await settings();
        await press(p, 'Sign in with Google');
        await p.waitForURL(shop.url);
        await button(p, 'Menu').waitFor();
      };

      await p.goto(shop.url);
      await press(p, 'Skip');
      await settings();
      await p.getByText(PRIVACY_WITH_ACCOUNT).waitFor();
      await press(p, 'Done');
      await openFromMenu(p, 'Extras');
      await p.getByText('€2.99', { exact: true }).waitFor();
      await press(p, 'Sign in to buy');
      await p.waitForURL(shop.url);
      await button(p, 'Menu').waitFor();
      await settings();
      await p.getByText('Signed in as ada@example.com').waitFor();
      // The store is on, and nothing is owned: a ✦ look is the Supporter pack's.
      await button(p, '✦ Neon grid').waitFor();
      await press(p, 'Done');
      await title(false).waitFor();

      await openFromMenu(p, 'Extras');
      const back = p.waitForResponse((r) => r.url() === `${shop.url}?purchase=success`);
      await press(p, 'Buy');
      // Back from Checkout: the address loses its ?purchase=success, and the page asks api/me
      // until the purchase shows. It shows only once Stripe's signed webhook has said so: until
      // then no thank-you, and where Buy was the pack says the payment is on its way, so that a
      // second press cannot start a second Checkout to pay.
      await back;
      await p.waitForFunction(() => location.search === '');
      assert.equal(checkouts.length, 1);
      await openFromMenu(p, 'Extras');
      await p.getByText(PROCESSING, { exact: true }).waitFor();
      assert.equal(await button(p, 'Buy').count(), 0);
      assert.equal(await p.getByText(/Thank you/).count(), 0);
      assert.equal(await p.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? 'null')?.at > 0, PENDING_KEY), true);
      await press(p, 'Close');
      const delivery = signedDelivery(fakes.paid(checkouts[0]));
      const hook = await fetch(`${shop.url}api/webhooks/stripe`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'stripe-signature': delivery.signature },
        body: delivery.body,
      });
      assert.equal(hook.status, 200);
      await p.getByText('Thank you — Supporter pack is unlocked.').waitFor({ timeout: 20000 });
      assert.equal(await p.evaluate((key) => sessionStorage.getItem(key), PENDING_KEY), null);
      await title(true).waitFor();
      await press(p, 'Dismiss');
      await openFromMenu(p, 'Extras');
      await p.getByText('Owned', { exact: true }).waitFor();
      assert.equal(await button(p, 'Buy').count(), 0);
      await press(p, 'Close');
      await settings();
      await press(p, 'Neon grid');
      await p.waitForFunction(drawn, NEON_BOARD);
      await press(p, 'Sign out');
      await button(p, 'Sign in with Google').waitFor();
      // Signed out, the pack is no longer the visitor's: the board is drawn as the default again,
      // and the choice stays theirs for when it is.
      await p.waitForFunction(drawn, CLASSIC_BOARD);
      assert.equal(await p.evaluate(drawn, NEON_BOARD), false);
      await button(p, '✦ Neon grid').waitFor();
      await press(p, 'Done');
      await title(false).waitFor();

      // The purchase is the account's: signing in again brings it back, and the board with it.
      await signIn();
      await title(true).waitFor();
      await p.waitForFunction(drawn, NEON_BOARD);

      // Deleting the account takes the purchase with it, after asking.
      await settings();
      await press(p, 'Delete account');
      await p.getByText('Delete account?').waitFor();
      await press(p, 'Delete account');
      await button(p, 'Sign in with Google').waitFor();
      await press(p, 'Done');
      await title(false).waitFor();
      await signIn();
      await title(false).waitFor();
      await openFromMenu(p, 'Extras');
      await button(p, 'Buy').waitFor();

      // Paid again, and the page reloaded before the webhook: the tab remembers the payment, so
      // Buy stays away (the kit carried here would start a second Checkout for it), until the
      // webhook is in and api/me reports the pack.
      const backAgain = p.waitForResponse((r) => r.url() === `${shop.url}?purchase=success`);
      await press(p, 'Buy');
      await backAgain;
      await p.waitForFunction(() => location.search === '');
      assert.equal(checkouts.length, 2);
      // The tab notes the payment once api/me has said who is signed in, a moment after the
      // address is cleaned: reload only once it has.
      await p.waitForFunction((key) => sessionStorage.getItem(key) !== null, PENDING_KEY);
      await p.reload();
      await button(p, 'Menu').waitFor();
      await openFromMenu(p, 'Extras');
      await p.getByText(PROCESSING, { exact: true }).waitFor();
      assert.equal(await button(p, 'Buy').count(), 0);
      await press(p, 'Close');
      const again = signedDelivery(fakes.paid(checkouts[1]));
      const hookAgain = await fetch(`${shop.url}api/webhooks/stripe`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'stripe-signature': again.signature },
        body: again.body,
      });
      assert.equal(hookAgain.status, 200);
      await p.reload();
      await title(true).waitFor();
      await openFromMenu(p, 'Extras');
      await p.getByText('Owned', { exact: true }).waitFor();
      assert.equal(await p.evaluate((key) => sessionStorage.getItem(key), PENDING_KEY), null);
      await press(p, 'Close');

      // A sign-in Google refuses comes back to the site, which says so once and cleans the address.
      await settings();
      await press(p, 'Sign out');
      await button(p, 'Sign in with Google').waitFor();
      refuse = true;
      await press(p, 'Sign in with Google');
      await p.getByText("Sign-in didn't complete.").waitFor();
      assert.equal(new URL(p.url()).search, '');
      await press(p, 'Dismiss');
      await p.goto(`${shop.url}?purchase=cancelled`);
      await button(p, 'Menu').waitFor();
      await p.waitForFunction(() => location.search === '');
      assert.equal(await p.getByRole('alert').count(), 0);
      // Anyone can open the address Checkout returns to. Signed out, it is taken out of the
      // address and nothing more: no line about a payment, and no api/me asked after the first.
      const before = shop.apiRequests.length;
      await p.goto(`${shop.url}?purchase=success`);
      await button(p, 'Menu').waitFor();
      await p.waitForFunction(() => location.search === '');
      await p.waitForTimeout(4000);
      assert.deepEqual(shop.apiRequests.slice(before), [`GET ${BASE}/api/config`, `GET ${BASE}/api/me`]);
      assert.equal(await p.getByRole('alert').count(), 0);

      // Every page that left the site went to Stripe's Checkout, which the browser answered
      // itself; Google's consent was answered before the browser went there. Nothing reached either.
      assert.deepEqual(p.left, checkouts);
      assert.equal(answered.filter((u) => u.startsWith(GOOGLE)).length, 4);
      assert.equal(answered.length, 6);
      assert.deepEqual(fakes.unexpected, []);
      assert.deepEqual(logs, []);
      assert.deepEqual(shop.outside, []);
      assert.ok(shop.apiRequests.some((r) => r === `POST ${BASE}/api/webhooks/stripe`));
    } finally {
      await visitor.close();
      shop.server.close();
    }
  });

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
    // connect-src 'self': the site's own api/ and nothing else. Were the policy to let it through,
    // the route below stops the request in the browser; the policy's own refusal is what is read.
    await p.route('https://example.com/**', (route) => route.abort());
    const reached = await p.evaluate(async () => {
      try {
        await fetch('https://example.com/collect');
        return 'fetched';
      } catch (e) {
        return e.name;
      }
    });
    assert.equal(reached, 'TypeError');
    assert.ok(
      refusals.some((t) => /Refused to connect to 'https:\/\/example\.com\/collect'.*"connect-src 'self'"/.test(t)),
      `the request refused by connect-src: ${refusals.join(' | ')}`,
    );
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
      // Pages runs no API: api/config is its not-found page, which Chromium reports, and the page
      // draws no sign-in and no shop.
      const probes = [];
      p.on('console', (m) => {
        if (m.type() === 'error' && m.location().url === `${pages.url}api/config` && /status of 404/.test(m.text())) probes.push(m.text());
        else if (m.type() === 'error' || /Content.Security.Policy|Trusted Type/i.test(m.text())) reports.push(m.text());
      });
      p.on('pageerror', (e) => reports.push(e.message));
      const response = await p.goto(pages.url);
      assert.equal(response.headers()['content-security-policy'], undefined);
      await button(p, 'Skip').click();
      await button(p, 'row 1 column 4 empty').click();
      await button(p, 'row 1 column 4 red').waitFor();
      assert.deepEqual(reports, [], 'the game plays under the <meta> with nothing refused');
      assert.equal(probes.length, 1);
      assert.deepEqual(pages.requests.filter((r) => r.startsWith(`${BASE}/api/`)), [`${BASE}/api/config`]);
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
      for (const file of ['_headers', '_redirects', '.htaccess', '_routes.json']) {
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

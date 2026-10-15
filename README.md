# 5D Connect Four

A parody of *5D Chess with Multiverse Time Travel*, but with a game you can
actually hold in your head: Connect Four. Many boards, many timelines, and
discs that can be sent into the past.

Built with [Expo](https://expo.dev) / React Native, so the same code runs on
iOS, Android, and the web. Two players share one phone (pass and play).

## How it plays

- **It's Connect Four.** Red moves first. Four in a row on *any* board, in
  *any* timeline, wins the whole game instantly.
- **Every move is remembered.** Each turn creates a new board. The map at the
  bottom of the screen shows every board that has ever existed, laid out left
  to right through time, one row per timeline.
- **Or spin the whole board.** Instead of dropping a disc, turn the board a
  quarter turn left or right. Every disc falls to the new bottom, so a board
  that was 7 wide and 6 tall is now 6 wide and 7 tall, stacks become rows,
  and blocked lines open up. A freshly spun board has to see a disc before it
  can be spun again, and an empty board can't be spun at all.
- **Send a disc into the past.** Tap one of your discs on a "now" board to pick
  it up. The map lights up the past boards it can travel to (boards where it
  was also your move). Tap one, then tap a column to drop the disc there.
- **That branches a new timeline.** The past board itself never changes;
  instead history forks. A fresh timeline starts from that moment with your
  extra disc in it, and your opponent has to answer there too.
- **Pulling a disc out has consequences.** Everything stacked above it falls
  one row in the present. Sometimes that helps you, sometimes it hands your
  opponent four in a row.
- **Play every waiting board.** On your turn you must make one move on every
  board marked *play*. Only then does the turn pass.
- **Full boards are finished.** If every board is full with no winner, the game
  is a draw.

Why parity matters: you can only travel to boards where it was your move. On
those boards you already had your chance, so if a winning slot was open you
would have taken it. Time travel therefore is not a free "go back and win"
button; it is a way to reshape the past, multiply the boards your opponent must
defend, and rearrange the present by collapsing a column.

## What's in the app

- **Two ways to play alone or together.** Pass-and-play on one phone, or
  against a bot at three levels: Novice (drops discs, usually blocks),
  Tricky (spins, never walks into a win or a fork) and Paradox (also
  travels through time, pops and flips when it pays). Undo rewinds through
  the bot's replies.
- **Puzzles.** Nine hand-made positions, each teaching one trick: a plain
  connect-four, a spin, a time travel into a missed win, a collapse, a flip,
  a fork against the strongest bot, a pop-out, a two-board turn, and a
  "survive" puzzle where you must defuse a fork. Progress is saved.
- **Replay.** Step through any game move by move with a one-line narration.
- **Play by message.** Share a game as a short code, paste it into any chat,
  and the other person loads it, moves, and sends it back. No server.
- **Rule variants.** Pop-out (remove one of your own bottom discs), flip
  (turn the board upside down), and strict present, the real 5D Chess rule:
  only boards at the present must be played, boards ahead of it are
  optional, and you end your turn yourself. All off by default.
- **Themes and looks.** System, dark or light theme; five board skins; four
  piece sets that also rename the sides; colour-blind markings on discs; a
  reduce-motion setting that follows the device or overrides it. Settings can
  be reset to their defaults without touching games, record or progress.
- **Feel.** Haptics and short synthesized sounds, both switchable. A
  browser cannot vibrate, so there the Vibration row says so instead. A falling
  animation for discs and a turning animation for spins.
- **Your record.** Games played, wins against each bot, time travels made,
  biggest multiverse, longest game, and puzzles solved.
- **A welcome on first launch** that shows the one idea that matters, with a
  real tiny multiverse, and offers the puzzles.
- **Links.** A game code also loads from a link: `?code=` on the web build
  and the app's own scheme on a device. Over a game in progress the link is
  offered, not obeyed, and one whose game will not load says why under the
  board.
- **Fits the screen.** On a device the app is locked to portrait
  (`orientation` in `app.json`), so the board stacks over the map; the
  side-by-side layout the screen keeps for a window wider than it is tall (by
  more than 15%, in `GameScreen`) is what the web build shows in a wide
  browser window. The map draws a line from each branch to the board it
  split off, and a time travel flies a token across it.
- **Saved automatically.** The game in progress, settings, record, and
  puzzle progress survive closing the app.

## Money, and what will never be for sale

The app is built so it can sell one thing: a **Supporter pack** of cosmetics
(the board skins and piece sets marked ✦, plus future puzzle packs). Nothing
that changes the rules, the bots, or the outcome of a game will ever be sold,
and there are no loot boxes.

In the phone apps, until a billing library is wired in, `STORE_ENABLED` in
`src/app/purchases.ts` is false and every extra is unlocked for everyone. To
go live: implement `purchase` and `restore` in that file against your store
SDK, persist the result, and set the flag to true. The Settings sheet and the
Extras sheet already respect the entitlement.

On the website the pack is sold through Stripe Checkout to a visitor signed in
with Google, once the site's own API is configured (see "Sign-in and the shop"
below). Only then does the store turn on there, and then what unlocks the ✦
looks is the purchase the server has on record, which Stripe's signed webhook
alone writes. Without that API (GitHub Pages, any static host) the website is
as the phone apps are: no sign-in, no shop, every extra free. The unlock is a
cosmetic gate in the visitor's own browser, not a secret: anyone who edits the
page can wear a ✦ board without paying. A ✦ look stays chosen in the
visitor's settings whatever happens, but is drawn only while it is owned:
one chosen while everything was free, or whose purchase was refunded,
signed out of or deleted with the account, is drawn as the default board or
pieces until the server reports the pack again, and the pickers offer the
others to a supporter only. Until the site has answered what it sells (its
`api/config`, and `api/me` where sign-in is on) nothing is owned on the web,
so on every load a ✦ look is drawn as its default for the time of that
answer, on a host with no API too. A site with no API, or whose `api/config`
fails or is not the API's answer, is a host with no API for that visit:
every look free.

## Design comparisons

The dated Connect Four comparisons and concept artwork are versioned in the shared bundle in the Chess repository:

- [Connect Four phone screenshot comparison](https://github.com/Platteration/chesscheatser/blob/4d6a208d90d404f2d6a3b93fcf17ae3707b58f0d/docs/comparisons/comparisons/multidconnect4-phone-light-game.png)
- [Connect Four sprite style comparisons](https://github.com/Platteration/chesscheatser/blob/4d6a208d90d404f2d6a3b93fcf17ae3707b58f0d/docs/comparisons/styles/comparisons/connect4-light.png)
- [Complete galleries, PNG sprites and editable Blender projects](https://github.com/Platteration/chesscheatser/tree/4d6a208d90d404f2d6a3b93fcf17ae3707b58f0d/docs/comparisons)
- [Clone, open, edit or export the comparison bundle](https://github.com/Platteration/chesscheatser/blob/4d6a208d90d404f2d6a3b93fcf17ae3707b58f0d/docs/comparisons/GIT.md)

The screenshots record the 11 October 2026 capture commits; the Arcade Pop, Neon Circuit and Porcelain Studio concepts were added on 13 October. These links pin the shared asset revision so they remain reproducible as the apps evolve.

## Running it

```sh
npm install
npm start          # Expo dev server; scan the QR code with Expo Go
npm run ios        # iOS simulator (macOS)
npm run android    # Android emulator or device
npm run web        # in a browser
```

### Native builds

To produce store builds use [EAS Build](https://docs.expo.dev/build/introduction/)
(`npx eas build --platform ios|android`). The bundle identifiers are set in
`app.json`. `eas.json` has development, preview, and production profiles
for EAS Build. The icon family in `assets/` (the icon, the favicon, the
Android adaptive layers and the splash image the `expo-splash-screen` plugin
shows) is Blender relief artwork. Its editable scene is
`assets/artwork/icon.blend`; regenerate it with
`blender -b --python scripts/render-icons.py` (Blender 4.3). Inspect the
adaptive masks and the launch splash on Android and iOS devices before a store
release. `docs/release.md` is the release checklist and `docs/store-listing.md`
the store listing draft.

### Deploy

The web build is also a website: a static one. The game runs entirely in the
visitor's browser, as it does on a phone; the host only serves files, and the
headers and rules that protect them, which this repository writes for it.

```sh
npm run build:web                                    # the site, in dist-web/, for a domain of its own
node scripts/build-web.mjs --base /multidconnect4    # the same site, served under /multidconnect4/
node scripts/build-web.mjs --host netlify            # for one host: github-pages, netlify, cloudflare, apache or nginx
```

**Publish that folder, and only it.** `dist-web/` holds `index.html`,
`404.html`, `guard.js`, `site.css`, `favicon.ico`, `robots.txt`,
`.well-known/security.txt`, `_expo/` (the game) and `assets/` (the sounds),
plus the hosts' configurations, which `npx expo export` copies from
`public/`: `_headers` and `_redirects` for Netlify and Cloudflare Pages,
`.htaccess` for Apache; and `_routes.json` for Cloudflare Pages, which
`build-web.mjs` writes (it names the base path). A host does not serve a file it reads, but it serves
any other as a plain file: Netlify refuses the others with `_redirects` and
Apache with `.htaccess`, while Cloudflare Pages serves `.htaccess` (and
`.nojekyll`), and GitHub Pages, which reads none of them, serves all four.
Nothing in them is secret (they are in this repository), but `--host` leaves
out every configuration that host does not read. For nginx, which reads none
of them either, copy `deploy/nginx.conf` into the server's configuration and
set `server_name`, `root` and the certificate paths. A build for GitHub Pages,
or for no host in particular, also holds an empty `.nojekyll`: GitHub Pages
runs a site deployed from a branch through Jekyll, which leaves out every
folder whose name starts with an underscore, `_expo/` (the whole game)
among them. (`npm run build:web` leaves `metadata.json`, the exporter's
manifest for EAS Update, out of the site; a plain `npx expo export` does not.)

Never point a host at the checkout: `.git/` holds the whole history. Apache
reads `.htaccess`, and Netlify `_redirects`, only from the folder they
publish, and a checkout has neither at its root, so pointed at one they
serve all of it, `.git/` included. Only nginx's rules are the server's own and
still hold there: every dotfile but `/.well-known/` (so all of `.git/`),
`README.md` and `deploy/` answer 404, and the rest of the checkout is served.

**Apache** needs two modules that Debian and Ubuntu leave off, and has to be
allowed to read `.htaccess` at all, which they do not allow under
`/var/www`; none of this can be set from the file itself:

```sh
sudo a2enmod rewrite headers
# in the site's <Directory> block (or the virtual host's):
#   AllowOverride FileInfo Options      (or All)
# and in the server's configuration, which .htaccess cannot set:
#   ServerTokens Prod
sudo systemctl reload apache2
```

Without a module, every request answers 500 and the error log names the
directive (`Invalid command 'RewriteEngine'`): the file wraps nothing in
`<IfModule>`, which would serve the folder with none of its headers or
refusals and say nothing. With `FileInfo` or `Options` alone, every request
answers 500 too (measured on Apache 2.4.58). Without `AllowOverride` at all,
Apache ignores the file without a word, so run the launch checklist below.
Without `ServerTokens Prod`, every response names Apache's version and, as
Ubuntu ships it, the operating system.

On a host you copy files to (Apache, nginx), copy `_expo/` and `assets/`
before `index.html`, so that no visitor is sent a page whose bundle has not
arrived yet; Netlify and Cloudflare Pages switch a deploy over in one step.
Apache and nginx answer the not-found page at a missing hashed address with
`no-cache`, so a visitor who did get one is not kept on it for a year.

**Response headers.** The same set is in `public/_headers`,
`public/.htaccess` and `deploy/nginx.conf`, and
`src/app/__tests__/website.test.ts` fails when they disagree:

| Header | Value | Why |
| --- | --- | --- |
| `Content-Security-Policy` | `default-src 'none'; script-src 'self'; style-src 'self' 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='; img-src 'self'; media-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'; upgrade-insecure-requests; require-trusted-types-for 'script'; trusted-types 'none'` | Only the site's own script, stylesheet, favicon and sounds load, measured by playing the game in Chromium under it. The one hash is the empty string's: react-native-web creates an empty `<style>` element and fills it through the CSSOM, which the policy does not govern, so no `'unsafe-inline'` is needed. `connect-src 'self'` is the site's own `api/` (sign-in and the shop, below) and nothing else: with `'none'` the page's `GET api/config` is refused (measured), and a request to any other origin still fails loudly. Google and Stripe are reached by top-level navigations, which no directive governs. Trusted Types are enforced with no policy, because nothing in the game writes HTML from a string. |
| `X-Frame-Options` | `DENY` | With `frame-ancestors 'none'`: no other site can frame the game (clickjacking). |
| `X-Content-Type-Options` | `nosniff` | Files are what their type says. |
| `Referrer-Policy` | `no-referrer` | A game code travels in the address (`?code=`), so no address is ever sent on. |
| `Permissions-Policy` | everything off but `autoplay` and `clipboard-write` for this site | The sound effects, and Copy in Play by message. Share… uses `web-share`, which is left at its default (this site only). |
| `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy` | `same-origin` | No other window keeps a handle on this one, and no other site embeds its files. |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Browsers remember to use HTTPS. |
| `Cache-Control` | a year, `immutable`, for `_expo/static/` and `assets/`; `no-cache` for everything else | The game and the sounds carry a hash of their contents in their names; every other file keeps its name from one deploy to the next, so it is revalidated on every load. Apache keeps the year to a file that exists, and nginx sends the not-found page's own `no-cache` with it. |

**GitHub Pages sends none of these headers.** Build for it with
`--host github-pages`, which leaves the other hosts' configurations out and
keeps `.nojekyll`. The built `index.html` and
`404.html` carry the policy (less `frame-ancestors`, which a `<meta>` cannot
set) and the referrer policy as `<meta>` tags, so script, style and network
are held there too; `build-web.mjs` writes the page's from `public/_headers`.
(The template in `public/` does not carry it, because `npm run web` serves
the template too and its development server needs a WebSocket and HTML
written from strings, both of which the policy refuses.) The clickjacking
protection, HSTS, `nosniff`, the permissions, the cross-origin isolation and
the cache rules need a host that sets headers: Netlify, Cloudflare Pages,
Apache or nginx.

**GitHub Pages, from this repository.** `.github/workflows/pages.yml` builds
the site for GitHub Pages under `/<repository>` (`--host github-pages`) after
`npm ci`, the type check and the unit tests, and publishes it on a push to
`main` or when run by hand from the Actions tab. This repository has no `main`
branch yet, and the run-by-hand button only appears once the file is on the
default branch, so until one of those is true nothing deploys. The repository's
Pages source has to be set to GitHub Actions once (Settings, Pages), and the
`github-pages` environment has to accept the branch that deploys. Only the
deploy job holds `pages: write` and `id-token: write`; the job that installs
and builds holds a read-only token and does not keep it in `.git/config`.

**One origin per app.** A GitHub Pages project site lives at
`platteration.github.io/multidconnect4/` and shares that origin with every
other app the account publishes there. Browser storage is kept per origin,
and the web build keeps the game in progress, the settings, the record and
the puzzle progress in `localStorage`, so script running on any of those
other apps could read or rewrite them (`src/app/validate.ts` bounds what a
planted record can do; it cannot make one private). Give the site a domain
or subdomain of its own, which gives it an origin of its own; the storage
keys stay prefixed `multidconnect4.` either way. `robots.txt` and
`/.well-known/security.txt` also only count at the root of an origin.

**Not-found page and safety net.** `404.html` answers any address that is
not part of the site, in the game's colours and with no script; Netlify,
Cloudflare Pages and GitHub Pages pick it up by themselves, and the Apache
and nginx configurations wire it in (and turn folder listings off).
`build-web.mjs --base` moves its addresses under the sub-path. `guard.js`
loads before the game: if the game's script fails to load, or throws before
it has drawn anything, the page says so instead of staying blank, and a
visitor with JavaScript off reads why the page is empty. Only the site's own
scripts count: an error from a browser extension, or from any other script
in the page, does not, and a note shown before the game draws (a rejected
promise names no script, so one can still show it) is taken back when it does.

**Launch checklist**, with `SITE` the site's https address:

```sh
curl -sI http://SITE/ | head -1                      # a 301 to https
curl -sI https://SITE/ | grep -i -E 'content-security|frame-options|strict-transport|nosniff|referrer|permissions|cross-origin|cache-control'
curl -sI https://SITE/.git/HEAD | head -1             # 404
curl -sI https://SITE/README.md | head -1             # 404
curl -s  https://SITE/_expo/ | grep -c 'isn’t here'   # 1: the not-found page, not a listing
curl -sI https://SITE/no-such-page | head -1          # 404
```

Then play a game, open every sheet, share a code and load it from its link,
and check that the browser console shows no `Content Security Policy`
lines. The `Expires` date in `security.txt` is 8 October 2027 and needs
renewing before then (`website.test.ts` fails once it has passed). Its
`Policy` link names `blob/main/`, not `blob/HEAD/`: the repository's default
branch is not `main` and holds no `SECURITY.md`. On GitHub Pages, Jekyll
skips dot-folders unless the site holds `.nojekyll`, and the Pages upload
action leaves out every path that starts with a dot unless it is told
otherwise (`pages.yml` passes it `include-hidden-files: true`), so check
after a deploy that `/.well-known/security.txt` is served.

### Sign-in and the shop

The website can sign visitors in with Google and sell them the Supporter pack
through Stripe Checkout. It is built and tested, and **off until the owner
gives it keys**: with none set, and on any host that runs no code (GitHub
Pages, Netlify, Apache or nginx without the API below), the site looks and
plays exactly as it does without it. The phone apps never have it.

- **The backend** is `server/kit/`, a small API shared byte for byte by the
  owner's apps (never edited here; `server/kit/README.md` is its setup guide
  and the owner's checklist), with this app's catalogue,
  `server/catalogue.js`: one product, `supporter` (one-time, granting the
  entitlement `supporter`), whose Stripe Price id is `STRIPE_PRICE_SUPPORTER`.
  It answers under the site's own `api/`, so the session is a first-party
  cookie and the page's policy only gains `connect-src 'self'`. A purchase is
  granted by Stripe's signed webhook and nothing else.
- **The page**, on load, asks `api/config` once. A 404 (or anything that is
  not the API's answer) means the feature does not exist: nothing is drawn,
  stored or asked again. On a host without the API that one request is the
  only change, and Chromium notes its 404 in the console. Configured,
  Settings gets an Account section ("Sign in with Google"; signed in, "Signed
  in as …", Sign out, and Delete account, which asks first and says the
  purchase goes with the account), Extras sells the pack at its price ("Buy",
  "Sign in to buy" when signed out, "Owned"), and the screen says when a
  sign-in did not complete or a purchase has been unlocked. A line about a
  payment is said only to a visitor `api/me` reports signed in, and every
  line goes when they sign out or delete the account. Back from Checkout
  before Stripe's webhook has reached the site, Extras says "Payment received
  — processing" where Buy was until `api/me` reports the pack, and across a
  reload within ten minutes through one sessionStorage record of the tab's
  own (`multidconnect4.purchasePending.v1`). The API itself gives a second
  Buy before the webhook the Checkout it gave the first while that is still
  open, and once it is paid refuses it (409 `payment_pending`, which the page
  reads the same way), so another tab, or a reload after ten minutes, still
  shows Buy until the webhook arrives, and pressing it there says the payment
  is on its way rather than starting a second one. Two devices signed in at
  once can still each start one (`server/kit/README.md`, "Limits worth
  knowing"). The About card's
  sentence about what leaves the device says what does then. The code is
  `src/app/accountClient.web.ts` (the one module of the app that makes a
  request, bundled into the web build alone), `accountModel.ts`,
  `account.tsx`, and the native twin `accountClient.ts`, which answers "not
  configured" and opens nothing.
- **Cloudflare Pages** (the reference host): the build command is
  `node scripts/build-web.mjs --host cloudflare`, its output `dist-web`, and
  the project root this repository, where Pages finds
  `functions/api/[[path]].js`, the API's entry. The build writes
  `_routes.json`, so only `/api/*` runs the function. Bind a KV namespace as
  `KIT_STORE` and set the variables below, encrypted. Cloudflare applies
  neither `_headers` nor `_redirects` to a function's answer (its
  documentation, `pages/configuration/headers.mdx` and `redirects.mdx`), so
  the API sends its own headers, and the site's 404 rule cannot swallow
  `api/`; Wrangler uploads none of `_headers`, `_redirects` and
  `_routes.json` as a file. Serve the site at the root of its own domain,
  where Pages serves a project and where the entry answers `/api/*`: a
  `--host cloudflare` build with `--base` is refused, since its API could
  never run.
- **Self-hosted**: `KIT_DATA_DIR=/var/lib/multidconnect4-api node server/start.mjs`
  under a service manager, as its own user, one process per data directory
  (outside the web root). It listens on 127.0.0.1:8788, and
  `deploy/nginx.conf`'s `location ^~ /api/` sends it the site's `api/`;
  stopped, that location answers 502 (504 when it does not answer in time)
  with the site's not-found page and every header the site sends, and the
  page draws nothing; `/api` itself is the not-found page too
  (`location = /api`), where nginx would answer its own 301. A site that
  runs no API can delete both locations. Apache's `.htaccess` cannot proxy:
  in the virtual host, with `mod_proxy` and `mod_proxy_http`,

  ```apache
  ProxyPass "/api/" "http://127.0.0.1:8788/api/"
  ErrorDocument 502 /404.html
  ErrorDocument 503 /404.html
  ErrorDocument 504 /404.html
  ```

  Without the `ErrorDocument` lines an API that is not running is Apache's
  own 503 page with none of the site's headers; with them it is the site's
  not-found page, status kept (measured on nginx 1.24 and Apache 2.4.58).
  The API's own answers pass through either way.
- **The variables**, environment only, never in the repository:
  `APP_URL` (the site's address with its trailing slash), `SESSION_SECRET`,
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET` and `STRIPE_PRICE_SUPPORTER`. Sign-in needs the
  first four; the shop needs all seven.
- **What leaves the device**, then: nothing unless the visitor signs in or
  buys. Signing in, Google tells the site an account id and the email
  address; a purchase is paid to Stripe, which handles the payment and is
  told the account id with it (as the Checkout session's reference and in
  the payment's metadata), but not the email address. The site keeps the
  account id, what was bought and Stripe's customer id, and the email
  address only while the visitor stays signed in; and, for 30 days, the
  Checkout Session it last gave the account for the pack, which is how a
  second Buy is given the same one. Delete account removes all of it but the
  payment, which stays with Stripe under that account id,
  and a count of the hour's Buy presses, which names the account id and goes
  within two hours.
- **One origin per app.** Every page on the site's origin can act as the
  signed-in visitor through `api/` (the kit's README, "Hosting"), so the API
  belongs on an origin of the game's own, never on a shared one such as a
  GitHub Pages project site, which runs no API anyway.

`npm test` runs the kit's own self-test and `server/api.test.mjs` (this
catalogue through both entries, the Node one over a real socket with a fake
Google and a fake Stripe handed to the kit as its `fetch`); the browser suite
plays the whole flow in Chromium under the site's policy.

## Development

```sh
npm test                  # the API's tests (node --test: server/kit's self-test, server/api.test.mjs), then
                          # the unit tests (jest-expo): the engine, the app, the website's hosting files
npm run lint              # eslint .
npm run typecheck         # tsc --noEmit
npm run test:conventions  # the shared repository conventions (CONVENTIONS.md)
npm run check             # all of the above: the gate before a push
npm run test:e2e          # the website: built for /multidconnect4/ and played in Chromium
npm run test:all          # npm test, then the browser suite
```

`e2e/ui-regression.py` is a separate check against the development server
(`npm run web`), where React Native raises the layout assertions a production
build leaves out: a drop on a desktop-wide window, a reload that keeps it, a
phone, landscape and desktop resize, and an undo, failing on any page error.
It needs Python's Playwright (`pip install playwright`) and a Chromium, named by
`PW_CHROMIUM` (it defaults to `/usr/bin/chromium`); CI does not run it:
`python e2e/ui-regression.py http://localhost:8081`.

`npm run test:e2e` builds the site and serves it under `/multidconnect4/`
with exactly the headers `public/_headers` writes and the 404s
`public/_redirects` writes (`e2e/serve.mjs`), then plays the game in Chromium
(`e2e/run.mjs`): the welcome, a drop for each side, a time travel, an undo, a
spin, the sounds, Play by message and the link it makes, the settings, a
reload, a game against the bot, the not-found page, the repository's own
files, the site built for GitHub Pages and served as Pages serves it (no
headers, no `_redirects`), and the safety net, including errors from scripts
that are not the site's. Then it serves the same site with the sign-in and
shop API beside it, as Cloudflare Pages runs it, and plays the whole flow:
sign in with Google, buy, Stripe's signed webhook, the pack drawn as owned,
sign out, delete the account, and a sign-in Google refuses. Google's consent
page and Stripe's Checkout are answered in the browser (`page.route`), and
Google and Stripe themselves are the fakes the kit is handed. It fails on any
policy violation, page error, console error (but the 404 for `api/config`
where no API runs) or request outside the sub-path. Playwright is a
devDependency; its Chromium comes from `npx playwright install chromium`.

`.github/workflows/ci.yml` runs the lint, the typecheck, the tests, the
conventions test, an Android and web export and the browser suite on every
push; a separate job runs `node .github/audit/npm-audit.mjs` against the
lockfile: the shared audit gate (CONVENTIONS.md, "CI"), which runs
`npm audit --omit=dev` and fails on every high or critical advisory, less what
`.github/audit/accepted.json` accepts. That list accepts two today, braces and
node-forge, which reach the production tree only through Metro's, Expo's and
Jest's file maps and `@expo/cli`'s code signing, none of it in the app or the
website, and have no patched release to take. Each acceptance names a route
from every direct dependency that reaches the package and expires within 90
days, so it is read again at least once a quarter, and sooner when a fixed
release appears in the major an installed copy is on, or the lockfile brings
the package in through a direct dependency the list has no route from. Every
job runs on `ubuntu-24.04`.

## Project layout

```
App.tsx                    entry: safe area + status bar + GameScreen
src/engine/types.ts        players, board references, turn parity
src/engine/board.ts        one Connect Four board: gravity, removal, spinning, lines
src/engine/multiverse.ts   timelines, pending boards, time travel, rules, win/draw
src/engine/bot.ts          the three-level computer opponent
src/engine/__tests__/      unit tests for the rules, bots, puzzles, game codes
                           and the links a code arrives on
src/puzzles/index.ts       the puzzle set (each verified by a test)
src/app/settings.tsx       persisted settings (theme, motion, skin, sound, variants)
src/motion.ts              the reduce-motion hook (device preference or override)
src/app/theme.tsx          resolves settings into the palette screens draw with
src/app/persist.ts         every storage key, the key migration, AsyncStorage helpers
src/app/validate.ts        what a stored record may contain; every read goes through it
src/app/share.ts           game codes for play by message (app/base64.ts)
src/app/savedGame.ts       the game in storage: actions out, a replay back in
src/app/links.ts           deep links carrying a game code, clearing one, and
                           the launch link, answered once per launch (App
                           holds the answer, above the error boundary)
src/app/__tests__/         the app config, the settings contract, the validator,
                           the game read back out of storage and the website's
                           account client
src/app/purchases.ts       the store seam on a phone; app/entitlements.tsx gates premium looks
src/app/account*.ts(x)     the website's sign-in and shop: accountClient.web.ts (the
                           requests to api/, web build only), accountClient.ts (its
                           inert native twin), accountModel.ts (what the page reads
                           and says), account.tsx (the state the screens draw)
src/app/feedback.ts        haptics and sounds (app/sound.ts)
src/ui/useGame.ts          game controller hook: history/undo, selection, bot turns
src/ui/guards.ts           the screen's pure guards: the bot's turn, the travel
                           origin, link confirmation, cell labels
src/ui/GameScreen.tsx      screen layout, status text, bot loop, replay
src/ui/DiscBoard.tsx       the big tappable board with the falling-disc animation
src/ui/MiniBoard.tsx       board thumbnails for the map
src/ui/MultiverseMap.tsx   the timeline map (rows = timelines, columns = turns)
src/ui/*Modal.tsx          menu, rules, settings, new game, puzzles, share, extras
src/ui/AccountNotice.tsx   the website's line about a sign-in or a purchase
src/ui/ErrorBoundary.tsx   the fallback for a render that throws; its button
                           clears the saved game
src/ui/__tests__/          the map's windowing, the board, the share sheet, the
                           error boundary, the launch link, the guards, the
                           palette's contrast and the account and shop screens
public/                    the website around the game, which the web export
                           copies beside it: the page template (index.html),
                           the safety net (guard.js), site.css, 404.html,
                           robots.txt, .well-known/security.txt, and _headers,
                           _redirects and .htaccess for the hosts
deploy/nginx.conf          the same headers and rules for nginx, and the API's proxy
server/kit/                the sign-in, shop and webhook API, shared byte for byte
                           (its README is the setup guide); never edited here
server/catalogue.js        what this site sells: the Supporter pack
server/start.mjs           the API on a host of its own (127.0.0.1:8788)
server/api.test.mjs        the catalogue and both entries, against server/fakes.mjs
functions/api/[[path]].js  the API's entry on Cloudflare Pages
app.config.js              the web build's sub-path, when WEB_BASE_URL asks for one
scripts/build-web.mjs      builds the site into dist-web/ (npm run build:web),
                           for one host with --host
src/app/__tests__/website.test.ts
                           the headers, the policy and the refused paths, read
                           out of every file that writes them
e2e/serve.mjs, e2e/run.mjs the browser suite's host (Netlify's reading of
                           _headers and _redirects, or GitHub Pages', which
                           reads neither, under a sub-path, with the API beside
                           it when asked) and the game played under it
e2e/ui-regression.py       the development-server check above (Python)
.github/workflows/         ci.yml (the gate and the audit) and pages.yml (the
                           GitHub Pages deploy)
.github/audit/             the shared audit gate the audit job runs, and the
                           advisories it accepts (accepted.json)
assets/artwork/icon.blend  the icons' Blender scene; scripts/render-icons.py
                           renders assets/ from it
docs/                      the release checklist and the store listing draft
```

The engine is pure TypeScript with no React dependency, so the rules can be
tested (and reused, e.g. for an AI opponent or online play) without the UI.

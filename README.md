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
  and the app's own scheme on a device.
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

Until a billing library is wired in, `STORE_ENABLED` in
`src/app/purchases.ts` is false and every extra is unlocked for everyone. To
go live: implement `purchase` and `restore` in that file against your store
SDK, persist the result, and set the flag to true. The Settings sheet and the
Extras sheet already respect the entitlement.

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
for EAS Build. The icons in `assets/` are placeholders (nothing in the
repository generates them), so replace them with real artwork before a store
release.

### Deploy

The web build is also a website: a static one. The game runs entirely in the
visitor's browser, as it does on a phone; the host only serves files, and the
headers and rules that protect them, which this repository writes for it.

```sh
npm run build:web                                    # the site, in dist-web/, for a domain of its own
node scripts/build-web.mjs --base /multidconnect4    # the same site, served under /multidconnect4/
```

**Publish that folder, and only it.** `dist-web/` holds `index.html`,
`404.html`, `guard.js`, `site.css`, `favicon.ico`, `robots.txt`,
`.well-known/security.txt`, `_expo/` (the game) and `assets/` (the sounds),
plus the hosts' configurations, which `npx expo export` copies from
`public/`: `_headers` and `_redirects` for Netlify and Cloudflare Pages,
`.htaccess` for Apache. Each host reads its own and serves none of them. For
nginx, copy `deploy/nginx.conf` into the server's configuration and set
`server_name`, `root` and the certificate paths. Never point a host at the
checkout: `.git/` holds the whole history. Should that happen anyway, the
Apache and nginx rules answer 404 for every dotfile but `/.well-known/`, and
for `README.md`, `deploy/`, `_headers`, `_redirects` and `metadata.json`;
`_redirects` does the same on Netlify for the files it could see. (`npm run
build:web` leaves `metadata.json`, the exporter's manifest for EAS Update,
out of the site; a plain `npx expo export` does not.)

**Response headers.** The same set is in `public/_headers`,
`public/.htaccess` and `deploy/nginx.conf`, and
`src/app/__tests__/website.test.ts` fails when they disagree:

| Header | Value | Why |
| --- | --- | --- |
| `Content-Security-Policy` | `default-src 'none'; script-src 'self'; style-src 'self' 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='; img-src 'self'; media-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'; upgrade-insecure-requests; require-trusted-types-for 'script'; trusted-types 'none'` | Only the site's own script, stylesheet, favicon and sounds load, measured by playing the game in Chromium under it. The one hash is the empty string's: react-native-web creates an empty `<style>` element and fills it through the CSSOM, which the policy does not govern, so no `'unsafe-inline'` is needed. `connect-src 'none'` makes any network request fail loudly. Trusted Types are enforced with no policy, because nothing in the game writes HTML from a string. |
| `X-Frame-Options` | `DENY` | With `frame-ancestors 'none'`: no other site can frame the game (clickjacking). |
| `X-Content-Type-Options` | `nosniff` | Files are what their type says. |
| `Referrer-Policy` | `no-referrer` | A game code travels in the address (`?code=`), so no address is ever sent on. |
| `Permissions-Policy` | everything off but `autoplay` and `clipboard-write` for this site | The sound effects, and Copy in Play by message. Share… uses `web-share`, which is left at its default (this site only). |
| `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy` | `same-origin` | No other window keeps a handle on this one, and no other site embeds its files. |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Browsers remember to use HTTPS. |
| `Cache-Control` | a year, `immutable`, for `_expo/static/` and `assets/`; `no-cache` for everything else | The game and the sounds carry a hash of their contents in their names; every other file keeps its name from one deploy to the next, so it is revalidated on every load. |

**GitHub Pages sends none of these headers.** The built `index.html` and
`404.html` carry the policy (less `frame-ancestors`, which a `<meta>` cannot
set) and the referrer policy as `<meta>` tags, so script, style and network
are held there too; `build-web.mjs` writes the page's from `public/_headers`.
(The template in `public/` does not carry it, because `npm run web` serves
the template too and its development server needs a WebSocket and HTML
written from strings, both of which the policy refuses.) The clickjacking
protection, HSTS, `nosniff`, the permissions, the cross-origin isolation and
the cache rules need a host that sets headers: Netlify, Cloudflare Pages,
Apache or nginx.

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
visitor with JavaScript off reads why the page is empty.

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
renewing before then (`website.test.ts` fails once it has passed). On GitHub
Pages, Jekyll skips dot-folders and the Pages upload action can leave hidden
files out, so check after a deploy that `/.well-known/security.txt` is
served.

## Development

```sh
npm test                  # unit tests (jest-expo): the engine, the app, the website's hosting files
npm run lint              # eslint .
npm run typecheck         # tsc --noEmit
npm run test:conventions  # the shared repository conventions (CONVENTIONS.md)
npm run check             # all of the above: the gate before a push
npm run test:e2e          # the website: built for /multidconnect4/ and played in Chromium
npm run test:all          # npm test, then the browser suite
```

`npm run test:e2e` builds the site and serves it under `/multidconnect4/`
with exactly the headers `public/_headers` writes and the 404s
`public/_redirects` writes (`e2e/serve.mjs`), then plays the game in Chromium
(`e2e/run.mjs`): the welcome, a drop for each side, a time travel, an undo, a
spin, the sounds, Play by message and the link it makes, the settings, a
reload, a game against the bot, the not-found page, the repository's own
files, and the safety net. It fails on any policy violation, page error,
console error or request outside the sub-path. Playwright is a
devDependency; its Chromium comes from `npx playwright install chromium`.

`.github/workflows/ci.yml` runs the lint, the typecheck, the tests, the
conventions test, an Android and web export and the browser suite on every
push; a separate job runs `npm audit --omit=dev --audit-level=high` against
the lockfile.

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
src/app/links.ts           deep links carrying a game code, and clearing one
src/app/__tests__/         the app config, the settings contract, the validator
                           and the game read back out of storage
src/app/purchases.ts       the store seam; app/entitlements.tsx gates premium looks
src/app/feedback.ts        haptics and sounds (app/sound.ts)
src/ui/useGame.ts          game controller hook: history/undo, selection, bot turns
src/ui/guards.ts           the screen's pure guards: the bot's turn, the travel
                           origin, link confirmation, cell labels
src/ui/GameScreen.tsx      screen layout, status text, bot loop, replay
src/ui/DiscBoard.tsx       the big tappable board with the falling-disc animation
src/ui/MiniBoard.tsx       board thumbnails for the map
src/ui/MultiverseMap.tsx   the timeline map (rows = timelines, columns = turns)
src/ui/*Modal.tsx          menu, rules, settings, new game, puzzles, share, extras
src/ui/ErrorBoundary.tsx   the fallback for a render that throws; its button
                           clears the saved game
src/ui/__tests__/          the map's windowing, the board, the share sheet, the
                           error boundary and the guards
public/                    the website around the game, which the web export
                           copies beside it: the page template (index.html),
                           the safety net (guard.js), site.css, 404.html,
                           robots.txt, .well-known/security.txt, and _headers,
                           _redirects and .htaccess for the hosts
deploy/nginx.conf          the same headers and rules for nginx
app.config.js              the web build's sub-path, when WEB_BASE_URL asks for one
scripts/build-web.mjs      builds the site into dist-web/ (npm run build:web)
src/app/__tests__/website.test.ts
                           the headers, the policy and the refused paths, read
                           out of every file that writes them
e2e/serve.mjs, e2e/run.mjs the browser suite's host (Netlify's reading of
                           _headers and _redirects, under a sub-path) and the
                           game played under it
```

The engine is pure TypeScript with no React dependency, so the rules can be
tested (and reused, e.g. for an AI opponent or online play) without the UI.

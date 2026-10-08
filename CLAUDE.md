# multidconnect4

Read AGENTS.md first. It holds the working rules every coding agent follows in this repository; this file adds the notes specific to this project.

Expo (React Native + TypeScript) app: a 5D-chess-style multiverse time travel
parody built on Connect Four. See README.md for the rules and layout.

- Engine lives in `src/engine` and must stay free of React/React Native imports.
- Boards are immutable; every rule function returns a new value.
- `npm test` runs the jest-expo unit tests, `npm run typecheck` runs tsc.
- Exact versioned Expo docs: https://docs.expo.dev/versions/v57.0.0/

## Native configuration

The native config posture is pinned by `src/app/__tests__/appConfig.test.ts`, which runs
`npx expo config --type introspect` and asserts the merged result rather than app.json
alone: app.json states every key that test pins, even at its default (`allowBackup`,
`predictiveBackGestureEnabled`, `supportsTablet`, `web.bundler`), so the file and the
test say the same thing. The splash screen is configured only through the
`expo-splash-screen` plugin entry — SDK 57 ignores a top-level `splash` block — and
`userInterfaceStyle` only works on Android because `expo-system-ui` is installed (its
plugin writes the string resource, its activity listener reads it). The app has no
network code (deep links in via `Linking`, game codes out via `Share.share`/clipboard),
so `android.blockedPermissions` removes INTERNET, the storage/media reads and the
template's `SYSTEM_ALERT_WINDOW` from the shipped manifest, and
`plugins/withDebugInternet.js` (drawdraw's plugin, verbatim but for the one sentence that
described that app) adds INTERNET back to the debug source set alone so a
development build can still load its bundle; the test scans every AndroidManifest.xml
under node_modules so a module that brings a new permission fails it. `allowBackup` is
true on purpose: the store is the five records `KEYS` names (the game in progress, the
settings, the record sheet, the puzzle progress and the entitlements), all of them the
player's own and none of them worth hiding from a backup — the entitlements record is the
one to revisit if `STORE_ENABLED` is ever turned on. tsconfig lists `node`
in `types` for that test's sake (`@types/node` is a devDependency at the pinned Node
major). Install expo packages with `npm install <pkg>@<pin from
node_modules/expo/bundledNativeModules.json>`; `npx expo install` needs Expo's API.

## Settings

Every stored record has one key, named in `KEYS` in `src/app/persist.ts`:
`multidconnect4.{settings,game,stats,progress,entitlements}.v1`. The bare keys earlier
builds wrote (`settings.v1` and the rest) migrate on first launch — new key wins when
both are present, bytes are copied verbatim, the old key is deleted only after the write
succeeded and never on the web, where AsyncStorage is localStorage keyed by an origin
the sibling game shares — and `loadJson` awaits the migration, so no provider can read
ahead of it. Every read goes through `src/app/validate.ts` (`cleanSettings`,
`cleanVariants`, `cleanStats`, `cleanProgress`, `cleanEntitlements`): tables typed
`Record<Union, true>`, own-property lookups only, a per-field fallback from the defaults
passed in, and no React Native import so a plain test can load it. The settings record
holds `haptics`, `sound`, `patterns`, `theme` (`system|dark|light`; a null platform scheme
resolves to dark), `reduceMotion` (`system|on|off`, resolved by `useReduceMotion` in
`src/motion.ts`: a rejected native query or a web page without `matchMedia` means no
preference), `skin`, `pieces`, `variants` (one boolean per rule the engine knows) and
`welcomed`, the onboarding flag. Reset to defaults is confirmed through `ConfirmModal`,
rewrites the settings record alone and keeps `welcomed`. The About card's version is
`Constants.expoConfig.version` from `expo-constants`, which is app.json's, and its source
link is the one URL in the tree: `Linking` hands it to the browser, so INTERNET stays
blocked, and `appConfig.test.ts` pins that URL by file and value so the no-network scan
stays a guard. The keys, the row list and every enum table are pinned as literals in
`src/app/__tests__/settings-contract.test.ts`; `validate.test.ts` walks
`Object.getOwnPropertyNames(Object.prototype)` through every table via `JSON.parse` and
must fail if `has` is ever changed to `in`.

## Website

The web build is also a website, built by `scripts/build-web.mjs` (`npm run build:web`) into
`dist-web/`, which is the whole site and the only thing to publish. The game does not move to a
server: the host serves files and the headers around them. Everything around the bundle lives in
`public/`, which `npx expo export` copies to the site root on SDK 57, `.well-known/` included
(checked on a real export): `index.html` is the page template the exporter reads in place of its
own (the referrer `<meta>`, the `<noscript>` note, the `#boot-failed` note and `guard.js` before
the bundle; not the policy, because `expo start --web` serves the template too and the
development server needs a WebSocket and `innerHTML`, so `build-web.mjs` writes the policy
`<meta>` into the built page from `_headers`), `guard.js` the safety net, `site.css` the reset Expo's template
carried inline plus the notes and the not-found page, `404.html`, `robots.txt`,
`.well-known/security.txt` (renewed yearly: the test fails once `Expires` has passed), and the
hosts' `_headers`, `_redirects` and `.htaccess`; nginx's copy is `deploy/nginx.conf`. The headers
are written in all three and the policy in both built pages' `<meta>` too (less `frame-ancestors`),
and `src/app/__tests__/website.test.ts` reads every copy and requires them equal, path by path,
including the cache rules and the files of the built folder each host refuses; change one and
change them all. `_redirects` and `.htaccess` are read only from the folder they are published
in, so they name only paths that folder can hold (the test fails on a rule that could never
fire); only nginx's rules, the server's own, still hold if a checkout is ever served, and the
README says what they do not cover. Apache's `Header` lines are read whole, conditions
included, and its year-long cache applies only to a file that exists (`-f`). The
policy was measured by playing the game in Chromium under it, not copied: `style-src` carries
the hash of the empty string and no `'unsafe-inline'`, because react-native-web creates an empty
`<style>` and fills it through `insertRule`; `img-src 'self'` is the favicon (only the full
Chromium fetches it, which is why the suite launches `channel: 'chromium'`), `media-src 'self'`
the sounds, `connect-src 'none'` the absence of network code, and Trusted Types are enforced.
`npm run test:e2e` builds the site for `/multidconnect4/` (`app.config.js` reads `WEB_BASE_URL`
into `experiments.baseUrl`; `build-web.mjs` also prefixes `404.html` and `.htaccess`) and
`e2e/run.mjs` plays it under `e2e/serve.mjs`, which answers as Netlify reads `_headers` and
`_redirects` (or, for the GitHub Pages scenario, as Pages does, reading neither); it fails on any
violation, page or console error, or request outside the sub-path. `guard.js` counts only the
failures of the site's own scripts (a `.js` file below the folder it was loaded from) and takes
its note back once the game draws, since a rejected promise names no script; the suite throws,
rejects and fails a script load from elsewhere before the first draw to hold it to that.
`build-web.mjs` refuses an `--out` inside the checkout other than `dist-web`, `dist` or
`web-build`, and one that holds the checkout, because the exporter empties its output folder
first; its tests run it against a stand-in exporter in a temporary folder for that reason.
`--host` (`github-pages`, `netlify`, `cloudflare`, `apache`, `nginx`, the names chesscheatser's
build uses) keeps only the configuration that host reads, because a host serves any other as a
plain file; a build for GitHub Pages, or for no host, also gets an empty `.nojekyll`, because
Pages runs a branch deploy through Jekyll, which drops `_expo/`. The launch link is answered once
per mount of `App` (`launchLink()` in `src/app/links.ts`, held above the error boundary), not once
per JavaScript runtime, which on Android outlives an Activity started again from another link. On
the web the Vibration row is shown off, disabled and says why (`WEB_VIBRATION_HINT`), since
`feedback.ts` never vibrates there. In a window wider than it is tall the left column is a
`ScrollView`, whose own style must not lay out children (`justifyContent`, `alignItems`): both
React Native and react-native-web throw on it in development.

## Conventions

This repository follows `CONVENTIONS.md`, which is identical in every platteration
repository and pinned by the conventions test (`npm run test:conventions`, or
`tests/test_conventions.py` in a Python repository): the script set (`test`,
`typecheck`, `lint`, `check`, `test:e2e`, `test:all`), Node 22 via `.nvmrc`, one
`.editorconfig`, ESLint per stack, the `ci.yml` shape, the documents every repository
carries and the README skeleton. The repository's check command (`npm run check`, or
`ruff check .` then `pytest -q` in a Python repository) is the gate before a push. To
change a convention, change it in every repository in one pass and update the hashes in
the test.

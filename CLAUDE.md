# multidconnect4

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

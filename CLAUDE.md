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
`plugins/withDebugInternet.js` adds INTERNET back to the debug source set alone so a
development build can still load its bundle; the test scans every AndroidManifest.xml
under node_modules so a module that brings a new permission fails it. `allowBackup` is
true on purpose: the store is one in-progress game plus settings. tsconfig lists `node`
in `types` for that test's sake (`@types/node` is a devDependency at the pinned Node
major). Install expo packages with `npm install <pkg>@<pin from
node_modules/expo/bundledNativeModules.json>`; `npx expo install` needs Expo's API.

## Conventions

This repository follows `CONVENTIONS.md`, which is identical in every platteration
repository and pinned by the conventions test (`npm run test:conventions`, or
`tests/test_conventions.py` in a Python repository): the script set (`test`,
`typecheck`, `lint`, `check`, `test:e2e`, `test:all`), Node 22 via `.nvmrc`, one
`.editorconfig`, ESLint per stack, the `ci.yml` shape, the documents every repository
carries and the README skeleton. `npm run check` is the gate before a push. To change a
convention, change it in every repository in one pass and update the hashes in the test.

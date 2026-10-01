# multidconnect4 — security audit (2026-09-11)

A dedicated security pass, separate from and later than the review in `REVIEW.md`. Specialist reviewers read the repository through a combined lens (L13), each required to *demonstrate* a finding rather than argue for it.

**1 finding** — 1 medium. Every one was reproduced with command output rather than argued from reading.

## Status

Every finding below was fixed on `claude/repo-review-security-baiyud` in 881d453, each with a regression test that was checked by reverting the fix and confirming the test fails. The findings are kept as written so the reasoning behind each change stays with it.

## Findings

### L13-1 · medium — The share-code caps bound the replay but not the multiverse it builds: a code inside both caps makes the map render ~87,000 views, and the game is then autosaved and re-rendered on every launch

`src/ui/MultiverseMap.tsx`:121 · CWE-400 · reproduced

**Who.** Anyone who can hand the app a game code: a play-by-message opponent who sends a code over chat, or any other app / QR code / web page on the device, which can fire the app's own scheme `multidconnect4://?code=<code>` (app.json:6 registers it with no host and no path), or any page that links to `https://<host>/?code=<code>` on the web build. They control the entire payload.

**How.** 1. Build a legal action list with the real engine that maximises the number of boards the multiverse ends up holding: on every pending timeline prefer a `travel` (which pushes the collapsed origin board AND creates a whole new timeline) and fall back to a `drop`. Every action is individually legal, so nothing in `applyAction` refuses it. 2. Truncate the list so the base64 code fits `MAX_CODE_LENGTH` (96 KiB) and the action count fits `MAX_ACTIONS` (1500). I land on 1,080 actions / 98,285 characters - inside both caps. 3. Deliver it as `multidconnect4://?code=<urlencoded>` (98,308 chars, accepted by `codeFromUrl`) or paste it into ShareModal. `decodeGame` accepts it. 4. If the recipient has not moved yet (`linkNeedsConfirming(1) === false`) it loads with no prompt at all; otherwise one 'Load the shared game' tap does it. 5. `game.load` puts the final state on screen. `GameScreen` renders `<MultiverseMap state={state} .../>` unconditionally, and MultiverseMap walks `state.timelines.map(...)` then `tl.boards.map(...)` inside a plain ScrollView - no windowing, no cap - so every one of the 1,657 boards becomes a MiniBoard of rows x cols cell Views. 6. ~250 ms later the autosave writes the 1,080-action list (73,788 bytes, well inside what AsyncStorage takes), and `restoreSavedGame` replays and re-renders it on every subsequent launch.

**Why it matters.** A one-tap, remotely delivered denial of service on the app. Measured in react-test-renderer the map goes from 1,625 host elements for a normal 30-ply game to 87,465 for the hostile code - 54x - with 375 MB of heap for that one component on desktop V8. On a phone each host element becomes a native view plus a shadow node under Hermes; 87k of them is an ANR or an OOM kill, not jank. Because the loaded game is persisted and restored, the app comes back to the same render on every cold start, so the victim loses their own saved game and has no in-app way out (the ErrorBoundary only catches a thrown render, not a hang or an OOM). No data is exposed and nothing is compromised - this is availability only, which is why I rate it medium rather than high for a local phone game.

**Evidence.**

src/app/share.ts:18-20 - the caps, and what they were sized against:
```
export const MAX_ACTIONS = 1500;
export const MAX_CODE_LENGTH = 96 * 1024;
```
src/app/share.ts:94 `if (payload.a.length > MAX_ACTIONS) throw new Error('That code is too long to be a real game.');` - the only quantity bounded is the length of the action list. Nothing bounds `history[last].timelines.length` or the total number of boards, and `grep -rn "MAX_" src/` confirms there is no other cap anywhere in the app.

src/ui/MultiverseMap.tsx:121-178 - the sink, with no virtualisation:
```
{state.timelines.map((tl) => {
  ...
  {tl.boards.map((board, i) => {
    ...
    <MiniBoard board={board} ... />
```
src/ui/MiniBoard.tsx:38-55 - each thumbnail builds `board.rows` row Views and `board.rows * board.cols` cell Views (42 per board).
src/ui/GameScreen.tsx:485 `<MultiverseMap state={state} focus={focus} targets={targets} origin={origin} onPressBoard={game.focusBoard} />` - rendered unconditionally, inside a View with `overflow: 'hidden'` (a clip, not windowing).

Measured, end to end, through the real modules compiled from the repo:
```
deep link length 98308
codeFromUrl accepted: true
decodeGame ms 180 states 1081 setup {"mode":"local"}
timelines 577 boards 1657 status playing
autosave bytes 73788 actions 1080 cap 1500
restoreSavedGame ms 181 restored? true states 1081
```
and the render, via jest-expo + react-test-renderer against the real MultiverseMap:
```
WARMUP        {"boards":31,"renderMs":517,"heapMB":24.5,"hostElements":1625}
NORMAL-30-ply {"boards":31,"renderMs":275,"heapMB":13.5,"hostElements":1625}
decodeMs 621 states 1081
HOSTILE-CODE  {"boards":1657,"renderMs":3963,"heapMB":374.7,"hostElements":87465}
```
The arithmetic ceiling is a little higher than what I built: boards = 1 + actions + travels, a drop costs ~37 JSON bytes and a travel ~91, so 1,163 drops + 337 travels fits both caps and yields ~1,838 boards (~97,000 host elements). The previous audit's VER-2 fix sized these caps against replay memory (the O(N^2) board-reference copying in `applyAction`), which it does bound - decode is only ~180 ms warm and ~55 MB. It does not bound what the screen then has to draw.

**Fix.** Bound the thing the screen actually pays for, in two places. (a) In `decodeGame` (src/app/share.ts, after the replay loop) and in `restoreSavedGame`'s `replay` (src/app/savedGame.ts:74-84), reject a game whose resulting state is bigger than a real game ever is - e.g. after each `applyAction`, if `state.timelines.length > 64` or the total board count (`state.timelines.reduce((n, tl) => n + tl.boards.length, 0)`) exceeds ~400, throw the same 'That code is too long to be a real game.' error. Checking inside the loop also caps the replay work, so `MAX_ACTIONS` no longer has to be the only backstop. Export the limits next to MAX_ACTIONS so the test suite can pin them. (b) Independently, stop MultiverseMap from being able to mount an unbounded number of views: render the timeline rows with a windowed list (FlatList over `state.timelines` with `initialNumToRender`/`windowSize`, and per row a horizontal FlatList over `tl.boards`), or at minimum slice each row to the turns near the viewport. A regression test should build a code just inside both caps and assert the decode is refused - and, because a bug can excuse itself, derive the expected board count from the action list rather than from the cap under test.


## Checked and sound

What the reviewers tried and could not break. Recorded so it is not re-raised, and so a future change that undoes one of these is recognisable as a regression.

- Base64 decoder (src/app/base64.ts): fed an empty body, non-alphabet characters, a lone surrogate, odd-length groups, and bytes that are not valid UTF-8. Every case lands in decodeGame's try/catch and surfaces as 'That code is damaged and cannot be read.' The `buffer`/`bits` accumulator only ever needs its low 12 bits, so the 32-bit overflow after ~5 characters is harmless, and `ALPHABET.indexOf` over a code-point iteration rejects astral characters instead of mis-decoding them.
- JSON-bomb / parser exhaustion: a 20,000-level nested array inside the code cap is parsed and rejected in 30 ms; 60,000 levels is refused by the length cap first. Any RangeError from JSON.parse would be caught by the same try/catch, and `isAction` is non-recursive, so there is no unguarded stack path.
- Prototype keys: `{"__proto__":{"polluted":1},...}` as the whole payload, `{"__proto__":{"popOut":true}}` as `r`, and `constructor` / `toString` / `__proto__` as `action.type` and as a stored `puzzleId`. `Object.prototype` and a fresh `{}` are unchanged afterwards. `cleanRules` reads three named fields rather than spreading, `puzzleById` is `PUZZLES.find(...)`, `buildTheme` is `SKINS.find(...)` / `PIECE_SETS.find(...)`, and `stats.records[key]` is only ever indexed by a literal - no attacker string reaches a bare table lookup.
- Engine bounds after SEC-1's fix: 400 fuzzed games x 120 shape-valid but hostile actions across all eight rule combinations (47,659 applications, 1,763 accepted). No board ever ended up with a cell that was not 0/1/null, `cells.length` always equalled `rows*cols`, dimensions were always 7x6 or 6x7, and `toMove` was always 0 or 1. `inside()` now guards `cellAt`, `removeDisc` and the pop/travel branches, so the out-of-range aliasing and the array-hole from the previous audit are genuinely closed, including for `col: 7`, `col: 1e21` and `row: 42`.
- Boundary schema vs engine switch: `isAction` rejects an unknown `type` before `applyAction`'s trailing `else` can treat it as a travel; `col: '0'`, `col: 1.5`, `timeline: -1`, `spin: 'sideways'` and a `travel` missing `from.col` are all refused. Huge-but-integer indices (`1e9`, `1e21`, MAX_SAFE_INTEGER) survive `isIndex` but are then refused by `dropRow`/`getTimeline`/`inside`/`isTravelTarget` as IllegalAction or a caught Error.
- The bot's per-board WeakMap cache (src/engine/bot.ts:75-89) cannot be poisoned or made to answer wrongly: 6,000 comparisons of `canWinOnBoard` against a freshly recomputed answer, cold and warm, plus a structurally identical but distinct clone object, plus a per-player-independence check - 0 mismatches. The key is the Board object and no code path mutates a Board (every operation returns `{...board, cells: [...]}`; `removeDisc` returns the same object only when it is a no-op), and each cached value is a pure function of that board, so identity is a sound key. `entry[player]` is tested with `!== undefined`, so a legitimate score of 0 is not recomputed forever.
- Bot cost on the worst multiverse I could build (577 timelines, 1,657 boards): `enumerateActions(level 3)` returned 216 candidates in 1 ms, `chooseAction` took 152 ms and a whole `playTurn` 1,026 ms. The pre-MAX_CANDIDATES enumeration does not explode because `travelTargets` excludes the latest board of each timeline, wrong-parity boards and full boards, so a wide-but-shallow multiverse yields few targets. The BUG-5 cache is doing its job.
- A share code cannot point the bot at anything: `decodeGame` returns `{mode:'local'}` for every value of `payload.m` (src/app/share.ts:104), and `useGame.load` replaces the setup, so no code can hand a level-3 bot a multiverse it just constructed. `startNew`/`startPuzzle` both reset the history, so there is no route from a loaded code into a bot game either.
- Saved-game replay (src/app/savedGame.ts): null, a non-object, `actions` that is not an array, version 99, a 5,000-entry legacy v1 history, and a puzzle id of `__proto__` or `constructor` all return null and App.tsx then deletes the key. `cleanSetup` clamps mode to local/bot/puzzle, bot level to 1/2/3 and players to 0/1, and refuses a non-local mode without a usable bot. `MAX_SAVED_ACTIONS` bounds the replay the same way the code path is bounded.
- Deep-link parsing (src/app/links.ts): the extracted code is length-capped after `decodeURIComponent`, the regex `[?&#]code=([^&#]+)` is linear with no backtracking, a malformed percent escape falls back to the raw match instead of throwing out of the Linking listener, and the alternative `/load/<x>` form still has to carry the `5DC4.` prefix to get past `decodeGame`.
- SEC-2's confirmation actually holds: `linkNeedsConfirming(game.history.length)` is evaluated against the live history through a ref that is refreshed every render, `offerCode` only stores the string, and `decodeGame` runs after the user confirms - so a link cannot silently replace a game anyone has moved in.
- Storage-backed settings/stats/progress/entitlements: object spread never sets a prototype from a JSON `__proto__` key; an unrecognised `settings.theme` only produces `playerAccent: undefined`, which nothing reads, so there is no crash-on-every-launch brick; unrecognised `skin`/`pieces` fall back through `Array.find`; a malformed `stats.records` degrades to 'undefined' text rather than throwing.
- No dangerous sink exists in the app at all: grep over src/, App.tsx and index.ts finds no `innerHTML`, `dangerouslySetInnerHTML`, `eval`, `new Function`, dynamic `import()`, `require` of a computed path, `postMessage`, service worker, WebView, fetch/XHR/WebSocket or child process. The only browser API touched is `window.location` in `webLinkFor`, guarded for `undefined` and for an opaque `null` origin.
- Mobile permission surface: expo-audio ships a config plugin that would add `android.permission.RECORD_AUDIO`, `NSMicrophoneUsageDescription`, `UIBackgroundModes: audio`, FOREGROUND_SERVICE(+MEDIA_PLAYBACK) and a media foreground service - but it is not applied, because `app.json` declares no `plugins` array and `@expo/config`'s `withConfigPlugins` evaluates only what is listed there (`getAutolinkedPackages` is a consistency check, not an auto-apply). Only expo-audio's own manifest entry, `MODIFY_AUDIO_SETTINGS`, is merged. So the app really does ship with no dangerous permission, as CLAUDE.md/REVIEW claim.
- Entitlements are read from plain AsyncStorage and trusted by `owns()`, and nothing verifies a receipt - but `STORE_ENABLED` is false, `purchase` returns 'unavailable', `owns()` returns true for everything, and only cosmetics are ever gated, so there is no attack path today. Worth wiring a server- or store-side check in before the flag is flipped.
- CI (.github/workflows/ci.yml) pins both actions to commit SHAs, declares `permissions: contents: read`, installs with `npm ci` against a committed lockfileVersion-3 lockfile, and does nothing with `github.event` content, so there is no script-injection or token-exposure path for a fork.


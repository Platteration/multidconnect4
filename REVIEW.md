# 5D Connect Four (multidconnect4) — security & upgrade review (2026-09-09)

Two independent reviewers read every first-party file in this repository; a third then re-read each security or bug claim against the code and tried to refute it. Only claims that survived that check are listed as findings; the ones that did not are recorded at the end so they are not re-raised.

## Summary

5D Connect Four is a finished, unusually complete Expo/React Native game: a pure-TypeScript multiverse engine (boards, timelines, time travel, three rule variants), a three-level bot, nine verified puzzles, replay with narration, serverless play-by-message game codes, themes/skins/piece sets, a store seam, stats and a first-launch walkthrough — 5,541 first-party lines across 65 files, 848 of them engine tests, with CI running typecheck + tests + a web export. The dependency stack is genuinely current (Expo SDK 57 is the latest stable; the 11 moderate npm-audit findings all reduce to one build-time transitive `uuid` advisory reached through `xcode` in Expo's prebuild plugins, and npm's proposed 'fix' is a catastrophic downgrade to Expo 46 that must not be applied). The headline problem is not the code, it is that this repo and /home/user/multidcheckers are the same app written twice: 27 files are byte-identical (1,245 lines), another 6 differ only by a name string or a colour token, and both `multiverse.ts` files export the same ~25-name timeline API with identical semantics — roughly 34% of the codebase is duplicated, and all 14 commits in each repo were authored in lockstep. The other high-value gaps are a live bug where opening the replay of a bot game commits bot moves into the live game (GameScreen.tsx:79/261), a cluster of contrast failures caused by using raw piece colours as text colour (down to 1.00:1 in the 'Ink & chalk' set — the sibling repo already fixed this in MultiverseMap by switching to `playerAccent`), no ESLint at all despite four `eslint-disable react-hooks/exhaustive-deps` comments, and zero tests above the engine line — `useGame.ts` (341 lines, the whole game controller) and every `src/app/` module except `share`/`base64` are untested, and the jest `testMatch` is `.ts`-only so component tests cannot even be added.

## Attack surface

The app makes no network requests at all: there is no fetch/XHR/WebSocket anywhere in src/, no API keys, no analytics and no logging (verified by grep). Everything is local to the device, so the realistic threat model is a hostile *game code* rather than a hostile server. Three untrusted inputs exist. (1) 'Play by message' codes pasted into ShareModal and (2) the same codes arriving over the OS deep link `multidconnect4://…?code=` or the web `?code=` query string, both funnelled into `decodeGame` (src/app/share.ts) which replays a JSON action list through the engine; any app or web page on the device can fire that deep link. (3) AsyncStorage contents (game, settings, stats, progress, entitlements), which are trusted on read with only a shallow shape check. The only privileged capabilities the app requests are haptics and audio playback; there are no camera/location/contacts permissions, no `intentFilters` beyond the Expo-generated scheme, and no WebView. Untrusted strings never reach markup — React Native has no innerHTML sink and no `dangerouslySetInnerHTML` is used. The purchase seam (src/app/purchases.ts) is a stub with `STORE_ENABLED = false`, so no receipts or store tokens are handled yet. Note that this repository is a near-identical sibling of /home/user/multidcheckers: the whole `src/app/` layer, `App.tsx` and `.github/workflows/ci.yml` are byte-identical, so every finding below that touches those files applies to both repos.

## Already done well

- No network I/O, no telemetry, no third-party SDKs and no secrets anywhere in the tree (verified by grep over src/, App.tsx, app.json, eas.json) — the app is genuinely offline, so most of the usual mobile privacy surface simply does not exist.
- Share codes carry only an action list, not a serialised board, and are replayed through the real engine (src/app/share.ts:38-45). That is the right design: the engine's own legality checks are the validator, so most tampering is rejected for free.
- The engine is pure and immutable as CLAUDE.md requires: `applyAction` copies `state.timelines` and each `boards` array before pushing (src/engine/multiverse.ts:269), so history states are never mutated in place and undo/replay are safe.
- The rules are covered by an unusually strong test suite for a hobby project — src/engine/__tests__/multiverse.test.ts:465-480 fuzzes 150 plies of strict-present play against parity invariants, and bot.test.ts:67-79 checks the bot never emits an illegal action across five random games with all variants on. My own 60-game fuzz across all five rule combinations found zero deadlocks, zero partition violations and zero malformed boards under legal play.
- Time-travel parity is handled correctly: a branch always starts at `to.turn + 1` (src/engine/multiverse.ts:311) so it is always the opponent who must answer on the new timeline, and `travelTargets` (multiverse.ts:219-237) correctly excludes the present board, future boards, full boards and boards of the wrong parity.
- Gravity and time travel compose correctly in both directions: the arriving disc goes through `dropDisc` on the target board (multiverse.ts:303) and the departing disc collapses its column through `removeDisc` (multiverse.ts:306), including the case where the collapse hands the opponent a line (tested at multiverse.test.ts:192-230).
- Every persistence read is wrapped and best-effort (src/app/persist.ts:10-33), and audio/haptics failures are swallowed rather than crashing (src/app/sound.ts:42-44, src/app/feedback.ts:21-24) — sensible for a device app.
- Accessibility is taken seriously: every board cell and every map thumbnail has a descriptive `accessibilityLabel` (src/ui/DiscBoard.tsx:54-55, src/ui/MultiverseMap.tsx:164), and there is a colour-blind marking option (src/ui/DiscBoard.tsx:83-101).
- CI uses `npm ci` against a committed lockfileVersion-3 `package-lock.json` and runs typecheck, tests and a web export on every push (.github/workflows/ci.yml:16-20).
- The monetisation seam is honest and inert: `STORE_ENABLED = false` and `owns()` returns true for everything until a store is wired in (src/app/purchases.ts:15, src/app/entitlements.tsx:32); nothing rule-affecting is gated.

## Findings (16)

| # | Severity | Category | Title | Where | Effort | Status |
|---|---|---|---|---|---|---|
| BUG-1 | High | bug | Opening the replay during a bot game or puzzle makes the bot play moves into the live game | `src/ui/GameScreen.tsx:251` | trivial | confirmed |
| SEC-1 | Medium | security | Untrusted game codes: engine actions are not bounds-checked, so a crafted code bypasses the pop-out rule and corrupts the board | `src/engine/multiverse.ts:290` | small | confirmed |
| BUG-2 | Medium | bug | A time travel that wins on the new timeline can be scored as a loss when the collapse also lines up the opponent | `src/engine/multiverse.ts:330` | small | confirmed |
| BUG-3 | Medium | reliability | Autosave writes the entire game history as one AsyncStorage value; measured 6.4 MB after 200 plies, past Android's limits | `src/ui/GameScreen.tsx:178` | small | confirmed |
| BUG-4 | Medium | reliability | A saved game is restored with only a shape check, so a corrupt or older save crashes the app on every launch with no way out | `src/app/setup.ts:25` | small | confirmed |
| BUG-5 | Medium | reliability | Bot latency and the multiverse map both grow with the number of boards; a long branching game becomes unplayable | `src/engine/bot.ts:190` | medium | confirmed |
| VER-1 | Medium | security | DiscBoard treats any cell that is not exactly null as a player index, so a crafted game code crashes the app on render | `src/ui/DiscBoard.tsx:55` | trivial | found by second reviewer |
| VER-2 | Medium | security | decodeGame replays an unbounded action list, so a legal-but-huge game code freezes and then OOMs the app | `src/app/share.ts:38` | trivial | found by second reviewer |
| VER-3 | Medium | bug | Opening the replay while a disc is picked up on a branched timeline throws out of the render and blanks the app | `src/ui/GameScreen.tsx:277` | trivial | found by second reviewer |
| SEC-2 | Low | security | A deep link silently replaces the game in progress, with no confirmation | `src/ui/GameScreen.tsx:106` | trivial | confirmed |
| BUG-6 | Low | bug | `userInterfaceStyle: "dark"` locks the app dark, so the default "System" theme setting can never follow the OS | `app.json:9` | trivial | confirmed |
| CI-1 | Low | ci-cd | CI actions are pinned to mutable tags, the workflow has no permissions block, and it runs on every push | `.github/workflows/ci.yml:11` | trivial | confirmed |
| VER-4 | Low | reliability | MiniBoard's React.memo is defeated by a fresh onPress closure, so every thumbnail re-renders on every map render | `src/ui/MultiverseMap.tsx:163` | small | found by second reviewer |
| VER-5 | Low | ci-cd | Four react-hooks/exhaustive-deps suppressions but no ESLint config and no lint script anywhere | `package.json:22` | small | found by second reviewer |
| SUP-1 | Info | supply-chain | `expo-sharing` is a declared dependency that is never imported, and it is the only direct path to the audit's advisories | `package.json:9` | trivial | confirmed, severity lowered |
| META-1 | Info | supply-chain | No LICENSE, SECURITY.md, CODEOWNERS or Dependabot | `package.json:30` | trivial | confirmed |

### BUG-1 · Opening the replay during a bot game or puzzle makes the bot play moves into the live game

**Severity:** High · **Category:** bug · **Effort:** trivial · **Where:** `src/ui/GameScreen.tsx:251`

`humanTurn` is forced to false whenever the replay is open (line 79), and the bot effect's guard treats `humanTurn === false` as 'it is the bot's turn'. So entering the replay does not stop the bot loop — it starts it. The effect then calls `chooseAction(state, …)` on the *replayed historical* state but applies the result with `game.play(action)`, which runs `applyAction` against the *live* state. Reproduction: start a game against any bot (or open any puzzle — puzzles also set `setup.bot`), make one move so 'Replay this game' appears in the menu, then tap it. `replayIndex` becomes 0, `state` becomes `history[0]` (Red to move, timeline 0 pending), and 600 ms later a drop chosen for the opening position is applied to the live game — usually legal, so the app silently makes a move on the human's behalf and the in-progress game is corrupted. Every subsequent scrub of the replay bar (◀ ▶ ⏮ ⏭) changes `state` and fires the effect again, so scrubbing plays the real game forward move by move. When the chosen action is *not* legal live, the player instead gets the 'nope' sound and a raw error in the hint line on every replay step. A rotate action also calls `game.focusBoard(...)` with a timeline index taken from the historical state; after an undo that index can no longer exist, and the next render throws out of `getTimeline(state, focus.timeline)` (GameScreen.tsx:256), blanking the screen. The identical guard exists in the sibling repo at /home/user/multidcheckers/src/ui/GameScreen.tsx:217.

Evidence:

```
src/ui/GameScreen.tsx:79  `const humanTurn = game.humanTurn && !replaying;`
src/ui/GameScreen.tsx:251-256
'''
if (!bot || humanTurn || spinning || state.status !== 'playing') return;
const timer = setTimeout(() => {
  const action = chooseAction(state, bot.level);   // <- replayed state
  ...
  game.play(action);                               // <- applied to the LIVE state
'''
```

**Recommendation.** Bail out of the effect while replaying and drive it from the live state only: `if (!bot || replaying || game.humanTurn || spinning || game.state.status !== 'playing') return;` and use `chooseAction(game.state, bot.level)` inside the timeout, with `[game.state, bot, replaying, spinning]` as the deps. Introduce a separate `liveState = game.state` binding so the display-only `state` is never fed to the engine. Apply the same fix to /home/user/multidcheckers/src/ui/GameScreen.tsx:217.

### SEC-1 · Untrusted game codes: engine actions are not bounds-checked, so a crafted code bypasses the pop-out rule and corrupts the board

**Severity:** Medium · **Category:** security · **Effort:** small · **Where:** `src/engine/multiverse.ts:290`

`decodeGame` replays whatever action objects a pasted code (or a deep link) contains, relying entirely on the engine for validation — the file header even promises 'a tampered code simply fails to load'. But `pop` and `travel` never check that their row/column are inside the board. `cellAt(board, row, col)` computes `row * board.cols + col` with no bounds check (src/engine/board.ts:48-50), so a column index of `cols + k` silently aliases the cell one row higher, which lets the ownership check pass for a disc that is NOT where the action claims. I verified both consequences by executing the engine: (a) with the pop-out variant on, `{ type: 'pop', timeline: 0, col: 7 }` on a 7-wide board is ACCEPTED and removes the mover's disc from **row 1** — the rule is 'your own disc from the bottom row', so this is a straightforward cheat that hands the sender an illegal move their opponent's app will happily replay; (b) `removeDisc` then writes past the end of the array (`cells[index(board, rows-1, 7)]` = index 42 on a 42-cell board), so `cells.length` becomes 43 and one real cell is left holding `undefined` instead of `null`. Because `dropRow` tests `=== null`, that cell can never be filled again: the column silently loses a slot and `isFull` will declare the board finished a disc early. Repeating the trick can seed several such cells. Threat model is a friend sending you a code over chat, so this is game-integrity, not compromise — but the 'play by message' feature is exactly where an opponent has motive. `src/app/share.ts` and `src/app/links.ts` are byte-identical in /home/user/multidcheckers, so its engine needs the same review.

Evidence:

```
src/engine/board.ts:48-50
'''
export function cellAt(board: Board, row: number, col: number): Cell {
  return board.cells[index(board, row, col)];   // index = row * cols + col, unchecked
}
'''
src/engine/multiverse.ts:290-291
'''
if (cellAt(board, 0, action.col) !== me) throw new IllegalAction('you can only pop out your own disc from the bottom row');
timelines[tl.id].boards.push(removeDisc(board, 0, action.col));
'''
src/engine/board.ts:90  `cells[index(board, board.rows - 1, col)] = null;`  // writes cells[42] on a 42-cell board
Observed: `pop {col:7}` accepted -> `cells.length 43`, col 0 = [1, null, null] (the row-1 red disc was removed); `travel {from:{row:0,col:7}}` accepted -> `cells.length 43`, top cell === undefined, `dropRow` never returns that row again.
```

**Recommendation.** Add an `assertInside(board, row, col)` guard at multiverse.ts:290 (pop) and :296 (travel origin) and make `cellAt` return null out of range, as the auditor says. Also validate the decoded action list before replaying it - but note that a `type` the switch does not know already falls into the travel branch and throws a TypeError which decodeGame's try/catch converts into 'That code contains a move that is not legal', so the schema check is about hygiene, not a second hole. The regression test should assert `IllegalAction` specifically (not just `toThrow`), because a TypeError would satisfy a bare toThrow and hide the fix.

### BUG-2 · A time travel that wins on the new timeline can be scored as a loss when the collapse also lines up the opponent

**Severity:** Medium · **Category:** bug · **Effort:** small · **Where:** `src/engine/multiverse.ts:330`

The win scan walks `created` in order and returns on the first board that has ANY line, using `winnerOf(board, me)` which only prefers the mover *within one board*. For a travel, `created` is `[origin board, branch board]` (multiverse.ts:307 then :318), so the origin board — the one whose column just collapsed — is always inspected first. If the collapse gives the opponent four in a row while the travelling disc completes four in a row on the new timeline, the opponent wins. That directly contradicts the comment two lines above ('The mover's lines take priority over any line the opponent gets from a collapse') and the README's framing of time travel as the way to take a win you missed. I reproduced it: Red travels a disc out of a column whose collapse gives Yellow a vertical four, and lands it completing R R R R on the past board; the result is `status: won, winner: 1, board: {timeline:0, turn:3}` even though the branch board holds Red's line `[1,2,3,4]`. The same shape applies to `rotate`/`flip`, but those create only one board so the per-board preference already does the right thing — travel is the only action that creates two.

Evidence:

```
src/engine/multiverse.ts:328-335
'''
// Four in a row on any board that just changed ends the game. The mover's
// lines take priority over any line the opponent gets from a collapse.
for (const ref of created) {
  const line = winnerOf(getBoard(next, ref)!, me);
  if (line) {
    return { ...next, status: 'won', win: { player: line.player, board: ref, cells: line.cells } };
'''
Observed: lastCreated [{timeline:0,turn:3},{timeline:1,turn:1}]; branch lines [{player:0,...}], origin lines [{player:1,...}]; result winner = 1.
```

**Recommendation.** Do the preference across all created boards, not per board: collect `created.map(ref => ({ ref, line: winnerOf(getBoard(next, ref)!, me) }))`, then pick the first entry whose `line.player === me`, and only if there is none fall back to the first entry with any line. Decide deliberately which way the tie should go and say so in the comment; then add a test built from the reproduction above so the choice cannot silently flip (the existing test at multiverse.test.ts:192-230 only covers the collapse-only case).

### BUG-3 · Autosave writes the entire game history as one AsyncStorage value; measured 6.4 MB after 200 plies, past Android's limits

**Severity:** Medium · **Category:** reliability · **Effort:** small · **Where:** `src/ui/GameScreen.tsx:178`

Every change to the game re-serialises `game.history` — every `GameState` ever reached, each holding every board of every timeline — into a single AsyncStorage key. Boards are shared by reference in memory but `JSON.stringify` expands each one, so the payload grows roughly with plies x boards. Measured on a real bot-vs-bot game: 83 KiB at 20 plies, 675 KiB at 60, 1.7 MB at 100, 3.7 MB at 150, 6.4 MB at 200. @react-native-async-storage/async-storage on Android is SQLite-backed with a 6 MB default database ceiling (`AsyncStorage_db_size_in_MB`), and a single row over ~2 MB trips Android's CursorWindow limit ('Row too big to fit into CursorWindow') on read. `saveJson` and `loadJson` swallow every error (src/app/persist.ts:22-24, 14-16), so the failure mode is silent: past a certain game length the save simply stops happening, and a long game that did get written can come back as `null` and be discarded on the next launch. Even before that, stringifying megabytes on the JS thread every 250 ms of play is a visible jank source on a phone. Identical code is at /home/user/multidcheckers/src/ui/GameScreen.tsx:188.

Evidence:

```
src/ui/GameScreen.tsx:176-182
'''
const timer = setTimeout(() => {
  if (game.history.length > 1) void saveJson(keys.game, { version: 2, history: game.history, setup: game.setup });
'''
Measured: ply 20 -> 8 timelines / 28 boards / 83 KiB; ply 100 -> 25 timelines / 125 boards / 1728 KiB; ply 200 -> 37 timelines / 237 boards / 6383 KiB.
src/app/persist.ts:19-25  `catch { // Ignore: persistence is a convenience, never a requirement. }`
```

**Recommendation.** Persist what the share code already persists: `{ version: 3, rules, setup, actions: actionsOf(history) }` from src/app/share.ts:19, and rebuild the history by replaying on load (a 200-action replay measured 4 ms, so the cost is negligible). That turns a 6.4 MB blob into ~10 KB. Keep the old key readable for one release so games in flight survive the change. Whatever you store, stop swallowing write failures blind — have `saveJson` return a boolean and surface a one-line 'this game is too big to save' notice rather than losing the game silently.

### BUG-4 · A saved game is restored with only a shape check, so a corrupt or older save crashes the app on every launch with no way out

**Severity:** Medium · **Category:** reliability · **Effort:** small · **Where:** `src/app/setup.ts:25`

`looksLikeSavedGame` checks only that `version` is 1 or 2 and that `history` is a non-empty array; the `GameState` objects inside are never validated. The restored history goes straight into `useGame`, whose `focus` initialiser calls `firstPending(last)` -> `mandatoryTimelines(state)`, which dereferences `state.timelines.filter(...)` and `state.rules.strictPresent`. A state missing either field throws during the first render of `GameScreen`. There is no error boundary anywhere in the tree (App.tsx:41-56), and the bad value stays in AsyncStorage, so the app crashes on launch, every launch, until the user deletes and reinstalls. This is not hypothetical: the code deliberately accepts `version === 1` saves, and `rules` was added to `GameState` with the variants feature — a v1 state predating it hits exactly this path. Any future change to the `GameState` shape reopens it. `src/app/setup.ts` and `App.tsx` are byte-identical in /home/user/multidcheckers.

Evidence:

```
src/app/setup.ts:25-28
'''
export function looksLikeSavedGame(v: unknown): v is SavedGame | { version: 1; history: GameState[] } {
  const s = v as { version?: number; history?: unknown };
  return !!s && (s.version === 1 || s.version === 2) && Array.isArray(s.history) && s.history.length > 0;
'''
src/ui/useGame.ts:102-105  `return (last && (last.win?.board ?? firstPending(last))) || { timeline: 0, turn: 0 };`
src/engine/multiverse.ts:174-176  `return state.timelines.filter(...)`  /  :192  `if (!state.rules.strictPresent) return pending;`
```

**Recommendation.** Two cheap layers. First, validate structurally before trusting: check every state has `rules`, a non-empty `timelines` array whose entries have numeric `id`/`startTurn` and at least one board with `cells.length === rows * cols`, and drop the save (`removeKey(keys.game)`) when it fails. If you adopt the action-list format from BUG-3, this collapses into 'replay the actions and drop the save if replay throws', which is strictly better because it also revalidates legality. Second, wrap `<Root />` in a React error boundary whose fallback clears `keys.game` and offers 'Start a new game', so no persisted value can brick the app.

### BUG-5 · Bot latency and the multiverse map both grow with the number of boards; a long branching game becomes unplayable

**Severity:** Medium · **Category:** reliability · **Effort:** medium · **Where:** `src/engine/bot.ts:190`

The `MAX_CANDIDATES = 90` cap only samples *travel* actions — `plain` (drops, spins, flips across every pending timeline) is kept whole, so the candidate count grows linearly with timelines. Each candidate is then scored with a full `applyAction`, plus `opponentCanWinAtOnce`, which itself runs one `applyAction` per column per pending board. The result is roughly quadratic in the multiverse size, on the JS thread, inside a `setTimeout`. Measured on desktop Node (Hermes on a phone is several times slower): a single `chooseAction` at level 3 costs ~27 ms at 3 timelines, crosses 300 ms at 34 timelines / 185 boards, and reaches 695-794 ms at ~50 timelines / 300+ boards. Because the bot plays one action per pending board with a 600 ms pause between them, a turn at that size takes well over a minute. In parallel, `MultiverseMap` renders every board that ever existed as a `MiniBoard` of rows x cols `View`s inside plain nested `ScrollView`s with no virtualisation — 185 boards is roughly 7,800 cell views, 431 boards roughly 18,000. Most bot-vs-bot games end in ~25 plies with 3 timelines and are fine; the problem is the long defensive game, which is precisely the one a human plays against Paradox. Both files are structurally the same in /home/user/multidcheckers.

Evidence:

```
src/engine/bot.ts:190-198
'''
if (actions.length > MAX_CANDIDATES) {
  const plain = actions.filter((a) => a.type !== 'travel');   // never capped
  ...
  actions = [...plain, ...travels.slice(0, Math.max(0, MAX_CANDIDATES - plain.length))];
'''
Measured (seed 12345, level 3 self-play): first >=300 ms chooseAction at ply 151 with 34 timelines / 185 boards; worst 794 ms at 55 timelines; a 373-ply game spent 87 s in the bot alone and ended with 58 timelines / 431 boards.
src/ui/MultiverseMap.tsx:127-168  `{tl.boards.map((board, i) => ... <MiniBoard board={board} .../>)}` inside ScrollView, no virtualisation.
```

**Recommendation.** Cap the whole candidate list, not just travels: shuffle and slice `plain` too, or better, restrict the bot to scoring one board at a time (it already plays one action per board, so evaluating only the pending board it is about to play is both faster and no weaker). Cache `boardScore` per board object — boards are immutable, so a `WeakMap<Board, [number, number]>` removes most of the repeated work in `evaluate`. For the map, replace the inner `ScrollView` with a `FlatList` keyed by timeline with `windowSize`/`initialNumToRender` set, and render each `MiniBoard` to a single memoised element (it is already `React.memo`, but 42 child views per board is the cost) — or draw the thumbnail as one `react-native-svg` node instead of a grid of `View`s.

### VER-1 · DiscBoard treats any cell that is not exactly null as a player index, so a crafted game code crashes the app on render

**Severity:** Medium · **Category:** security · **Effort:** trivial · **Where:** `src/ui/DiscBoard.tsx:55`

Every cell's accessibility label is built as `value === null ? 'empty' : colors.playerNames[value].toLowerCase()`. The board type says a cell is `Player | null`, but the engine can produce `undefined` cells (SEC-1: removeDisc writing past the end of the array), and `undefined` is not `null`, so the expression evaluates `colors.playerNames[undefined].toLowerCase()` and throws. There is no error boundary in the tree (App.tsx:41-56), so the render throw takes the whole app down. This turns SEC-1 from a cheating bug into a one-tap denial of service: I built a real, fully accepted game code whose five actions end with `{type:'travel', from:{timeline:0,row:0,col:7}, ...}`, confirmed decodeGame replays it without error, confirmed the resulting board has cells[35] === undefined, and confirmed useGame.load focuses exactly that board (it is the first pending timeline), which is the board DiscBoard renders. Delivered as `multidconnect4://?code=...` (SEC-2's path) any other app or web page can crash the game on demand. The corrupt state is never committed, so relaunching recovers - it is a crash, not a brick. The sibling is not affected: /home/user/multidcheckers/src/ui/CheckerBoard.tsx:51 guards with `piece ? ... : ''`.

Evidence:

```
src/ui/DiscBoard.tsx:43  `const value = board.cells[index(board, r, c)];`
src/ui/DiscBoard.tsx:55  `accessibilityLabel={`row ${r + 1} column ${c + 1} ${value === null ? 'empty' : colors.playerNames[value].toLowerCase()}`}`
Executed end to end (JS port of the engine + the real base64 encoder): the code `5DC4.eyJ2IjoxLCJyIjp7InBvcE91dCI6ZmFsc2UsImZsaXAiOmZhbHNlLCJzdHJpY3RQcmVzZW50IjpmYWxzZX0sIm0iOiJsb2NhbCIsImEiOlt7InR5cGUiOiJkcm9wIiwidGltZWxpbmUiOjAsImNvbCI6MH0seyJ0eXBlIjoiZHJvcCIsInRpbWVsaW5lIjowLCJjb2wiOjF9LHsidHlwZSI6ImRyb3AiLCJ0aW1lbGluZSI6MCwiY29sIjowfSx7InR5cGUiOiJkcm9wIiwidGltZWxpbmUiOjAsImNvbCI6MX0seyJ0eXBlIjoidHJhdmVsIiwiZnJvbSI6eyJ0aW1lbGluZSI6MCwicm93IjowLCJjb2wiOjd9LCJ0byI6eyJ0aW1lbGluZSI6MCwidHVybiI6MH0sImNvbCI6M31dfQ` replays cleanly, yields cells.length 43 with cells[35] === undefined, and the label expression throws `TypeError: Cannot read properties of undefined (reading 'toLowerCase')`.
src/ui/useGame.ts:286  `setFocus(last.win?.board ?? firstPending(last) ?? { timeline: 0, turn: 0 });`  // focuses the corrupted board
App.tsx:41-56  no error boundary
```

**Recommendation.** Fix the engine bounds first (SEC-1), then make the view defensive anyway: `const value = board.cells[index(board, r, c)]; const name = value === 0 || value === 1 ? colors.playerNames[value] : null;` and treat anything else as empty. Separately, wrap `<Root />` in a small error boundary whose fallback clears keys.game and offers 'Start a new game' - that one component also closes BUG-4 and VER-3.

### VER-2 · decodeGame replays an unbounded action list, so a legal-but-huge game code freezes and then OOMs the app

**Severity:** Medium · **Category:** security · **Effort:** trivial · **Where:** `src/app/share.ts:38`

decodeGame accepts any number of actions and replays them synchronously, appending a full GameState per action. There is no cap on the list length and no cap on the resulting history. Two things make this cheap to weaponise. First, the payload carries its own rules (`newGame(payload.r)`), so the sender turns pop-out on regardless of the recipient's settings. Second, with pop-out on there is an infinite cycle of perfectly legal moves - Red drop col 0, Yellow drop col 1, Red pop col 0, Yellow pop col 1, board back to empty - so an arbitrarily long code is trivially generated and every action passes the engine's checks. Memory is quadratic, not linear, because applyAction copies each timeline's board array on every action (multiverse.ts:269): state N holds an array of N board references, so N actions cost O(N^2) references. Measured with the real engine logic: 2,000 actions -> 106 ms and 33 MB; 6,000 -> 1.2 s and 218 MB; 12,000 -> 4.0 s and 843 MB from a 570 KiB code (a size that pastes fine into ShareModal's TextInput and fits a web `?code=` URL). On a phone, Hermes hits its heap limit well before 843 MB, so this is an OOM kill, not just jank - and it is reachable from the deep link of SEC-2 as well as from a pasted code. The file header's claim that 'a tampered code simply fails to load' does not cover a code that is entirely legal and merely enormous. The sibling shares decodeGame but is partly protected by its QUIET_PLIES_FOR_DRAW counter, which ends a shuffling game; 5D Connect Four has no equivalent bound once pop-out is enabled.

Evidence:

```
src/app/share.ts:37-45
'''
if (payload.v !== 1 || !Array.isArray(payload.a)) throw new Error('That code is from a version this app cannot read.');
const history: GameState[] = [newGame(payload.r)];
for (const action of payload.a) {
  try {
    history.push(applyAction(history[history.length - 1], action));
  } catch { throw new Error('That code contains a move that is not legal.'); }
}
'''
src/engine/multiverse.ts:269  `const timelines = state.timelines.map((tl) => ({ ...tl, boards: tl.boards.slice() }));`  // O(boards) copy per action
src/engine/multiverse.ts:286-292  the `pop` branch, which makes the drop/drop/pop/pop cycle endlessly legal
Measured (JS port, drop/drop/pop/pop cycle, popOut set from the payload): N=2000 -> 106 ms, 33 MB heap, 95 KiB code; N=6000 -> 1186 ms, 218 MB, 285 KiB code; N=12000 -> 3981 ms, 843 MB, 570 KiB code.
```

**Recommendation.** Reject the payload before replaying it: cap `payload.a.length` at something a real game cannot exceed (a few thousand) and cap the encoded string length in codeFromUrl/ShareModal before it reaches decodeGame, with a plain message ('That code is too long to be a real game'). Both caps are cheap and belong at the boundary, not in the engine.

### VER-3 · Opening the replay while a disc is picked up on a branched timeline throws out of the render and blanks the app

**Severity:** Medium · **Category:** bug · **Effort:** trivial · **Where:** `src/ui/GameScreen.tsx:277`

`origin` is computed unconditionally in the component body from the LIVE selection but the DISPLAYED state: `selection.kind === 'none' ? null : latestRef(getTimeline(state, selection.from.timeline))`. While replaying, `state` is `game.history[replayIndex]`, which has fewer timelines than the live state, and nothing clears the selection when the replay opens - the Menu button is never disabled during a selection (GameScreen.tsx:355) and 'Replay this game' only calls `setReplayIndex(0)` (line 469). So: pick up one of your discs on any timeline other than 0 (tap it on a branch board), open the Menu, tap 'Replay this game'. The next render calls `getTimeline(history[0], N)` for N >= 1, and getTimeline throws `Error('no timeline N')` rather than returning undefined. With no error boundary in the tree (App.tsx:41-56) the render throw unmounts everything. Unlike BUG-4 the saved game is still valid, so a relaunch recovers - but the user loses the on-screen game state and it reproduces every time. The same line exists in the sibling at /home/user/multidcheckers/src/ui/GameScreen.tsx:251.

Evidence:

```
src/ui/GameScreen.tsx:277  `const origin = selection.kind === 'none' ? null : latestRef(getTimeline(state, selection.from.timeline));`
src/ui/GameScreen.tsx:77  `const state = replaying ? game.history[replayIndex] : game.state;`
src/engine/multiverse.ts:123-127
'''
export function getTimeline(state: GameState, id: number): Timeline {
  const tl = state.timelines[id];
  if (!tl) throw new Error(`no timeline ${id}`);
  return tl;
}
'''
src/ui/GameScreen.tsx:355  `<Button label="Menu" small onPress={() => setMenuOpen(true)} />`  // never disabled while holding a disc
src/ui/GameScreen.tsx:469  `{ label: 'Replay this game', onPress: () => setReplayIndex(0) }`  // does not clear the selection
/home/user/multidcheckers/src/ui/GameScreen.tsx:251  identical line
```

**Recommendation.** Clear the selection when the replay opens (`onPress: () => { game.cancel(); setReplayIndex(0); }`) and make the render defensive: `const origin = replaying || selection.kind === 'none' ? null : latestRef(getTimeline(state, selection.from.timeline));`. Nothing in replay mode uses `origin` for anything but dimming, so null is the correct value there anyway.

### SEC-2 · A deep link silently replaces the game in progress, with no confirmation

**Severity:** Low · **Category:** security · **Effort:** trivial · **Where:** `src/ui/GameScreen.tsx:106`

Both the cold-start URL and every `url` event are parsed for a `code=` parameter and, if one is found, loaded immediately via `game.load`, which throws away the current history. The scheme `multidconnect4://` is registered by app.json:6 and is not restricted to any host or path, so any other app on the device, any QR code, or any web page the user taps a link on can navigate to `multidconnect4://?code=<a valid code>` and destroy the game the two players were in the middle of. On the web build the same happens for any `?code=` in the URL. The autosave effect then persists the replacement 250 ms later, so the original game is gone for good. Every action-validation weakness in SEC-1 is reachable through this path without the user pasting anything. `src/app/links.ts` is byte-identical in /home/user/multidcheckers.

Evidence:

```
src/ui/GameScreen.tsx:106-117
'''
Linking.getInitialURL().then((url) => { const code = codeFromUrl(url); if (code) loadCodeRef.current(code); })
const sub = Linking.addEventListener('url', ({ url }) => { const code = codeFromUrl(url); if (code) loadCodeRef.current(code); });
'''
src/app/links.ts:6-16  `const match = /[?&#]code=([^&#]+)/.exec(url);`
app.json:6  `"scheme": "multidconnect4",`
```

**Recommendation.** Decode the code but do not commit it: hold it in state and show the existing confirmation pattern from MenuModal ('Start over? The game in progress will be lost') before calling `game.load`, skipping the prompt only when `game.history.length === 1`. That keeps the link feature and costs one modal.

### BUG-6 · `userInterfaceStyle: "dark"` locks the app dark, so the default "System" theme setting can never follow the OS

**Severity:** Low · **Category:** bug · **Effort:** trivial · **Where:** `app.json:9`

The manifest declares the app as dark-only, which on iOS becomes `UIUserInterfaceStyle: Dark` in Info.plist. React Native's `useColorScheme()` reads the app's own trait collection, so under that setting it always returns `'dark'`. `ThemeProvider` maps the default `theme: 'system'` preference through `useColorScheme()`, so the shipped default — and the 'System' option users pick in Settings — silently behaves as 'Dark' on device. Only the explicit 'Light' choice works, because it bypasses `useColorScheme()` entirely. The light palette in src/ui/theme.ts:54-67 is fully built and unreachable for anyone who leaves the default alone. app.json carries the same value in /home/user/multidcheckers.

Evidence:

```
app.json:9  `"userInterfaceStyle": "dark",`
src/app/theme.tsx:11-12
'''
const system = useColorScheme();
const scheme = settings.theme === 'system' ? (system === 'light' ? 'light' : 'dark') : settings.theme;
'''
```

**Recommendation.** Set `"userInterfaceStyle": "automatic"` and add `expo-system-ui` (Expo requires it for the setting to be honoured on Android; without it `expo prebuild` warns and ignores the value). Verify on an iOS device with the system theme set to light - that is the platform where the bug actually bites; the web build is already correct.

### CI-1 · CI actions are pinned to mutable tags, the workflow has no permissions block, and it runs on every push

**Severity:** Low · **Category:** ci-cd · **Effort:** trivial · **Where:** `.github/workflows/ci.yml:11`

`actions/checkout@v4` and `actions/setup-node@v4` are pinned to floating major tags rather than commit SHAs (0 of 2 pinned), so a compromise of either tag runs attacker code with whatever token the job holds. The job declares no `permissions:` block, so it inherits the repository default, which for many repos is still read/write on `contents` — more than a typecheck-and-test job needs. `on: push` has no branch filter, so every branch push burns a run. Nothing secret is exposed today (the workflow uses no secrets and there is no publish step), which keeps this low, but the same file is byte-identical in /home/user/multidcheckers so the fix applies to both.

Evidence:

```
.github/workflows/ci.yml:3-13
'''
on:
  push:
  pull_request:
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
'''
```

**Recommendation.** Pin both actions to full commit SHAs with the version in a trailing comment (`uses: actions/checkout@<sha> # v4.2.2`), add `permissions: { contents: read }` at the workflow level, and narrow the trigger to `push: { branches: [main] }` plus `pull_request:` so branch pushes are covered once by the PR run.

### VER-4 · MiniBoard's React.memo is defeated by a fresh onPress closure, so every thumbnail re-renders on every map render

**Severity:** Low · **Category:** reliability · **Effort:** small · **Where:** `src/ui/MultiverseMap.tsx:163`

MiniBoard is wrapped in React.memo, but MultiverseMap passes `onPress={() => onPressBoard(ref)}` - a new function identity on every render - so the shallow prop comparison never succeeds and the memo never skips a thumbnail. Each MiniBoard then rebuilds rows x cols child Views (42 for an upright 7x6 board). At the 192-board multiverse I measured in a level-3 self-play game that is roughly 8,000 cell Views reconstructed on every state change, focus change, selection change and theme read, which is the concrete reason the map stops keeping up in a long branching game. This is the sharpest single lever in BUG-5's map half and the auditor explicitly assumed the memo was working ('it is already React.memo'). Same line in /home/user/multidcheckers/src/ui/MultiverseMap.tsx:163.

Evidence:

```
src/ui/MiniBoard.tsx:23  `export const MiniBoard = React.memo(function MiniBoard({ board, ring, dim, badge, onPress, accessibilityLabel }: Props) {`
src/ui/MultiverseMap.tsx:158-165
'''
<MiniBoard
  board={board}
  ring={ring}
  badge={badge}
  dim={dim}
  onPress={() => onPressBoard(ref)}
  accessibilityLabel={...}
/>
'''
src/ui/MiniBoard.tsx:26-43  builds `board.rows * board.cols` cell Views plus `board.rows` row Views per thumbnail
/home/user/multidcheckers/src/ui/MultiverseMap.tsx:163  identical
```

**Recommendation.** Pass the ref instead of a closure - give MiniBoard an `onPressRef?: (ref: BoardRef) => void` plus a stable `boardRef` prop, or hoist the row into a memoised `<TimelineRow>` that takes `onPressBoard` (already stable, it is a useCallback in useGame) and builds the closure inside its own memo boundary. Measure before and after with a long game; do this before reaching for FlatList, since it may be enough on its own.

### VER-5 · Four react-hooks/exhaustive-deps suppressions but no ESLint config and no lint script anywhere

**Severity:** Low · **Category:** ci-cd · **Effort:** small · **Where:** `package.json:22`

The source carries four `// eslint-disable-next-line react-hooks/exhaustive-deps` comments, but there is no ESLint configuration file in the repository (`git ls-files` matches nothing for eslint/prettier), no `lint` script in package.json, and no lint step in CI - so the rule those comments suppress has never actually run. That matters here rather than being pure paperwork: the suppression at GameScreen.tsx:265 sits on precisely the effect whose stale/wrong dependency list is BUG-1, and the one at MultiverseMap.tsx:65 sits on the travel-animation effect that reads `state.lastCreated` while depending only on `flightKey`. A lint step is the cheapest thing that would have surfaced BUG-1 before a human did. Both repos are in the same state.

Evidence:

```
package.json:19-25  scripts = start, android, ios, web, test, typecheck — no `lint`
`git ls-files | grep -iE 'eslint|prettier'` -> no matches (in both repos)
.github/workflows/ci.yml:16-20  npm ci / typecheck / test / expo export — no lint step
Suppressions present anyway: src/ui/GameScreen.tsx:90, src/ui/GameScreen.tsx:265, src/ui/MultiverseMap.tsx:65, src/ui/DiscBoard.tsx:33
```

**Recommendation.** Add `eslint-config-expo` with a flat `eslint.config.js` (the SDK 57 default for a bare Expo TypeScript app), add `"lint": "eslint ."` to scripts, and add `- run: npm run lint` to CI after typecheck. Then re-examine each of the four suppressions rather than carrying them forward - at least GameScreen.tsx:265 is hiding a real defect.

### SUP-1 · `expo-sharing` is a declared dependency that is never imported, and it is the only direct path to the audit's advisories

**Severity:** Info (reported as low, adjusted after review) · **Category:** supply-chain · **Effort:** trivial · **Where:** `package.json:9`

Nothing in the tree imports `expo-sharing`: the share sheet uses React Native's own `Share` API and `expo-clipboard` (src/ui/ShareModal.tsx:1-3, 39-46). It is nevertheless a direct dependency, and per the pre-computed audit it is the one *direct* package pulling `@expo/config-plugins` -> `xcode` -> the vulnerable `uuid` (GHSA: missing buffer bounds check in v3/v5/v6). All 11 moderate advisories resolve to that single chain and are build-time only — `@expo/config-plugins` runs during prebuild/EAS, never in the shipped bundle — so there is no runtime exposure, but removing an unused dependency is free and shrinks the direct surface by one. The same unused dependency is present in /home/user/multidcheckers/package.json.

Evidence:

```
package.json:9  `"expo-sharing": "~57.0.18",`  — `grep -rn expo-sharing src App.tsx index.ts` returns nothing.
npm audit: `expo-sharing moderate ["@expo/config-plugins"]`, `@expo/config-plugins moderate ["xcode"]`, `xcode moderate ["uuid"]`; metadata: 11 moderate, 0 high, 0 critical.
```

**Recommendation.** Drop expo-sharing because it is dead weight, not because it fixes anything - say so in the commit message so nobody expects the advisory count to change. The advisories live under `expo` itself and only clear when Expo bumps @expo/config-plugins/xcode, so add `.github/dependabot.yml` (npm + github-actions, weekly) and leave it at that.

*Reviewer note (confirmed, severity lowered):* The core fact is right and I verified it: nothing in the tree imports expo-sharing (grep over src, App.tsx and index.ts for 'expo-sharing' and 'Sharing' returns nothing), and ShareModal uses React Native's own Share plus expo-clipboard. But the load-bearing claim - that expo-sharing 'is the only *direct* path to the audit's advisories' and that removing it 'shrinks the direct surface by one' in a way that matters - is wrong. package-lock.json shows `expo` itself, a direct dependency, declaring `@expo/config-plugins: ~57.0.9`, along with @expo/config, @expo/prebuild-config, @expo/inline-modules and @expo/cli. Removing expo-sharing therefore leaves the entire @expo/config-plugins -> xcode -> uuid@7.0.3 chain in place and clears none of the 11 advisories. What is left is tidy-up of an unused dependency with no security effect, which is info, not low. (I could not re-run npm audit - no node_modules and the ground rules forbid installing - so I am judging the chain from the lockfile, which is enough to refute the 'only direct path' claim.) The same unused dependency is in /home/user/multidcheckers/package.json:11.

### META-1 · No LICENSE, SECURITY.md, CODEOWNERS or Dependabot

**Severity:** Info · **Category:** supply-chain · **Effort:** trivial · **Where:** `package.json:30`

The repository has no LICENSE file (and `package.json` sets `"private": true` with no `license` field), no SECURITY.md saying where to report a problem, no CODEOWNERS, and no Dependabot configuration. For a solo side project heading for the app stores this is mostly a paperwork gap rather than a risk, but the missing Dependabot config is the one with teeth: the transitive advisories in SUP-1 will only clear when Expo bumps them, and nothing here is watching for that.

Evidence:

```
package.json:30  `"private": true,`  — no `license` field; `git ls-files` shows no LICENSE, SECURITY.md, .github/dependabot.yml or CODEOWNERS among the 65 tracked files.
```

**Recommendation.** Add a LICENSE (MIT or similar) and set `"license"` in package.json; add `.github/dependabot.yml` with a weekly `npm` ecosystem entry (and a `github-actions` entry, which will also keep the SHA pins from CI-1 fresh). SECURITY.md and CODEOWNERS are optional for a solo repo — add SECURITY.md if the app ships to a store, so users have somewhere to write.

## Upgrades

| Value | Effort | Upgrade | Now | Move to |
|---|---|---|---|---|
| high | large | De-duplicate against multidcheckers: one workspace with a parameterised multiverse core | Two standalone repos with identical 65-file layouts, identical branch names and commit-for-commit parallel history. 27 files are byte-identical (1,245 lines: all of src/app except share.ts, plus MenuModal/ExtrasModal/StatsModal/PuzzlesModal/PuzzleResultModal/WelcomeModal/ReplayBar, App.tsx, index.ts, tsconfig.json, eas.json, .gitignore, .github/workflows/ci.yml, engine/index.ts, puzzles.test.ts). Six more (types.ts, share.ts, ShareModal.tsx, SettingsModal.tsx, NewGameModal.tsx, MultiverseMap.tsx — 660 lines) differ only by a name string ('5DC4.' vs '5DCK.', 'Yellow' vs 'Black') or a renamed colour token. Both engine/multiverse.ts files export the same API: Timeline, Status, WinInfo, GameState, Action, newGame, applyAction, resolveTurn, timelineLabel, getTimeline, latestTurn, latestBoard, latestRef, getBoard, isLatest, maxTurn, pendingTimelines, presentTurn, mandatoryTimelines, optionalTimelines, canEndTurn, isPending, travelTargets, isTravelTarget, IllegalAction. | One npm-workspaces monorepo (Expo's metro-config has had monorepo support since SDK 49, so no extra tooling). packages/multiverse: types.ts plus multiverse.ts made generic over a `GameRules<Board, Move>` adapter — `initialBoard()`, `isFinished(b)`, `winnerOf(b, preferred)`, `applyLocal(b, move, player)`, `travelSources(b, player)`, `liftPiece(b, src)`, `landPiece(b, dst, player)` — which is the only part that differs between discs and checkers; the timeline bookkeeping (branching, parity, present/mandatory/optional, strict-present, draw detection) becomes shared. packages/shell: all of src/app, the Modal/Button chrome, MenuModal, SettingsModal, ShareModal, StatsModal, PuzzlesModal, PuzzleResultModal, WelcomeModal, ReplayBar, MultiverseMap, MiniBoard, and a `GameShell` taking render props for the big board and the game-specific settings rows; plus one `GameIdentity` config object `{ appName, codePrefix, playerNames, skins, pieceSets }` that collapses every remaining string-only difference. apps/connect4 and apps/checkers keep only board.ts, the big board component, skins, puzzles, narrate.ts and app.json. If a full merge is too disruptive, the cheap interim is a CI job that diffs the 27 identical files against the sibling checkout and fails on drift, so the copies cannot silently diverge. |
| high | small | No ESLint at all, despite four react-hooks/exhaustive-deps suppressions | package.json has no eslint dependency and no lint script. Four `// eslint-disable-next-line react-hooks/exhaustive-deps` comments exist (DiscBoard.tsx:33, GameScreen.tsx:90, GameScreen.tsx:265, MultiverseMap.tsx:65) that nothing enforces or checks. | `npx expo lint` (installs eslint + eslint-config-expo and writes eslint.config.js), add `"lint": "expo lint"` to scripts and a `npm run lint` step to CI. Add prettier with the same command if formatting drift matters. |
| high | small | Contrast failures: raw piece colours used as text colour | `colors.players[...]` (the disc fill) is used as a text colour in MultiverseMap.tsx:95 (turn labels), :114/:118 (timeline labels), GameScreen.tsx map legend, and Modals.tsx:132 (the game-over headline). Measured against the panel each sits on: classic Yellow #ffd23f on the light panel #ffffff is 1.44:1; 'Ink & chalk' Chalk on light is 1.10:1 and Ink on the dark panel #171a33 is 1.00:1 — literally invisible. The theme already defines `playerAccent` documented as 'A readable colour for text that refers to each player' (theme.ts:32), and the sibling repo has already switched MultiverseMap to it. Separately, the primary Button paints `colors.background` on `colors.travel`, which is 2.82:1 in the light scheme (Modals.tsx:164 + :32, and `choiceTextOn` in SettingsModal.tsx:152), and MiniBoard's badge text is 8px `colors.background` on `colors.panelRaised` at 1.08:1 whenever no ring colour is set (the 'new' badge path, MultiverseMap.tsx:151 + MiniBoard.tsx:88-96). | Use `playerAccent` for every text/glyph that names a player; darken LIGHT.travel (#0a9fc6 → roughly #0a7a99) so primary-button text clears 4.5:1; give the badge an explicit foreground token rather than reusing `colors.background`, and raise it from 8px. Then lock it in with a unit test in the style of the owner's own randostats/tvsham convention: `src/ui/__tests__/theme.test.ts` walking every scheme × skin × piece-set pairing and asserting WCAG AA. |
| high | medium | Accessibility gaps beyond contrast | Good coverage on the tappable board (DiscBoard.tsx:54) and the map (MultiverseMap.tsx:164), but: ReplayBar's transport buttons are the bare glyphs '⏮ ◀ ▶ ⏭' with no accessibilityLabel; `Button` sets accessibilityRole but never accessibilityState={{disabled}}; no Modal sets accessibilityViewIsModal and every backdrop is a plain View so tapping outside never dismisses; status changes ('Yellow to move · 3 boards waiting', 'Red wins!') are never announced — no accessibilityLiveRegion or AccessibilityInfo.announceForAccessibility; and nothing consults `AccessibilityInfo.isReduceMotionEnabled()` before the 380–650ms spin, flip, falling-disc and time-travel-flight animations. | Label the transport buttons ('First move', 'Previous', 'Next', 'Last'); add accessibilityState to Button; add accessibilityViewIsModal and a Pressable backdrop; put accessibilityLiveRegion="polite" on the status pill Text (GameScreen.tsx:361); read reduce-motion once into a context and short-circuit the Animated.timing durations to 0 in DiscBoard.tsx:32, GameScreen.tsx:157 and MultiverseMap.tsx:61. |
| high | medium | CI has no lint, no e2e, and no audit; actions unpinned and over-privileged | .github/workflows/ci.yml: `on: push` (no branch filter, no concurrency group) and `on: pull_request`; steps are checkout@v4, setup-node@v4 (Node 22), npm ci, typecheck, `npm test -- --ci`, `npx expo export --platform web`. No permissions block, no lint step, no audit step, no end-to-end test, and the exported web bundle is built and thrown away. | Add `permissions: { contents: read }` at workflow level; pin both actions to full commit SHAs with a version comment; add `concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }`; add `npm run lint` and `npm audit --audit-level=high`; add a Playwright smoke test driving the exported web build (the owner already does exactly this in drawdraw/e2e/smoke.mjs and randostats) that plays a drop, a spin, a time travel, reloads to prove the autosave restores, and round-trips a share code; and publish `dist/` to GitHub Pages so the `?code=` web links in links.ts:20 actually resolve to something. |
| high | small | Jest testMatch excludes .tsx, so component tests cannot be added | package.json jest config: `"testMatch": ["**/__tests__/**/*.test.ts"]`. No @testing-library/react-native. Every test lives in src/engine/__tests__ and nothing above the engine is covered. | Widen to `**/__tests__/**/*.test.@(ts\|tsx)`, add `@testing-library/react-native` as a devDependency, and start with the two highest-value targets: `src/ui/__tests__/useGame.test.ts` (a .ts file, so it matches today) and a render test for GameScreen's replay/bot interaction. |
| medium | trivial | Do not run `npm audit fix --force`; pin uuid via overrides instead | 11 moderate advisories, all one root cause: uuid <11.1.1 (GHSA-w5hq-g745-h8pq, missing buffer bounds check in v3/v5/v6 when `buf` is supplied). Lockfile resolves uuid 7.0.3 via xcode 3.0.1 → @expo/config-plugins 57.0.9 → @expo/cli / @expo/prebuild-config / expo-sharing. npm reports `fixAvailable: {name: 'expo', version: '46.0.21', isSemVerMajor: true}` and `expo-sharing@14.0.8`. | Add `"overrides": { "uuid": "^11.1.1" }` to package.json, run `npm install`, and verify `npx expo prebuild --no-install` and `npx expo export --platform web` still succeed (xcode 3.x calls uuid.v4(), which is unchanged across those majors). Record in CLAUDE.md that the npm-suggested remedy is a downgrade to Expo SDK 46 and must never be applied. Optionally add `npm audit --audit-level=high` to CI so this class stays visible without blocking on the moderate build-time noise. |
| medium | trivial | expo-sharing is a declared dependency that is never imported | package.json depends on `expo-sharing: ~57.0.18`; no file in src/, App.tsx or index.ts imports it. ShareModal.tsx uses expo-clipboard and React Native's own `Share` API instead. | Remove it from package.json (and from multidcheckers, which has the identical package.json). |
| medium | trivial | No Dependabot or Renovate | No .github/dependabot.yml and no renovate.json. | Add .github/dependabot.yml with npm and github-actions ecosystems, weekly, grouped — and ignore the `expo`/`expo-*`/`react-native`/`react` majors so bot PRs cannot break the SDK's pinned version set (those move together via `npx expo install --check`). |
| medium | trivial | Missing LICENSE, SECURITY.md, CHANGELOG, CONTRIBUTING, PRIVACY | None present. README documents a Supporter pack and store plans, so a store listing is intended. | Add a LICENSE (the README describes an app to be sold, so a proprietary/all-rights-reserved notice is likely more appropriate than MIT — decide explicitly). Add SECURITY.md with a contact. Add PRIVACY.md stating the app collects nothing and stores everything locally in AsyncStorage — both stores require a privacy policy URL for submission. A CHANGELOG becomes worth keeping once versioning starts. |
| medium | small | app.json is missing the app-store readiness fields | No `description`, no `android.permissions: []`, no `ios.privacyManifests`, no `updates`/`runtimeVersion` block and no expo-updates dependency, `newArchEnabled` unset, no `expo-build-properties`. eas.json has development/preview/production profiles with `appVersionSource: remote` and an empty `submit.production`. | Add `description`; set `android.permissions: []` so the merged manifest cannot inherit permissions from a transitive library; verify the generated iOS privacy manifest covers AsyncStorage's required-reason API usage and add `ios.privacyManifests` if it does not; decide on OTA explicitly — adding expo-updates with `runtimeVersion: { policy: 'appVersion' }` is the difference between shipping a fix in an hour and waiting on review; state `newArchEnabled` rather than relying on the RN 0.86 default; fill in `submit.production` with the store credentials config. |
| medium | trivial | orientation is locked to portrait, so the landscape split layout is web-only dead code | app.json sets `"orientation": "portrait"` globally, and `"ios": { "supportsTablet": true }`. GameScreen.tsx:190 computes `landscape = width > height * 1.15` and builds an entire second layout (split columns, ScrollView left pane, different cellSize maths at :194-197) that on iOS and Android can never render. | Either set `"orientation": "default"` (the responsive layout already handles both, and a tablet with `supportsTablet: true` really should rotate) — or delete the landscape branch and the `Left`/`splitLeft`/`splitRight` machinery. Do not leave both. |
| medium | medium | Share codes are far too long for the medium they target | share.ts encodes `{v, r, m, a: Action[]}` as JSON then URL-safe base64. Measured: a 40-action game is ~2,400 characters; a 120-action multiverse game is ~7,000. links.ts:22 then puts that whole string into a `?code=` query parameter. | Replace the JSON payload with a compact byte encoding — every action fits in 2-4 bytes (a 3-bit type tag plus small varints for timeline/col/row/turn), the Rules struct is 3 bits, and the version is one byte — which brings a 120-action game to roughly 300 base64 characters, about a 20x reduction. Keep the `5DC4.` prefix and bump the payload version so old codes still load. |
| low | large | No i18n layer | Every user-facing string is inline in the components: the nine Rule blocks in Modals.tsx:51-92, the eleven-branch hint ladder in GameScreen.tsx:301-330, narrate.ts's action sentences, all the puzzle briefs and hints, LEVEL_HINTS in NewGameModal.tsx:17. | If localisation is ever wanted, do it before the shared-package extraction, not after: route strings through a single `strings.ts` per app with an `expo-localization` locale lookup. If it is never wanted, say so in CLAUDE.md so nobody starts. |
| low | small | No crash reporting or opt-in telemetry | Nothing. A crash on a player's device is invisible; there is no way to know which bot level or which variant people actually play. | Add `expo-insights` or Sentry behind an explicit opt-in toggle in the existing Settings sheet (a new Row under a 'Privacy' Section), defaulting to off, and document it in PRIVACY.md. |
| low | small | TypeScript 6 and Jest 29 are a major behind; Expo SDK 57 is current | typescript ~6.0.3 (latest 7.0.2), jest ~29.7.0 (latest 30.5.1), jest-expo 57.0.5. expo ~57.0.20 with 57.0.21 published and SDK 58 still in canary; react-native 0.86.3 and react 19.2.3 are the versions SDK 57 pins. | Leave expo/react-native/react exactly where they are — they are correct for SDK 57, and `npx expo install --check` is the only right way to move them. Try TypeScript 7 and Jest 30 independently (jest-expo 57 works against both); if TS 7 trips on `expo/tsconfig.base`, stay on 6 and revisit at SDK 58. Add an `engines: { node: '>=22' }` field and a .nvmrc matching the CI's Node 22 so local and CI agree. Add `npx expo-doctor` to CI to catch SDK-version drift automatically. |

- **De-duplicate against multidcheckers: one workspace with a parameterised multiverse core** (high value, large, `src/engine/multiverse.ts, src/app/*, src/ui/*Modal.tsx`). Every feature in the 14-commit history had to be written twice, and every fix from here on will too — the sibling has already diverged on the accessibility fix (multidcheckers/src/ui/MultiverseMap.tsx uses colors.playerAccent for the turn/timeline labels; this repo still uses colors.players, which is the 1.44:1 contrast bug below). Duplication is the single largest tax on this codebase and the one thing that will keep getting worse.
- **No ESLint at all, despite four react-hooks/exhaustive-deps suppressions** (high value, small, `package.json`). The suppressions are load-bearing lies: the bot-turn effect at GameScreen.tsx:261 deliberately omits `game` from its deps, and that closure is exactly where the replay-drives-the-live-bot bug lives. react-hooks lint is the tool that flags this class of stale-closure/incomplete-dep hazard, and it currently runs nowhere. It also costs nothing — Expo ships the config.
- **Contrast failures: raw piece colours used as text colour** (high value, small, `src/ui/theme.ts, src/ui/MultiverseMap.tsx, src/ui/Modals.tsx`). Two of the four piece sets are unreadable in one scheme or the other, and the app ships a colour-blind 'piece markings' setting while its own text fails basic contrast. A derived test is the only way this stays fixed across five skins and four piece sets in two schemes.
- **Accessibility gaps beyond contrast** (high value, medium, `src/ui/ReplayBar.tsx, src/ui/Modals.tsx, src/ui/GameScreen.tsx`). The game's core state — whose turn it is, how many boards still wait, that someone just won — reaches a screen-reader user only if they re-explore the screen. Reduced motion matters here more than usual: a whole board rotating 90° plus a token flying across the map is exactly the vestibular trigger the setting exists for.
- **CI has no lint, no e2e, and no audit; actions unpinned and over-privileged** (high value, medium, `.github/workflows/ci.yml`). The engine is well tested and the shell is not tested at all, so CI currently proves the rules are right and nothing about whether the app runs. A web smoke test is cheap because the web export already builds in CI, and it would have caught the replay/bot bug. Publishing the web build is what makes 'play by message' usable for someone who has not installed the app.
- **Jest testMatch excludes .tsx, so component tests cannot be added** (high value, small, `package.json`). The controller that decides what a tap does, when the bot moves, how undo rewinds past bot replies and how a puzzle is scored is 341 lines with zero tests, and the config makes adding UI tests a config change rather than a file.
- **Do not run `npm audit fix --force`; pin uuid via overrides instead** (medium value, trivial, `package.json`). Every one of the 11 findings is in prebuild/Xcode-project tooling that never ships inside the app binary or the web bundle, so the real risk is near zero — but the automated fix path would destroy the project. Writing the decision down is worth more than the fix.
- **expo-sharing is a declared dependency that is never imported** (medium value, trivial, `package.json`). It is a native module linked into every iOS and Android build for nothing, and it is one of the two paths by which the uuid advisory reaches this project. Removing it shrinks the native build surface and cuts the audit noise.
- **No Dependabot or Renovate** (medium value, trivial, `.github/dependabot.yml`). Expo SDK-pinned packages must not be bumped independently, so an ungrouped, unfiltered Dependabot would be pure noise here; a configuration that watches the actions and the non-Expo devDependencies is the useful part.
- **Missing LICENSE, SECURITY.md, CHANGELOG, CONTRIBUTING, PRIVACY** (medium value, trivial). The privacy policy is a hard blocker for App Store and Play submission, and this app has the easy version of it: nothing leaves the device.
- **app.json is missing the app-store readiness fields** (medium value, small, `app.json`). Everything else about this project is store-ready (icons, EAS profiles, bundle identifiers, a store seam); these are the remaining items that block or delay an actual submission.
- **orientation is locked to portrait, so the landscape split layout is web-only dead code** (medium value, trivial, `app.json, src/ui/GameScreen.tsx`). A whole layout path that ships in the bundle, is maintained, and cannot execute on the two target platforms. The commit that added it ('Add landscape layout, CI workflow, EAS profiles...') clearly intended it to work.
- **Share codes are far too long for the medium they target** (medium value, medium, `src/app/share.ts`). The whole 'play by message' feature depends on the code being pasteable into a chat; a 7,000-character blob is not, and links of that length get mangled or truncated by several chat clients. The engine already validates by replaying actions, so a denser encoding changes nothing about the trust model.
- **No i18n layer** (low value, large). The text is a real part of this product — the hint ladder is what teaches the rules — which makes it both the most valuable thing to translate and the most expensive to retrofit once it is spread across a shared package plus two apps.
- **No crash reporting or opt-in telemetry** (low value, small). The engine throws IllegalAction in a dozen places and the UI swallows every one of them into a hint line (useGame.ts:145-148); a bot that picks an action the engine then rejects would be silently invisible in production. Opt-in keeps the 'collects nothing' privacy story intact.
- **TypeScript 6 and Jest 29 are a major behind; Expo SDK 57 is current** (low value, small, `package.json`). The platform stack is genuinely up to date, which is worth stating so nobody 'upgrades' it; the two that are behind are dev-only and safe to move independently. expo-doctor is the cheap guard that keeps it that way.

## Features worth adding

- **A guided, forced-move tutorial for the one rule nobody gets** (high value, medium). The WelcomeModal's three static pages plus a nine-puzzle list is a lot of reading before the branching rule clicks. Add `src/puzzles/tutorial.ts` exporting a scripted sequence of steps — each `{ state, allowedActions: Action[], caption }` — and a `mode: 'tutorial'` in GameSetup (setup.ts:9). useGame gains an `allowed` filter that rejects anything not in `allowedActions` with the caption as the error, so the player physically performs the drop, the spin, the pick-up, the travel and the answer on the branched board, in order, and cannot get lost. Hook it in from WelcomeModal's existing 'Try a puzzle first' button (GameScreen.tsx:493) and add a 'Tutorial' item to MenuModal. Reuse the existing welcomeDemo builder at GameScreen.tsx:117 for the starting position.
- **The 'show me' button the puzzle data already promises** (high value, small). Puzzle.solution exists and its doc comment at puzzles/index.ts:34 says it is 'used by the tests and the "show me" button' — but no such button exists; solution is referenced only from puzzles.test.ts. Add a third state to the existing hint control at GameScreen.tsx:405 (Brief → Hint → Show me) that plays `puzzle.solution` into the board one action at a time using the same animateSpin/commit path the bot uses, then offers 'Try it yourself' which calls game.restart(). Mark the puzzle as solved-with-help in ProgressProvider (progress.tsx) so the StatsModal count stays honest.
- **Async online play over a tiny relay** (high value, large). share.ts already defines the entire wire format — a game is its action list, and decodeGame re-validates every action through the engine, so the server never needs to know the rules. Add an optional relay: POST the code to `/g/<id>`, GET it back, and poll. Hooks in at ShareModal.tsx as a third option beside Copy and Share ('Play online'), with the game id persisted in GameSetup (setup.ts). Because the engine validates on load, a compromised relay can at worst serve a stale or invalid game, never an illegal one — which is why this is the cheapest possible online mode for this app.
- **Daily challenge with a streak** (high value, medium). A date-seeded position (seed the puzzle generator from the UTC date so everyone gets the same one), one attempt, a result line shaped for pasting into a chat — the same pattern the owner already built as daily.ts in chesscheatser. Hooks in as a new MenuModal item and a `mode: 'daily'` in GameSetup, with streak counters folded into the existing Stats type (stats.tsx:13) and shown in StatsModal. It is the one feature that gives a two-player-plus-bot game a reason to be opened every day.
- **Threat markers on the multiverse map** (high value, small). Late-game the map holds a dozen boards and the player has to re-examine each one. bot.ts already computes exactly what is needed: `winningColumns(board, player)` (bot.ts:134) and the mine===3 && empty===1 term in boardScore. Export a small `threatsOn(board): { player, count }` and have MiniBoard draw a coloured pip for a board where someone has an immediate win — behind a Settings toggle so it does not spoil the puzzle for purists. This is the single change that would most reduce the 'I lost because I did not look at board seven' failure.
- **Board size and win length as rule variants** (medium value, small). board.ts already parameterises everything: `emptyBoard(cols = COLS, rows = ROWS)` takes dimensions and every function reads `board.cols`/`board.rows`, but `newGame()` (multiverse.ts:104) always calls `emptyBoard()` with no arguments, and WIN_LENGTH is a module constant used only in findLines. Add `size: { cols, rows }` and `winLength` to the Rules interface (multiverse.ts:60), thread winLength through findLines/winnerOf, and add the rows to the existing Variants section of SettingsModal (GameScreen.tsx:517). A 5x5 connect-four multiverse is a much faster game, and a 8x7 connect-five is a much slower one; both come almost free.
- **Share the finished multiverse as an image** (medium value, medium). MultiverseMap already knows how to lay every board out on a grid with branch connectors. Render the same layout to an off-screen view and capture it (react-native-view-shot, or a canvas path on web) to produce a picture of the whole multiverse with the winning four ringed — then feed it to the Share sheet ShareModal.tsx:35 already opens. A tree of boards with a branch is a far better advert for this game than a 2,400-character code, and it is the natural companion to the daily challenge.
- **A genuinely stronger bot, run off the render path** (medium value, medium). chooseAction is one ply plus an immediate-win/fork probe (bot.ts:216-235), and it samples travels away above MAX_CANDIDATES=90 (bot.ts:182), so Paradox is beatable by anyone who plans two moves. Add a level 4 with a real depth-limited alpha-beta over the existing `evaluate`, and move the search off the UI thread: the effect at GameScreen.tsx:261 currently calls chooseAction synchronously inside a setTimeout, which will visibly jank once a multiverse has ten timelines. An InteractionManager yield loop (the pattern used as chooseMoveAsync in the owner's chesscheatser) is the minimal fix.
- **Move list and jump-to-move in replay** (medium value, small). ReplayBar has step/first/last transport and one narration line, but a 60-move multiverse is unnavigable one arrow at a time. Add a scrollable list beside the bar built from `narrate(history[i])` for each i, with the current index highlighted and tap-to-seek calling the existing onSeek. Everything needed already exists — narrate.ts renders any state, and history is the full state array.
- **Redo, to match undo** (medium value, trivial). useGame.undo (useGame.ts:238) truncates history and, against a bot, rewinds through the bot's replies as well — but there is no way back. Keep the truncated tail in a `future` state, clear it on any new commit, and expose `redo`/`canRedo` beside `undo`/`canUndo`; add the button next to Undo in the header (GameScreen.tsx:352). Given that undo against a bot can silently discard several bot moves, redo is what makes it safe to press.
- **Achievements over the stats already collected** (low value, small). StatsProvider already tracks games, per-bot win/loss records, total time travels, biggest multiverse and longest game (stats.tsx:13-22). Add a list of named achievements derived from those plus a few new counters ('win on a board you created', 'win by spinning', 'beat Paradox without travelling', 'six timelines alive at once') and show them in the existing StatsModal. Purely additive — the summarise function at stats.tsx:32 is the only place that needs to change.

## Code quality

- **Opening the replay of a bot game commits bot moves into the live game** (high value, small, `src/ui/GameScreen.tsx`). Line 79 defines `const humanTurn = game.humanTurn && !replaying;` so humanTurn is false during a replay. The bot effect at line 261 guards with `if (!bot || humanTurn || spinning || state.status !== 'playing') return;` — during a replay that guard does not fire. It then reads `state`, which line 77 has rebound to `game.history[replayIndex]` (a historical state), calls `chooseAction(state, bot.level)` on it, and passes the result to `game.play`, which is useGame's `commit` and applies it to the LIVE state. Reproduce: start a game against a bot playing Red, make no moves, open Menu → 'Replay this game' — replayIndex 0 is the opening position with toMove === bot.player and status 'playing', so 600ms later a bot action is committed into the live game behind the replay overlay. If the live game has already ended, applyAction throws 'the game is over', which commit swallows into feedback.nope() and an error line. The same path also fires for puzzles, which always set bot: { level: 3 }. Fix: guard the effect on `!replaying` explicitly and use `game.state`, not the shadowed `state`, inside it. Add a regression test in src/ui/__tests__/useGame.test.ts (once testMatch allows it) or a GameScreen render test asserting history.length is unchanged after entering replay.
- **MiniBoard's React.memo is defeated on every render, so the whole map re-renders** (high value, small, `src/ui/MultiverseMap.tsx`). MiniBoard is wrapped in React.memo (MiniBoard.tsx:23) and its `board` prop has stable identity because boards are immutable — but MultiverseMap.tsx:163 passes `onPress={() => onPressBoard(ref)}`, a fresh closure every render, and :164 builds a fresh template-literal accessibilityLabel, so memo never hits. Every state change therefore re-renders every board of every timeline: a ten-timeline, thirty-turn multiverse is ~300 MiniBoards of 42 Views each. Fix: pass `ref` plus a stable `onPress: (ref) => void` and call it from inside MiniBoard, or memoise the per-ref handler; and compute the label only when it changes (it depends on tl.id/turn/isPending/isTarget, all cheap to key on). This is the most likely source of late-game input lag and it costs nothing to fix.
- **GameScreen.tsx is 627 lines doing eight unrelated jobs** (high value, medium, `src/ui/GameScreen.tsx`). One component holds: replay state, deep-link handling (:92-116), the welcome-page content and its demo multiverse (:117-155), the debounced autosave (:172-180), stats recording (:82-90), responsive sizing (:190-198), the spin/flip animation controller (:200-224), the bot turn loop (:226-268), the eleven-branch hint ladder (:301-330), the puzzle result state machine (:230-244) and the wiring of eleven modals. Extract at least: `useDeepLinkCode(onCode)`, `useAutosave(history, setup)`, `useBotTurn(game, bot, animateSpin)` and `useReplay(history)` as hooks, and `hintFor(state, selection, ...)` as a pure function in a new file (which also makes the hint ladder testable). The bot-turn extraction is what would have made the replay bug above obvious, because the hook would have to be handed the live state explicitly.
- **Zero tests above the engine: the game controller and every app module are uncovered** (high value, medium, `src/ui/useGame.ts`). 848 lines of engine tests, nothing else. Specifically missing: (1) src/ui/__tests__/useGame.test.ts — undo rewinding past a run of bot replies (useGame.ts:244-249), focus following the created board vs the next pending board (:138-143), selection state machine none→disc→target and cancel restoring focus (:153-236), movesUsed counting only the player's own actions in puzzle mode (:111-116); (2) src/app/__tests__/stats.test.ts for `summarise` (stats.tsx:32) — the bot-key derivation, the human-side inference `setup.bot.player === 0 ? 1 : 0`, and mostTimelines/longestGame maxima; (3) src/app/__tests__/links.test.ts for `codeFromUrl` — the `?code=`, `#code=`, `/load/<code>` and malformed-percent-escape branches (links.ts:5-17); (4) src/app/__tests__/setup.test.ts for looksLikeSavedGame/normaliseSaved across v1 and v2 envelopes; (5) src/app/__tests__/narrate.test.ts covering all five action types plus the endTurn attribution flip (narrate.ts:7). Every one of these is a plain .ts module with no React Native imports, so they run under the existing jest-expo config today.
- **Modal chrome is copy-pasted into eight files** (medium value, small, `src/ui/Modals.tsx`). The identical `backdrop` and `sheet` (and usually `title`, `body`) StyleSheet entries appear in Modals.tsx:167-180, MenuModal.tsx, NewGameModal.tsx:83-87, SettingsModal.tsx:140-142, ShareModal.tsx:98-100, StatsModal.tsx, WelcomeModal.tsx (with a different backdrop alpha, 0.88 vs 0.85 — an unintended divergence), PuzzlesModal.tsx and PuzzleResultModal.tsx, along with the same `<Modal transparent animationType onRequestClose><View backdrop><View sheet>` wrapper. Extract a single `<Sheet title=… onClose=…>` component in Modals.tsx and have all nine use it. This is also the natural place to add accessibilityViewIsModal and a dismiss-on-backdrop-tap once, and it is a clean unit of the shared package proposed above.
- **The map re-implements engine rules instead of calling them** (medium value, trivial, `src/ui/MultiverseMap.tsx`). Line 131-132 recomputes whether a board is pending — `state.status === 'playing' && isLatest && playerToMoveAt(turn) === state.toMove && !boardIsFull(board.cells)` — duplicating the engine's isPending/pendingTimelines (multiverse.ts:172, :209). Line 185's local `boardIsFull` (every cell non-null) duplicates the engine's `isFull` (board.ts:67, which asks whether any column has room); they agree only because boards are always settled, which is an invariant nothing states. Import isPending and isFull instead. Duplicated rule logic in the view is exactly the thing that will silently disagree when a new variant lands.
- **The shipped bot loop and the tested bot loop are different code** (medium value, small, `src/engine/bot.ts`). `playTurn` (bot.ts:243-254) plays a bot's whole turn and returns the intermediate states; it is imported only by bot.test.ts:62. The app does not use it — GameScreen.tsx:261 re-drives the bot one action per effect fire so it can animate spins between them. So the loop that is tested is not the loop that ships, and the loop that ships (including its 64-iteration-equivalent absence of any guard) is untested. Either make GameScreen consume playTurn's steps, or delete playTurn and test the shipped loop.
- **The saved game is restored verbatim and trusted** (medium value, small, `src/app/setup.ts`). `looksLikeSavedGame` (setup.ts:25) only checks the envelope — version is 1 or 2 and history is a non-empty array — then App.tsx:23 hands the raw parsed objects to useGame as GameState[]. Nothing validates the interior, so a truncated or corrupt AsyncStorage write produces a render crash (getBoard/getTimeline/state.timelines[0].boards[0] all index blindly) with no error boundary anywhere in the tree. Two options, both cheap: persist the action list instead of the state list and rebuild via applyAction on load — decodeGame (share.ts:38-45) already does exactly this and gets validation for free, and it would shrink the saved blob by an order of magnitude — or add a validating restore plus an ErrorBoundary around GameScreen that offers 'start a new game'.
- **Unexplained magic numbers in the bot and the screen** (medium value, small, `src/engine/bot.ts`). bot.ts carries `MAX_CANDIDATES = 90` (:182), the evaluation weights 12 and 3 (:94-95), the penalties -5000 for a losing reply and -2500 for a fork (:222-223), the -4 travel/pop cost (:226), the 0.5 tie-break noise (:227), the 0.75 chance a Novice blocks (:209) and the 64-iteration guard (:247). GameScreen adds the 600ms bot delay (:268), the 250ms save debounce (:174), the 380/520/650ms animation durations and the 0.36/0.6/26/56 cell-size bounds (:194-197). None is derived or explained. At minimum give each a named constant with a one-line rationale; the bot weights in particular deserve the treatment the owner gave chesscheatser's POWER_THRESHOLDS — a simulate script that plays level N against level N-1 and reports the win rate, so a weight change can be judged rather than guessed.
- **Dead exports and a dead branch** (low value, trivial, `src/engine/types.ts`). `PLAYER_NAMES` (types.ts:5) is exported and never imported — names come from the piece set's `names` (theme.ts:91). `playerColor` (theme.ts:156) is exported and never used. In share.ts:46, `payload.m === 'bot' ? { mode: 'local' } : DEFAULT_SETUP` — both arms produce `{ mode: 'local' }` since DEFAULT_SETUP is exactly that (setup.ts:17), so the `m` field written at share.ts:24 is never usefully consumed; either drop it from the payload or make it do something. Finally, bot.ts:112-113 carries the comment 'Each extra board the opponent must answer is a small burden on them' immediately above `return total;` — the described term was never implemented, so the comment misdescribes the evaluation.
- **decodeGame will replay an unbounded action list synchronously** (low value, trivial, `src/app/share.ts`). decodeGame (share.ts:28) loops over `payload.a` with no length cap, calling applyAction for each. A pasted or linked code containing tens of thousands of actions freezes the UI thread; base64.ts's `decode` similarly builds an unbounded byte array from an arbitrary-length input. The trust model is otherwise sound (illegal moves are rejected by replay, which is the right design and worth keeping), so the fix is one bound: reject payloads above a few thousand actions with the existing 'That code is from a version this app cannot read' style of message. Add it to share.test.ts, which already covers junk and illegal codes.
- **The share code is re-encoded on every move even when nothing is sharing** (low value, trivial, `src/ui/GameScreen.tsx`). Line 155's `shareCode` useMemo depends on `[game.history, game.setup]`, so every single move JSON-stringifies and base64s the entire game — ~7KB of string work per move in a long game — for a value only ShareModal reads, and only when it is open. Gate it on `shareOpen || !!link`, or compute it inside ShareModal from a passed-in history.
- **The multiverse map's flight animation hand-mirrors the layout maths** (low value, small, `src/ui/MultiverseMap.tsx`). The travel-token flight computes its endpoints at lines 57-58 as `(turn + 1) * SLOT + MINI_WIDTH / 2` and `HEADER + timeline * ROW + 8 + MINI_HEIGHT / 2`, replicating by hand what the render produces from `styles.slot { top: 8 }` inside `styles.timelineRow { height: ROW }` at `left: (turn + 1) * SLOT` (line 157) under the HEADER-high turn row. The magic `+ 8` appears in four places. Any change to slot padding or the header height silently sends the token to the wrong board with no test to catch it. Extract `centreOf(ref): { x, y }` and use it for both the animation and the slot positions.

## Shared across all Platteration repositories

The same gaps recur in every repository; fixing them once as a template and copying it is cheaper than fixing them fourteen times.

### CI and supply chain

1. **No workflow sets `permissions:`** (except the two Pages deploy jobs). Add `permissions: { contents: read }` at the top of every workflow so the `GITHUB_TOKEN` handed to third-party actions cannot write to the repository.
2. **No action is pinned to a commit SHA** (0 of 50 `uses:` lines across the fourteen repositories). `actions/checkout@v4` follows a movable tag; pin to the full 40-character SHA with the version in a comment, and let Dependabot bump it.
3. **No repository has Dependabot or Renovate.** Add `.github/dependabot.yml` with `npm` (or `pip`) and `github-actions` ecosystems, weekly.
4. **No CI step runs `npm audit`** (two workflows pass `--no-audit` explicitly). Add `npm audit --audit-level=high` after `npm ci`; for the Expo apps the current transitive advisories are build-time only (`uuid` via `xcode` via `@expo/config-plugins`), so gate on `high` rather than `moderate` until Expo ships the fix.
5. **`tvsham` runs `npm ci || npm install` in CI and in its Dockerfile.** The fallback silently discards the lockfile guarantee; drop it and fix the lockfile instead.
6. **`selfreportle`, `simplacad` and `phonogeometry` have no lockfile** and install Playwright ad hoc in CI. Add a `package-lock.json` (even with devDependencies only) and use `npm ci`.
7. **Enable secret scanning and push protection** in each repository's settings; nothing is committed today, and this keeps it that way.

### Repository hygiene

8. **Ten repositories have no `LICENSE`** (battleshiple, collectcollect, drawdraw, multidcheckers, multidconnect4, notenote, randostats, selfreportle, simplacad, tvsham). Without one, nobody else may legally use or contribute to the code. The siblings that have one use MIT.
9. **Only `simplacad` has a `SECURITY.md`.** Copy it to the others with a private reporting address.
10. **No repository has a `main` branch.** In all fourteen the default branch is the original `claude/...` feature branch, so branch protection, Dependabot targets and the two GitHub Pages workflows (`abientnoiser`, `chesscheatser` both trigger on `main`/`master`) all point at a branch that does not exist; those deploys have never run. Create `main` from the current branch, make it the default, and protect it.
11. **`drawdraw` is the one repository still on Expo SDK 53** (the rest are on 57). Its eight high-severity `npm audit` findings (`image-size`, `metro`) disappear with the SDK upgrade; it is also the only app not written in TypeScript and the only one pinned to Node 20 in CI.
12. **`multidcheckers` and `multidconnect4` are near-identical copies** (same branch name, same 65-file layout, same dependencies). The timeline/multiverse engine, persistence and share code should live in one shared package so fixes land in both.

### A hardened workflow to copy

```yaml
name: CI
on:
  push:
    branches: ["**"]
  pull_request:
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@<full-sha> # v4
      - uses: actions/setup-node@<full-sha> # v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npm audit --audit-level=high
      - run: npm run lint --if-present
      - run: npm run typecheck --if-present
      - run: npm test
```

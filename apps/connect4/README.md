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
  piece sets that also rename the sides; colour-blind markings on discs.
- **Feel.** Haptics and short synthesized sounds, both switchable. A falling
  animation for discs and a turning animation for spins.
- **Your record.** Games played, wins against each bot, time travels made,
  biggest multiverse, longest game, and puzzles solved.
- **A welcome on first launch** that shows the one idea that matters, with a
  real tiny multiverse, and offers the puzzles.
- **Links.** A game code also loads from a link: `?code=` on the web build
  and the app's own scheme on a device.
- **Fits the screen.** Portrait stacks the board over the map; wide screens
  put them side by side. The map draws a line from each branch to the board
  it split off, and a time travel flies a token across it.
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

## Building and shipping

`.github/workflows/ci.yml` runs the typecheck, the tests, and a web export
on every push. `eas.json` has development, preview, and production profiles
for [EAS Build](https://docs.expo.dev/build/introduction/). The icons in
`assets/` are generated, so replace them with real artwork before a store
release.

## Running it

```sh
npm install
npm start          # Expo dev server; scan the QR code with Expo Go
npm run ios        # iOS simulator (macOS)
npm run android    # Android emulator or device
npm run web        # in a browser
```

Quality checks:

```sh
npm test           # engine unit tests (jest-expo)
npm run typecheck  # tsc --noEmit
```

To produce store builds use [EAS Build](https://docs.expo.dev/build/introduction/)
(`npx eas build --platform ios|android`). The bundle identifiers are set in
`app.json`.

## Project layout

```
App.tsx                    entry: safe area + status bar + GameScreen
src/engine/types.ts        players, board references, turn parity
src/engine/board.ts        one Connect Four board: gravity, removal, spinning, lines
src/engine/multiverse.ts   timelines, pending boards, time travel, rules, win/draw
src/engine/bot.ts          the three-level computer opponent
src/engine/__tests__/      unit tests for the rules, bots, puzzles, and game codes
src/puzzles/index.ts       the puzzle set (each verified by a test)
src/app/settings.tsx       persisted settings (theme, skin, sound, variants)
src/app/theme.tsx          resolves settings into the palette screens draw with
src/app/persist.ts         AsyncStorage helpers; app/progress.tsx for puzzle progress
src/app/share.ts           game codes for play by message (app/base64.ts)
src/app/purchases.ts       the store seam; app/entitlements.tsx gates premium looks
src/app/feedback.ts        haptics and sounds (app/sound.ts)
src/ui/useGame.ts          game controller hook: history/undo, selection, bot turns
src/ui/GameScreen.tsx      screen layout, status text, bot loop, replay
src/ui/DiscBoard.tsx       the big tappable board with the falling-disc animation
src/ui/MiniBoard.tsx       board thumbnails for the map
src/ui/MultiverseMap.tsx   the timeline map (rows = timelines, columns = turns)
src/ui/*Modal.tsx          menu, rules, settings, new game, puzzles, share, extras
```

The engine is pure TypeScript with no React dependency, so the rules can be
tested (and reused, e.g. for an AI opponent or online play) without the UI.

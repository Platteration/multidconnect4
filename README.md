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
src/engine/multiverse.ts   timelines, pending boards, time travel, win/draw
src/engine/__tests__/      unit tests for the rules
src/ui/useGame.ts          game controller hook: history/undo + selection flow
src/ui/DiscBoard.tsx       the big tappable board
src/ui/MiniBoard.tsx       board thumbnails for the map
src/ui/MultiverseMap.tsx   the timeline map (rows = timelines, columns = turns)
src/ui/Modals.tsx          rules and game-over sheets, shared Button
src/ui/GameScreen.tsx      screen layout and status text
```

The engine is pure TypeScript with no React dependency, so the rules can be
tested (and reused, e.g. for an AI opponent or online play) without the UI.

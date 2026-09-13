# 5D Tic-Tac-Toe

Noughts and crosses with multiverse time travel — the smallest of the three
games here, and the one where the mechanic *is* the game.

## Rules

- A timeline is a sequence of boards, one per turn. X moves on even turns, O on
  odd turns.
- On your turn you must play on **every** board marked "play". Only then does
  the turn pass.
- A move is either a mark on an empty cell, or a **time travel**: pick up one of
  your own marks on the newest board and send it to the same cell of a past
  board where that cell was still free and it was also your move. That past
  board branches into a brand-new timeline, and your opponent now has one more
  board to answer on.
- The mark you send is gone from the present, so a travel can undo your own line
  as easily as it makes one somewhere else.
- **Three in a row on any board, in any timeline, wins the whole game.**
- Every board full with nobody connected is a draw, and so is a game that
  reaches thirty moves each without a line — two players who only ever travel
  would otherwise play forever.

### Variant

- **Strict present** (the real 5D Chess rule): only boards at the present — the
  earliest "now" anywhere — must be played. Boards ahead of it are optional, and
  you end your turn yourself.

## Layout

- `src/engine` — the rules. Pure TypeScript, no React. `board.ts` is this game's
  own; `multiverse.ts` is the adapter that hands it to `@5d/core`; `bot.ts` is
  the heuristic behind the shared bot loop.
- `src/app` — game codes, the record, the replay narration.
- `src/ui` — the board, the thumbnails, the screen.
- `src/puzzles` — hand-made positions, each proved solvable by the tests.

## Commands

```sh
npm start          # Expo dev server
npm test           # jest-expo unit tests
npm run typecheck  # tsc
```

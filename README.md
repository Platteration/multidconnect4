# 5D Games

A monorepo of multiverse time-travel parody games: simple board games where every
move creates a new board, and pieces can be sent into the past to branch a new
timeline.

- `packages/multiverse-core` — the shared engine, app services and UI chrome.
- `apps/connect4` — 5D Connect Four.
- `apps/checkers` — 5D Checkers.
- `apps/tictactoe` — 5D Tic-Tac-Toe, the smallest of the three and the best
  place to learn the mechanic.

## The shared half

Everything that is about the multiverse rather than about a board lives in
`@5d/core`, behind three entry points:

| Entry | What is in it | Rule |
|---|---|---|
| `@5d/core` | timelines, turns, travel, the bot's loop, game codes | never imports React Native |
| `@5d/core/app` | storage, settings, sound, haptics, purchases, progress | React Native |
| `@5d/core/ui` | the palette, the chrome, the multiverse map, the two hooks a screen needs | React Native |

A game supplies a `GameAdapter`: what a board is, what a move does to one, who
can travel where, and what counts as a win. `bindMultiverse(adapter)` hands back
the whole engine, typed for that game. `bindBot(engine, brain)` does the same for
the opponent, and `useMultiverseGame` / `useGameShell` for the screen.

What stays per game is the board module, the board on screen, and the words.

Three things are shared that a player actually sees, so each of them landed in
all three games at once:

- **Today's challenge** — one generated position a day, the same for everyone,
  with a move that wins. It is built by walking a game forward with the date as
  the seed and stopping where the engine says a move wins, so it needs no
  server and can't be unsolvable.
- **Badges** — read off a finished game without looking inside a board: a
  travel is the action that made two boards at once, a branch win is a win on a
  timeline that didn't exist at the start.
- **A coached first game** — four steps that wait until you have actually done
  the thing, rather than three pages of text.

## Working on it

```sh
npm install
npm run typecheck            # every workspace
npm test                     # every workspace
npm start --workspace apps/tictactoe
```

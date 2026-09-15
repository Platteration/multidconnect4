/**
 * Hand-made puzzles. Each one is a position plus a goal: win within so many
 * of your own actions. Positions are written out as three rows of text; the
 * tests replay every solution to prove it works.
 */
import { DAILY_PREFIX } from '@5d/core';
import { Action, Board, GameState, Player, Rules, boardFromRows, newGame } from '../engine';
import { dailyPuzzle } from './daily';

export interface Puzzle {
  id: string;
  title: string;
  /** One line shown above the board. */
  brief: string;
  /** Longer nudge shown on request. */
  hint: string;
  state: GameState;
  /** The side the person plays. */
  player: Player;
  /** How many of the player's own actions may be used. */
  within: number;
  /** 'win' (default): win within the budget. 'survive': still be alive after it. */
  goal?: 'win' | 'survive';
  /** The key move(s). The finish may be any immediate win. */
  solution: Action[];
}

/** A single timeline whose boards are given oldest first; the last one is "now". */
function fromBoards(boards: Board[], rules: Partial<Rules> = {}): GameState {
  const base = newGame(rules);
  const toMove = ((boards.length - 1) % 2) as Player;
  return {
    ...base,
    toMove,
    timelines: [{ id: 0, startTurn: 0, boards, createdBy: null, branchedFrom: null, origin: null }],
  };
}

const rows = (r: string[]) => boardFromRows(r);
const EMPTY = rows(['...', '...', '...']);

export const PUZZLES: Puzzle[] = [
  {
    id: 'warmup',
    title: 'Warm-up',
    brief: 'X to move. Finish the row.',
    hint: 'Two of yours sit side by side along the top.',
    player: 0,
    within: 1,
    state: fromBoards([EMPTY, EMPTY, rows(['xx.', 'oo.', '...'])]),
    solution: [{ type: 'mark', timeline: 0, cell: 2 }],
  },
  {
    id: 'past',
    title: 'The past is not fixed',
    brief: 'X to move. Nothing wins here — but something wins back there.',
    hint: 'Your corner mark is in the way now. It was not, two turns ago.',
    player: 0,
    within: 1,
    state: fromBoards([rows(['x..', '.x.', '...']), rows(['x.o', '.x.', '...']), rows(['x.o', '.x.', 'o.x'])]),
    solution: [{ type: 'travel', from: { timeline: 0, cell: 8 }, to: { timeline: 0, turn: 0 } }],
  },
  {
    id: 'fork',
    title: 'Two ways to win',
    brief: 'X to move. Block them, and set up two threats at once.',
    hint: 'The bottom left corner does both jobs.',
    player: 0,
    within: 2,
    state: fromBoards([EMPTY, EMPTY, rows(['x.o', '.o.', '..x'])]),
    solution: [{ type: 'mark', timeline: 0, cell: 6 }],
  },
];

export function puzzleById(id: string): Puzzle | undefined {
  // The daily is generated from its own date rather than listed here, so that
  // restarting or retrying it gives back the same position.
  if (id.startsWith(DAILY_PREFIX)) return dailyPuzzle(id.slice(DAILY_PREFIX.length)) ?? undefined;
  return PUZZLES.find((p) => p.id === id);
}

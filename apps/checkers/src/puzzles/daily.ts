/**
 * Today's challenge. The position is generated from the date, so everyone
 * playing on the same day gets the same one, and it always has exactly one
 * move that wins.
 *
 * Checkers is won by clearing a side off a board, which no ordinary opening
 * reaches, so the walk starts from a thinned endgame rather than a full board.
 */
import { DAILY_PREFIX, Rng, generateDaily, todayIso } from '@5d/core';
import {
  Board,
  GameState,
  SIZE,
  Spec,
  emptyBoard,
  engine,
  enumerateActions,
  index,
  isPlayable,
  newGame,
  placePiece,
} from '../engine';
import { Puzzle } from './index';

/**
 * No travel days here. A travel takes one of YOUR pieces off the present board
 * and puts it on a past board where the opponent still has all of theirs, so
 * it can almost never be the move that wins outright — unlike Connect Four,
 * where the arriving disc can complete a line, or tic-tac-toe, where it can
 * complete a row. Checkers gets its variety from the position instead.
 */
const TRAVEL_DAYS: number[] = [];

/** A handful of pieces on dark squares, Red to move. */
function thinnedStart(rng: Rng): GameState {
  const reds = 2 + Math.floor(rng() * 2); // 2 or 3
  const blacks = rng() < 0.6 ? 2 : 1;
  let board: Board = emptyBoard();
  const taken = new Set<number>();
  const place = (player: 0 | 1, king: boolean) => {
    for (let tries = 0; tries < 40; tries++) {
      const row = Math.floor(rng() * SIZE);
      const col = Math.floor(rng() * SIZE);
      const at = index(row, col);
      if (!isPlayable(row, col) || taken.has(at)) continue;
      const next = placePiece(board, at, { player, king });
      if (!next) continue;
      board = next;
      taken.add(at);
      return;
    }
  };
  for (let i = 0; i < reds; i++) place(0, rng() < 0.4);
  for (let i = 0; i < blacks; i++) place(1, rng() < 0.2);

  return {
    ...newGame(),
    timelines: [{ id: 0, startTurn: 0, boards: [board], createdBy: null, branchedFrom: null, origin: null }],
  };
}

const cache = new Map<string, Puzzle | null>();

export function dailyId(iso: string): string {
  return `${DAILY_PREFIX}${iso}`;
}

/** The puzzle for one day, or null if no position could be found for it. */
export function dailyPuzzle(iso: string = todayIso()): Puzzle | null {
  const hit = cache.get(iso);
  if (hit !== undefined) return hit;

  const found = generateDaily<Spec>(
    {
      engine,
      actions: (state) => enumerateActions(state, 3),
      isTravel: (a) => a.type === 'travel',
      plies: [0, 5],
      start: thinnedStart,
      attempts: 60,
    },
    'checkers',
    iso,
    TRAVEL_DAYS,
  );

  const puzzle: Puzzle | null = found && {
    id: dailyId(iso),
    title: `Challenge for ${iso}`,
    brief: found.unique ? 'One move wins. Only one.' : 'At least one move wins. Find it.',
    hint: 'Clear the other side off a board — a chain of jumps counts as one move.',
    state: found.state,
    player: found.player,
    within: 1,
    solution: [found.solution],
  };
  cache.set(iso, puzzle);
  return puzzle;
}

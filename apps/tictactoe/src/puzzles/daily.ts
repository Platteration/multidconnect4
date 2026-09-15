/**
 * Today's challenge. The position is generated from the date, so everyone
 * playing on the same day gets the same one, and it always has exactly one
 * move that wins.
 */
import { DAILY_PREFIX, generateDaily, todayIso } from '@5d/core';
import { Spec, engine, enumerateActions } from '../engine';
import { Puzzle } from './index';

/** Wednesdays and Saturdays can only be won by sending a mark into the past. */
const TRAVEL_DAYS = [3, 6];

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
      plies: [4, 9],
    },
    'tictactoe',
    iso,
    TRAVEL_DAYS,
  );

  const puzzle: Puzzle | null = found && {
    id: dailyId(iso),
    title: `Challenge for ${iso}`,
    brief: found.unique ? 'One move wins. Only one.' : 'At least one move wins. Find it.',
    hint: found.byTravel
      ? 'A mark sent into the past can finish it — send one of yours back.'
      : 'It is a mark on a board that is waiting — look at every board, not just this one.',
    state: found.state,
    player: found.player,
    within: 1,
    solution: [found.solution],
  };
  cache.set(iso, puzzle);
  return puzzle;
}

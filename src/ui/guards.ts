/**
 * Small pure helpers for the screen. They are kept free of React (and of any
 * React Native import) so that the rules they encode - when the bot may act,
 * what the replay may look at, what a cell is called - can be tested on their
 * own. Each one exists because getting it wrong broke the app.
 */
import { BoardRef, GameState, Status, latestRef } from '../engine';
import type { Selection } from './useGame';

/**
 * Whether the computer opponent should take its turn now. Every flag here
 * describes the LIVE game: while the replay is open the bot must not move at
 * all, and it must never be handed the state being replayed, because the move
 * it chooses is applied to the live game.
 */
export function botShouldMove(opts: {
  replaying: boolean;
  /** True when a person, not the bot, is expected to act in the live game. */
  humanTurn: boolean;
  spinning: boolean;
  status: Status;
}): boolean {
  return !opts.replaying && !opts.humanTurn && !opts.spinning && opts.status === 'playing';
}

/**
 * The board a picked-up disc would leave, so the map can mark it. Null while
 * replaying: the state on screen is an earlier one that may not have the
 * timeline the disc is held on, and asking for a timeline that does not exist
 * throws. Nothing in replay mode uses the origin anyway.
 */
export function travelOrigin(state: GameState, selection: Selection, replaying: boolean): BoardRef | null {
  if (replaying || selection.kind === 'none') return null;
  const tl = state.timelines[selection.from.timeline];
  return tl ? latestRef(tl) : null;
}

/**
 * What a screen reader calls one cell. Anything that is not a player index is
 * an empty cell: the board type says a cell holds a player or null, but a
 * value read out of a board must not be able to take the app down.
 */
export function cellLabel(row: number, col: number, value: unknown, names: readonly [string, string]): string {
  const name = value === 0 || value === 1 ? names[value] : null;
  return `row ${row + 1} column ${col + 1} ${name ? name.toLowerCase() : 'empty'}`;
}

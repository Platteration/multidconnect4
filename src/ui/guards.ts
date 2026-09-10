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
 * Whether a game arriving by link should be confirmed before it replaces the
 * one on screen. The app's own scheme is registered with no host and no path,
 * so any other app, any QR code and any web page can hand it a game code, and
 * loading one throws the game in progress away for good: the autosave writes
 * the replacement over it a moment later. A game nobody has moved in yet is
 * worth nothing, so that is the only one a link may take without asking.
 */
export function linkNeedsConfirming(historyLength: number): boolean {
  return historyLength > 1;
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

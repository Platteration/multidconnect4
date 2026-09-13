import type { Bot } from './bot';
import type { Player } from './types';

/**
 * How a game is being played: two people sharing the phone, one person
 * against a bot, or one person solving a puzzle (with the strongest bot
 * answering for the other side).
 */
export interface GameSetup {
  mode: 'local' | 'bot' | 'puzzle';
  bot?: Bot;
  /** Puzzle mode only. */
  puzzleId?: string;
  within?: number;
  player?: Player;
}

export const DEFAULT_SETUP: GameSetup = { mode: 'local' };

/**
 * A game on disk. The states are the game's own, so this is generic over
 * them: the core never needs to look inside one.
 */
export interface SavedGame<S> {
  version: 2;
  history: S[];
  setup: GameSetup;
}

/** Version 1 predates the setup field, so a saved game from then is local play. */
type SavedGameV1<S> = { version: 1; history: S[] };

export function looksLikeSavedGame<S>(v: unknown): v is SavedGame<S> | SavedGameV1<S> {
  const s = v as { version?: number; history?: unknown };
  return !!s && (s.version === 1 || s.version === 2) && Array.isArray(s.history) && s.history.length > 0;
}

export function normaliseSaved<S>(v: SavedGame<S> | SavedGameV1<S>): { history: S[]; setup: GameSetup } {
  return { history: v.history, setup: 'setup' in v ? v.setup : DEFAULT_SETUP };
}

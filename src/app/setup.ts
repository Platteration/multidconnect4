import type { Bot, Player } from '../engine';

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

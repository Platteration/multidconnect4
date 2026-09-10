/**
 * What every game's bot has in common. The heuristics are per-game; the
 * identity of an opponent is not.
 */
import type { Player } from './types';

export type BotLevel = 1 | 2 | 3;

export const BOT_NAMES: Record<BotLevel, string> = { 1: 'Novice', 2: 'Tricky', 3: 'Paradox' };

export interface Bot {
  level: BotLevel;
  player: Player;
}

/** A random source in [0, 1), injectable so tests are deterministic. */
export type Rng = () => number;

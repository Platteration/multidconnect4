/**
 * The shape of a lifetime record. Folding a finished game into it needs the
 * game's own state, so `summarise` stays per-game.
 */
export interface BotRecord {
  played: number;
  won: number;
}

export interface Stats {
  games: number;
  /** Keyed by 'local', 'bot1', 'bot2', 'bot3'. */
  records: Record<string, BotRecord>;
  travels: number;
  mostTimelines: number;
  longestGame: number;
}

export const EMPTY_STATS: Stats = { games: 0, records: {}, travels: 0, mostTimelines: 1, longestGame: 0 };

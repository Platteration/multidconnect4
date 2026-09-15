/**
 * The daily challenge: one position a day, the same one for everybody, with
 * exactly one move that wins.
 *
 * It is generated rather than hand-made, and verified by the engine as it is
 * generated: walk a fresh game forward with a seeded random source, never
 * playing a winning move, and stop at the first position where precisely one
 * action wins for the side to move. That uniqueness is what makes it a puzzle
 * instead of a position, and it is checked rather than asserted.
 *
 * The seed is the date, so two people on the same day get the same puzzle, and
 * nothing has to be fetched.
 */
import type { GameSpec, GameState, bindMultiverse } from './engine';
import type { Player } from './types';
import type { Rng } from './bot';

type Engine<G extends GameSpec> = ReturnType<typeof bindMultiverse<G>>;

/** Today, as YYYY-MM-DD in the player's own timezone, so the day turns at their midnight. */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => `${n}`.padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The day before an ISO date. */
export function previousIso(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  return todayIso(date);
}

/** The day of the week an ISO date falls on, 0 for Sunday. */
export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** A small deterministic random source: the same seed always gives the same run. */
export function seededRng(seed: number): Rng {
  let s = seed >>> 0 || 1;
  return () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable number for one game on one day. */
export function dailySeed(gameId: string, iso: string): number {
  let h = 2166136261;
  for (const ch of `${gameId}:${iso}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Puzzle ids for the daily are the prefix plus the ISO date. */
export const DAILY_PREFIX = 'daily-';

/** The daily challenge's record: what has been solved, and the run of days. */
export interface DailyProgress {
  lastSolved: string | null;
  streak: number;
  best: number;
  /** The most recent solved dates, newest last. */
  days: string[];
}

export const EMPTY_DAILY: DailyProgress = { lastSolved: null, streak: 0, best: 0, days: [] };

/**
 * Fold a solved day into the record. A day solved the day after the last one
 * continues the run; a gap starts a new one; solving the same day twice
 * changes nothing.
 */
export function withSolvedDay(prev: DailyProgress, iso: string): DailyProgress {
  if (prev.days.includes(iso)) return prev;
  const streak = prev.lastSolved === previousIso(iso) ? prev.streak + 1 : 1;
  return {
    lastSolved: iso,
    streak,
    best: Math.max(prev.best, streak),
    days: [...prev.days, iso].slice(-180),
  };
}

export interface DailyPuzzle<G extends GameSpec> {
  state: GameState<G>;
  /** The side to move, who is also the side the person plays. */
  player: Player;
  /** An action that wins outright. */
  solution: G['action'];
  /**
   * True when `solution` is the only move that wins — the better puzzle, and
   * what the generator looks for first. Connect Four in particular can't
   * always reach one inside a budget a phone should spend, so a position with
   * several answers is accepted rather than leaving the day empty; the wording
   * shown to the player follows this flag.
   */
  unique: boolean;
  /** True when that action is a time travel. */
  byTravel: boolean;
}

export interface DailySource<G extends GameSpec> {
  engine: Engine<G>;
  /** Every legal action for the player to move: a game's own `enumerateActions` at the top level. */
  actions: (state: GameState<G>) => G['action'][];
  /** True for the actions that branch a new timeline. */
  isTravel: (action: G['action']) => boolean;
  /** How deep to walk before looking for a puzzle, and how deep to give up. */
  plies: readonly [min: number, max: number];
  /** Rules the daily is played under. */
  rules?: Partial<G['rules']>;
  /**
   * Where the walk begins. Defaults to a new game, which suits a game that can
   * be won early; Checkers, which is won by clearing a board, hands over a
   * thinned position instead. It must be deterministic given the rng.
   */
  start?: (rng: Rng, rules: Partial<G['rules']>) => GameState<G>;
  /** Walks to try before giving up. */
  attempts?: number;
}

/** Every legal action, split into the ones that win outright and the ones that don't. */
function split<G extends GameSpec>(
  source: Pick<DailySource<G>, 'engine' | 'actions'>,
  state: GameState<G>,
): { wins: G['action'][]; quiet: G['action'][] } {
  const me = state.toMove;
  const wins: G['action'][] = [];
  const quiet: G['action'][] = [];
  for (const a of source.actions(state)) {
    let next: GameState<G>;
    try {
      next = source.engine.applyAction(state, a);
    } catch {
      continue; // the game offered it, the engine refused it: not a puzzle answer
    }
    if (next.status === 'won' && next.win?.player === me) wins.push(a);
    // Only moves that leave the game running are worth walking onto. A draw,
    // or a collapse that hands the opponent the win, ends the walk instead of
    // continuing it — which is why they are neither an answer nor a step.
    else if (next.status === 'playing') quiet.push(a);
  }
  return { wins, quiet };
}

/** The actions that would win the game outright for the side to move. */
export function winningActions<G extends GameSpec>(
  source: Pick<DailySource<G>, 'engine' | 'actions'>,
  state: GameState<G>,
): G['action'][] {
  return split(source, state).wins;
}

/** One walk: play on without winning, and stop where exactly one move would. */
function walk<G extends GameSpec>(
  source: DailySource<G>,
  seed: number,
  requireTravel: boolean,
  requireUnique: boolean,
): DailyPuzzle<G> | null {
  const rng = seededRng(seed);
  const [min, max] = source.plies;
  const start = min + Math.floor(rng() * (max - min + 1));
  const rules = source.rules ?? {};
  let state = source.start ? source.start(rng, rules) : source.engine.newGame(rules);

  for (let ply = 0; ply <= max + 6; ply++) {
    if (state.status !== 'playing') return null;
    const { wins, quiet } = split(source, state);
    if (ply >= start && wins.length > 0 && !(requireUnique && wins.length > 1)) {
      const answer = requireTravel ? wins.find(source.isTravel) : wins[0];
      if (answer) {
        return {
          state,
          player: state.toMove,
          solution: answer,
          unique: wins.length === 1,
          byTravel: source.isTravel(answer),
        };
      }
    }
    // Step forward on something that does not end the game, so the walk can go on.
    if (quiet.length === 0) return null;
    // Travels are a big share of the legal actions, and left to itself a random
    // walk branches every other ply: ten thin timelines where nobody ever gets
    // near a win. So the multiverse is kept small, and a puzzle that needs a
    // travel to answer it leans towards making its one branch early.
    const travels = quiet.filter(source.isTravel);
    const plain = quiet.filter((a) => !source.isTravel(a));
    const room = state.timelines.length < (requireTravel ? 3 : 2);
    const wantsBranch = room && travels.length > 0 && rng() < (requireTravel ? 0.5 : 0.15);
    const from = wantsBranch ? travels : plain.length > 0 ? plain : quiet;
    state = source.engine.applyAction(state, from[Math.floor(rng() * from.length)]);
  }
  return null;
}

/**
 * The puzzle for one day. Deterministic: the same game id and date always give
 * the same position. Returns null only if no walk found one, which is the
 * caller's cue to fall back to a hand-made puzzle.
 */
export function generateDaily<G extends GameSpec>(
  source: DailySource<G>,
  gameId: string,
  iso: string,
  /** Days of the week (0 is Sunday) whose puzzle must be won by a time travel. */
  travelDays: readonly number[] = [],
): DailyPuzzle<G> | null {
  const base = dailySeed(gameId, iso);
  const attempts = source.attempts ?? 40;
  const wantsTravel = travelDays.includes(weekdayOf(iso));

  // Best first: a travel day with one answer. Then relax, one promise at a
  // time, rather than leaving the day empty — travel days get more attempts
  // because they are much rarer to find.
  const passes: Array<[travel: boolean, unique: boolean]> = wantsTravel
    ? [
        [true, true],
        [true, false],
        [false, true],
        [false, false],
      ]
    : [
        [false, true],
        [false, false],
      ];

  for (const [requireTravel, requireUnique] of passes) {
    const tries = requireTravel ? attempts * 5 : attempts;
    for (let i = 0; i < tries; i++) {
      const found = walk(source, (base + i * 0x9e3779b1) >>> 0, requireTravel, requireUnique);
      if (found) return found;
    }
  }
  return null;
}

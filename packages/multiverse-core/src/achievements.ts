/**
 * Badges. Everything they are judged on is visible in a finished game's
 * history without looking inside a board — a travel is the action that made
 * two boards at once, a branch win is a win on a timeline that didn't exist at
 * the start — so one list serves every game.
 *
 * They are a record of what you did, never a reward that changes the rules.
 */
import type { GameSpec, GameState } from './engine';
import type { GameSetup } from './setup';
import type { BotLevel } from './bot';
import type { Player } from './types';

/** What one finished game amounted to, in terms no board is needed to read. */
export interface GameRun {
  /** The side the person played, or null in pass-and-play. */
  me: Player | null;
  won: boolean;
  drawn: boolean;
  /** The bot's level, if there was one. */
  botLevel: BotLevel | null;
  /** Time travels made by the person (or by both, in pass-and-play). */
  travels: number;
  /** Time travels made by anyone. */
  travelsBySomeone: number;
  maxTimelines: number;
  /** True when the winning board is on a timeline that a travel created. */
  wonOnBranch: boolean;
  /** True when the winning move was itself a time travel. */
  wonByTravel: boolean;
  /** Actions in the whole game. */
  plies: number;
}

/** Read a finished game. Everything here is game-agnostic on purpose. */
export function describeRun<G extends GameSpec>(history: GameState<G>[], setup: GameSetup): GameRun {
  const last = history[history.length - 1];
  const me: Player | null = setup.mode === 'bot' && setup.bot ? ((setup.bot.player === 0 ? 1 : 0) as Player) : null;
  // A travel is the only action that makes two boards at once.
  const isTravelStep = (s: GameState<G>) => s.lastCreated.length === 2;
  let travelsBySomeone = 0;
  let travels = 0;
  for (let i = 1; i < history.length; i++) {
    if (!isTravelStep(history[i])) continue;
    travelsBySomeone++;
    // The player to move on the state before the action is the one who made it.
    if (me === null || history[i - 1].toMove === me) travels++;
  }
  const won = last.status === 'won' && me !== null && last.win?.player === me;

  return {
    me,
    won,
    drawn: last.status === 'draw',
    botLevel: setup.mode === 'bot' && setup.bot ? setup.bot.level : null,
    travels,
    travelsBySomeone,
    maxTimelines: Math.max(...history.map((s) => s.timelines.length)),
    wonOnBranch: !!last.win && last.win.board.timeline > 0,
    wonByTravel: !!last.win && isTravelStep(last),
    plies: history.length - 1,
  };
}

/** What the player has built up across games, for the badges that span them. */
export interface Progression {
  puzzlesSolved: number;
  puzzleCount: number;
  dailyStreak: number;
  dailyDays: number;
}

interface Named {
  id: string;
  name: string;
  /** One line, in the second person, saying what earns it. */
  blurb: string;
}

/** Earned by one finished game, or by the collection as a whole. */
export type Achievement =
  | (Named & { kind: 'game'; earned: (run: GameRun) => boolean })
  | (Named & { kind: 'progress'; earned: (progress: Progression) => boolean });

export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: 'first-branch',
    name: 'Second draft',
    kind: 'game',
    blurb: 'Send a piece into the past and branch a new timeline.',
    earned: (r) => r.travelsBySomeone > 0,
  },
  {
    id: 'three-timelines',
    name: 'Crowded present',
    kind: 'game',
    blurb: 'Have three timelines going at once.',
    earned: (r) => r.maxTimelines >= 3,
  },
  {
    id: 'five-timelines',
    name: 'Paradox weather',
    kind: 'game',
    blurb: 'Have five timelines going at once.',
    earned: (r) => r.maxTimelines >= 5,
  },
  {
    id: 'win-on-branch',
    name: 'It happened here',
    kind: 'game',
    blurb: 'Win on a board that only exists because someone travelled.',
    earned: (r) => r.won && r.wonOnBranch,
  },
  {
    id: 'win-by-travel',
    name: 'Retroactive',
    kind: 'game',
    blurb: 'Win with the time travel itself.',
    earned: (r) => r.won && r.wonByTravel,
  },
  {
    id: 'win-no-travel',
    name: 'Purist',
    kind: 'game',
    blurb: 'Beat a bot without travelling once.',
    earned: (r) => r.won && r.botLevel !== null && r.travels === 0,
  },
  {
    id: 'beat-novice',
    name: 'Past Novice',
    kind: 'game',
    blurb: 'Beat the Novice.',
    earned: (r) => r.won && r.botLevel === 1,
  },
  {
    id: 'beat-tricky',
    name: 'Trickier',
    kind: 'game',
    blurb: 'Beat Tricky.',
    earned: (r) => r.won && r.botLevel === 2,
  },
  {
    id: 'beat-paradox',
    name: 'Paradox tamed',
    kind: 'game',
    blurb: 'Beat Paradox.',
    earned: (r) => r.won && r.botLevel === 3,
  },
  {
    id: 'long-game',
    name: 'The long way round',
    kind: 'game',
    blurb: 'Finish a game that ran to forty moves.',
    earned: (r) => r.plies >= 40,
  },
  {
    id: 'draw',
    name: 'Nobody wins',
    kind: 'game',
    blurb: 'Play a game out to a draw.',
    earned: (r) => r.drawn,
  },
  {
    id: 'all-puzzles',
    name: 'Completionist',
    kind: 'progress',
    blurb: 'Solve every puzzle in the game.',
    earned: (p) => p.puzzleCount > 0 && p.puzzlesSolved >= p.puzzleCount,
  },
  {
    id: 'streak-7',
    name: 'Week of paradoxes',
    kind: 'progress',
    blurb: 'Solve the daily challenge seven days running.',
    earned: (p) => p.dailyStreak >= 7,
  },
  {
    id: 'dailies-30',
    name: 'Regular',
    kind: 'progress',
    blurb: 'Solve thirty daily challenges.',
    earned: (p) => p.dailyDays >= 30,
  },
];

/** The badges a finished game earns. */
export function achievementsFor(run: GameRun): string[] {
  return ACHIEVEMENTS.filter((a) => a.kind === 'game' && a.earned(run)).map((a) => a.id);
}

/** The badges the collection as a whole earns. */
export function progressAchievementsFor(progress: Progression): string[] {
  return ACHIEVEMENTS.filter((a) => a.kind === 'progress' && a.earned(progress)).map((a) => a.id);
}

export function achievementById(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

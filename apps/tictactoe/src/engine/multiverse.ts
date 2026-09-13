/**
 * Tic-tac-toe's multiverse: the shared timeline machinery from `@5d/core`,
 * plus the little that is this game's own.
 *
 * Rules in one breath:
 *  - A timeline is a sequence of boards, one per turn. X moves on even turns,
 *    O on odd turns.
 *  - On your turn you must play on EVERY timeline whose newest board is
 *    waiting for you. Only then does the turn pass.
 *  - A move is either a mark on an empty cell, or a time travel: lift one of
 *    your marks off the newest board and put it on the same cell of a past
 *    board where that cell is still empty. That past board branches into a
 *    brand-new timeline.
 *  - Three in a row on ANY board wins the whole game instantly.
 *  - Every board full with nobody connected is a draw, and so is a game that
 *    reaches thirty moves each without a line: time travel alone can keep a
 *    multiverse going forever, and a game has to end.
 *  - Optional "strict present" rule, borrowed from 5D Chess: you only HAVE to
 *    move on boards at the present (the earliest "now" anywhere), boards
 *    further ahead are optional, and you end your turn yourself.
 */
import {
  BoardRef,
  GameAdapter,
  GameSpec,
  IllegalAction,
  bindMultiverse,
  Player,
  ReadAction,
  Timeline as CoreTimeline,
  GameState as CoreState,
  Status,
  WinInfo as CoreWinInfo,
} from '@5d/core';
import { Board, cellAt, emptyBoard, isFull, placeMark, removeMark, winnerOf } from './board';

export { IllegalAction };
export type { Status };

/** Optional rule variants, fixed for the whole game. */
export interface Rules {
  /** Only boards at the present are mandatory; the turn ends explicitly. */
  strictPresent: boolean;
}

export const DEFAULT_RULES: Rules = { strictPresent: false };

/** Plies (one action by one player) before a game with no line is drawn. */
export const PLIES_FOR_DRAW = 60;

export type Action =
  | { type: 'mark'; timeline: number; cell: number }
  | { type: 'travel'; from: { timeline: number; cell: number }; to: BoardRef }
  | { type: 'endTurn' };

/** An ordinary move: a mark on one cell of one board. */
type Move = Extract<Action, { type: 'mark' }>;

/** A mark in flight. It lands on the same cell it left. */
interface Traveller {
  cell: number;
}

export interface Spec extends GameSpec {
  board: Board;
  move: Move;
  rules: Rules;
  action: Action;
  traveller: Traveller;
  winExtra: { cells: number[] };
  /** Actions played so far, by both sides together. */
  extra: { plies: number };
}

export type Timeline = CoreTimeline<Board>;
export type GameState = CoreState<Spec>;
export type WinInfo = CoreWinInfo<{ cells: number[] }>;

const adapter: GameAdapter<Spec> = {
  defaultRules: DEFAULT_RULES,
  initialExtra: { plies: 0 },
  initialBoard: () => emptyBoard(),

  read(action): ReadAction<Spec> {
    if (action.type === 'endTurn') return { kind: 'endTurn' };
    if (action.type === 'travel') {
      return {
        kind: 'travel',
        fromTimeline: action.from.timeline,
        to: action.to,
        traveller: { cell: action.from.cell },
      };
    }
    return { kind: 'move', timeline: action.timeline, move: action };
  },

  /** A full board is finished and never waits for anyone. */
  isDead: (board) => isFull(board),

  applyMove(board, move, me) {
    const marked = placeMark(board, move.cell, me);
    if (!marked) throw new IllegalAction('that cell is taken');
    return marked;
  },

  /** A past board can take the mark only if its cell is still free there. */
  canReceive: (board, traveller) => (traveller ? cellAt(board, traveller.cell) === null : !isFull(board)),

  depart(board, traveller, me) {
    if (cellAt(board, traveller.cell) !== me) {
      throw new IllegalAction('you can only send your own marks back in time');
    }
    return removeMark(board, traveller.cell);
  },

  arrive(target, traveller, me) {
    const arrived = placeMark(target, traveller.cell, me);
    if (!arrived) throw new IllegalAction('that cell is taken on the past board');
    return arrived;
  },

  afterAction: (next, { prev }) => ({ ...next, plies: prev.plies + 1 }),

  /**
   * Three in a row on any board that just changed ends the game. The mover's
   * line takes priority over one the opponent is left with.
   */
  resolveOutcome(created, mover) {
    for (const { ref, board } of created) {
      const line = winnerOf(board, mover);
      if (line) return { player: line.player, board: ref, cells: line.cells };
    }
    return null;
  },

  /** Two players who only ever travel would play forever; this stops them. */
  isDrawn: (state) => state.plies >= PLIES_FOR_DRAW,

  /** Every board full with nobody connected is a draw. */
  onTurnPassed: (state) => (engine.pendingTimelines(state).length === 0 ? { ...state, status: 'draw' } : null),
};

/** The whole bound engine, for the pieces that need more than one reader. */
export const engine = bindMultiverse(adapter);

export const {
  multiverse,
  timelineLabel,
  latestTurn,
  latestBoard,
  latestRef,
  getTimeline,
  getBoard,
  isLatest,
  maxTurn,
  allBoards,
  newGame,
  applyAction,
  resolveTurn,
  pendingTimelines,
  mandatoryTimelines,
  optionalTimelines,
  presentTurn,
  canEndTurn,
  isPending,
} = engine;

/**
 * Past boards the mark on `cell` may travel to. The cell matters here: a mark
 * can only arrive where its own cell is still free.
 */
export const travelTargets = (state: GameState, fromTimeline: number, cell: number): BoardRef[] =>
  engine.travelTargets(state, fromTimeline, { cell });

export const isTravelTarget = (
  state: GameState,
  fromTimeline: number,
  cell: number,
  ref: BoardRef,
): boolean => engine.isTravelTarget(state, fromTimeline, ref, { cell });

export type { Player };

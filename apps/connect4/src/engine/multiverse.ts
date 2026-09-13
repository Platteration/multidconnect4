/**
 * Connect Four's multiverse: the shared timeline machinery from `@5d/core`,
 * plus the rules that are this game's own.
 *
 * Rules in one breath:
 *  - A timeline is a sequence of boards, one per turn. Red moves on even
 *    turns, Yellow on odd turns.
 *  - On your turn you must make one move on EVERY timeline whose newest
 *    board is waiting for you. Only then does the turn pass.
 *  - A move is either a normal drop, or a time travel: pull one of your discs
 *    out of the newest board (the column above it collapses) and drop it into
 *    a past board where it was also your move. That past board branches into
 *    a brand-new timeline, and your opponent now has one more board to play.
 *  - Or spin the board: turn it a quarter turn and every disc falls to the
 *    new bottom. A board that was just spun can't be spun again, and an
 *    empty board can't be spun at all.
 *  - Optional variants: "pop out" lets you pull one of your own discs out
 *    of the bottom row as a move; "flip" turns the board upside down;
 *    "strict present" borrows the real 5D Chess rule: you only HAVE to move
 *    on boards at the present (the earliest "now" anywhere), boards further
 *    ahead are optional, and you end your turn yourself.
 *  - Four in a row on ANY board wins the whole game instantly.
 */
import {
  BoardRef,
  GameAdapter,
  GameSpec,
  IllegalAction,
  Multiverse,
  Player,
  ReadAction,
  Timeline as CoreTimeline,
  GameState as CoreState,
  Status,
  WinInfo as CoreWinInfo,
} from '@5d/core';
import {
  Board,
  Spin,
  cellAt,
  dropDisc,
  emptyBoard,
  flip,
  isFull,
  removeDisc,
  rotate,
  winnerOf,
} from './board';

export { IllegalAction };
export type { Status };

/** Optional rule variants, fixed for the whole game. */
export interface Rules {
  /** You may remove one of your own discs from the bottom row as your move. */
  popOut: boolean;
  /** You may turn the board upside down as your move. */
  flip: boolean;
  /** Only boards at the present are mandatory; the turn ends explicitly. */
  strictPresent: boolean;
}

export const DEFAULT_RULES: Rules = { popOut: false, flip: false, strictPresent: false };

export type Action =
  | { type: 'drop'; timeline: number; col: number }
  | { type: 'rotate'; timeline: number; spin: Spin }
  | { type: 'flip'; timeline: number }
  | { type: 'pop'; timeline: number; col: number }
  | { type: 'endTurn' }
  | {
      type: 'travel';
      from: { timeline: number; row: number; col: number };
      to: BoardRef;
      col: number;
    };

/** An ordinary move: everything that changes one board in place. */
type Move = Extract<Action, { type: 'drop' | 'rotate' | 'flip' | 'pop' }>;

/** A disc in flight: where it leaves from, and which column it lands in. */
interface Traveller {
  row: number;
  col: number;
  toCol: number;
}

interface Spec extends GameSpec {
  board: Board;
  move: Move;
  rules: Rules;
  action: Action;
  traveller: Traveller;
  winExtra: { cells: number[] };
  /** Connect Four keeps no extra state of its own. */
  extra: Record<never, never>;
}

export type Timeline = CoreTimeline<Board>;
export type GameState = CoreState<Spec>;
export type WinInfo = CoreWinInfo<{ cells: number[] }>;

const adapter: GameAdapter<Spec> = {
  defaultRules: DEFAULT_RULES,
  initialExtra: {},
  initialBoard: () => emptyBoard(),

  read(action): ReadAction<Spec> {
    if (action.type === 'endTurn') return { kind: 'endTurn' };
    if (action.type === 'travel') {
      return {
        kind: 'travel',
        fromTimeline: action.from.timeline,
        to: action.to,
        traveller: { row: action.from.row, col: action.from.col, toCol: action.col },
      };
    }
    return { kind: 'move', timeline: action.timeline, move: action };
  },

  /** A full board is finished and never waits for anyone. */
  isDead: (board) => isFull(board),

  applyMove(board, move, me, rules) {
    if (move.type === 'drop') {
      const dropped = dropDisc(board, move.col, me);
      if (!dropped) throw new IllegalAction('that column is full');
      return dropped.board;
    }
    if (move.type === 'rotate' || move.type === 'flip') {
      if (move.type === 'flip' && !rules.flip) throw new IllegalAction('flipping is not enabled in this game');
      if (board.spun) throw new IllegalAction('that board was just turned; play a disc first');
      if (board.cells.every((c) => c === null)) throw new IllegalAction('turning an empty board would change nothing');
      return move.type === 'flip' ? flip(board) : rotate(board, move.spin);
    }
    if (!rules.popOut) throw new IllegalAction('pop out is not enabled in this game');
    if (cellAt(board, 0, move.col) !== me) {
      throw new IllegalAction('you can only pop out your own disc from the bottom row');
    }
    return removeDisc(board, 0, move.col);
  },

  /** Any board with room can take a travelling disc; the column is chosen on arrival. */
  canReceive: (board) => !isFull(board),

  depart(board, traveller, me) {
    if (cellAt(board, traveller.row, traveller.col) !== me) {
      throw new IllegalAction('you can only send your own discs back in time');
    }
    return removeDisc(board, traveller.row, traveller.col);
  },

  arrive(target, traveller, me) {
    const arrived = dropDisc(target, traveller.toCol, me);
    if (!arrived) throw new IllegalAction('that column is full on the past board');
    return arrived.board;
  },

  /**
   * Four in a row on any board that just changed ends the game. The mover's
   * lines take priority over any line the opponent gets from a collapse.
   */
  resolveOutcome(created, mover) {
    for (const { ref, board } of created) {
      const line = winnerOf(board, mover);
      if (line) return { player: line.player, board: ref, cells: line.cells };
    }
    return null;
  },

  /** Every board full with nobody connected is a draw. */
  onTurnPassed: (state) =>
    multiverse.pendingTimelines(state).length === 0 ? { ...state, status: 'draw' } : null,
};

const multiverse = new Multiverse(adapter);

export function newGame(rules: Partial<Rules> = {}): GameState {
  return multiverse.newGame(rules);
}

export function timelineLabel(id: number): string {
  return `Timeline ${id + 1}`;
}

export const getTimeline = (state: GameState, id: number): Timeline => {
  const tl = state.timelines[id];
  if (!tl) throw new Error(`no timeline ${id}`);
  return tl;
};

export const latestTurn = (tl: Timeline): number => tl.startTurn + tl.boards.length - 1;
export const latestBoard = (tl: Timeline): Board => tl.boards[tl.boards.length - 1];
export const latestRef = (tl: Timeline): BoardRef => ({ timeline: tl.id, turn: latestTurn(tl) });

export function getBoard(state: GameState, ref: BoardRef): Board | undefined {
  const tl = state.timelines[ref.timeline];
  return tl?.boards[ref.turn - tl.startTurn];
}

export const isLatest = (state: GameState, ref: BoardRef): boolean => {
  const tl = state.timelines[ref.timeline];
  return !!tl && latestTurn(tl) === ref.turn;
};

/** Every board in the multiverse, in timeline order. */
export function allBoards(state: GameState): Array<{ ref: BoardRef; board: Board }> {
  const out: Array<{ ref: BoardRef; board: Board }> = [];
  for (const tl of state.timelines) {
    tl.boards.forEach((board, i) => out.push({ ref: { timeline: tl.id, turn: tl.startTurn + i }, board }));
  }
  return out;
}

/** The latest turn index anywhere in the multiverse. */
export const maxTurn = (state: GameState): number => Math.max(...state.timelines.map(latestTurn));

export const pendingTimelines = (state: GameState): Timeline[] => multiverse.pendingTimelines(state);
export const presentTurn = (state: GameState): number => multiverse.presentTurn(state);
export const mandatoryTimelines = (state: GameState): Timeline[] => multiverse.mandatoryTimelines(state);
export const optionalTimelines = (state: GameState): Timeline[] => multiverse.optionalTimelines(state);
export const canEndTurn = (state: GameState): boolean => multiverse.canEndTurn(state);
export const isPending = (state: GameState, ref: BoardRef): boolean => multiverse.isPending(state, ref);

export const travelTargets = (state: GameState, fromTimeline: number): BoardRef[] =>
  multiverse.travelTargets(state, fromTimeline);

export const isTravelTarget = (state: GameState, fromTimeline: number, ref: BoardRef): boolean =>
  multiverse.isTravelTarget(state, fromTimeline, ref);

/** Whether the newest board of a timeline may be spun right now. */
export function canRotate(state: GameState, timeline: number): boolean {
  const tl = state.timelines[timeline];
  if (!tl || !pendingTimelines(state).some((p) => p.id === timeline)) return false;
  const board = latestBoard(tl);
  return !board.spun && board.cells.some((c) => c !== null);
}

export const applyAction = (state: GameState, action: Action): GameState =>
  multiverse.applyAction(state, action);

export const resolveTurn = (state: GameState): GameState => multiverse.resolveTurn(state);

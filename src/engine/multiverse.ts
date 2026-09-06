/**
 * The multiverse: many Connect Four boards arranged into timelines, with
 * discs that can travel into the past.
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
 *  - Four in a row on ANY board wins the whole game instantly.
 */
import {
  Board,
  Spin,
  cellAt,
  dropDisc,
  emptyBoard,
  isFull,
  removeDisc,
  rotate,
  winnerOf,
} from './board';
import { BoardRef, otherPlayer, Player, playerToMoveAt, sameRef } from './types';

export interface Timeline {
  id: number;
  /** Turn index of boards[0]. The root timeline starts at 0. */
  startTurn: number;
  boards: Board[];
  /** Who created this timeline by travelling. null for the root timeline. */
  createdBy: Player | null;
  /** The past board this timeline branched from. */
  branchedFrom: BoardRef | null;
  /** The board the travelling disc left. */
  origin: BoardRef | null;
}

export type Status = 'playing' | 'won' | 'draw';

export interface WinInfo {
  player: Player;
  board: BoardRef;
  cells: number[];
}

export type Action =
  | { type: 'drop'; timeline: number; col: number }
  | { type: 'rotate'; timeline: number; spin: Spin }
  | {
      type: 'travel';
      from: { timeline: number; row: number; col: number };
      to: BoardRef;
      col: number;
    };

export interface GameState {
  timelines: Timeline[];
  toMove: Player;
  status: Status;
  win: WinInfo | null;
  /** Number of completed full turns (both players moved). Just for display. */
  round: number;
  lastAction: Action | null;
  /** Boards created by the last action, so the UI can highlight them. */
  lastCreated: BoardRef[];
}

export function newGame(): GameState {
  return {
    timelines: [
      {
        id: 0,
        startTurn: 0,
        boards: [emptyBoard()],
        createdBy: null,
        branchedFrom: null,
        origin: null,
      },
    ],
    toMove: 0,
    status: 'playing',
    win: null,
    round: 0,
    lastAction: null,
    lastCreated: [],
  };
}

export function timelineLabel(id: number): string {
  return `Timeline ${id + 1}`;
}

export function getTimeline(state: GameState, id: number): Timeline {
  const tl = state.timelines[id];
  if (!tl) throw new Error(`no timeline ${id}`);
  return tl;
}

export function latestTurn(tl: Timeline): number {
  return tl.startTurn + tl.boards.length - 1;
}

export function latestBoard(tl: Timeline): Board {
  return tl.boards[tl.boards.length - 1];
}

export function latestRef(tl: Timeline): BoardRef {
  return { timeline: tl.id, turn: latestTurn(tl) };
}

export function getBoard(state: GameState, ref: BoardRef): Board | undefined {
  const tl = state.timelines[ref.timeline];
  if (!tl) return undefined;
  return tl.boards[ref.turn - tl.startTurn];
}

export function isLatest(state: GameState, ref: BoardRef): boolean {
  const tl = state.timelines[ref.timeline];
  return !!tl && latestTurn(tl) === ref.turn;
}

/** Every board in the multiverse, in timeline order. */
export function allBoards(state: GameState): Array<{ ref: BoardRef; board: Board }> {
  const out: Array<{ ref: BoardRef; board: Board }> = [];
  for (const tl of state.timelines) {
    tl.boards.forEach((board, i) => {
      out.push({ ref: { timeline: tl.id, turn: tl.startTurn + i }, board });
    });
  }
  return out;
}

/** The latest turn index anywhere in the multiverse. */
export function maxTurn(state: GameState): number {
  return Math.max(...state.timelines.map(latestTurn));
}

/**
 * Timelines whose newest board is waiting for the current player to move.
 * Full boards are finished and never wait for anyone.
 */
export function pendingTimelines(state: GameState): Timeline[] {
  if (state.status !== 'playing') return [];
  return state.timelines.filter(
    (tl) => playerToMoveAt(latestTurn(tl)) === state.toMove && !isFull(latestBoard(tl)),
  );
}

export function isPending(state: GameState, ref: BoardRef): boolean {
  return isLatest(state, ref) && pendingTimelines(state).some((tl) => tl.id === ref.timeline);
}

/**
 * Past boards a disc may travel to from the newest board of `fromTimeline`.
 * A target must be strictly in the past, must not be the newest board of its
 * own timeline (you play those normally), must have been the traveller's
 * move, and must have room for a disc.
 */
export function travelTargets(state: GameState, fromTimeline: number): BoardRef[] {
  if (state.status !== 'playing') return [];
  const from = state.timelines[fromTimeline];
  if (!from) return [];
  const originTurn = latestTurn(from);
  const out: BoardRef[] = [];
  for (const tl of state.timelines) {
    const last = latestTurn(tl);
    tl.boards.forEach((board, i) => {
      const turn = tl.startTurn + i;
      if (turn >= originTurn) return;
      if (turn === last) return;
      if (playerToMoveAt(turn) !== state.toMove) return;
      if (isFull(board)) return;
      out.push({ timeline: tl.id, turn });
    });
  }
  return out;
}

export function isTravelTarget(state: GameState, fromTimeline: number, ref: BoardRef): boolean {
  return travelTargets(state, fromTimeline).some((t) => sameRef(t, ref));
}

export class IllegalAction extends Error {}

/** Whether the newest board of a timeline may be spun right now. */
export function canRotate(state: GameState, timeline: number): boolean {
  const tl = state.timelines[timeline];
  if (!tl || !pendingTimelines(state).some((p) => p.id === timeline)) return false;
  const board = latestBoard(tl);
  return !board.spun && board.cells.some((c) => c !== null);
}

function assertPending(state: GameState, timeline: number): Timeline {
  const tl = getTimeline(state, timeline);
  if (!pendingTimelines(state).some((p) => p.id === timeline)) {
    throw new IllegalAction(`${timelineLabel(timeline)} is not waiting for a move`);
  }
  return tl;
}

/** Apply an action. Throws IllegalAction when the move is not allowed. */
export function applyAction(state: GameState, action: Action): GameState {
  if (state.status !== 'playing') throw new IllegalAction('the game is over');
  const me = state.toMove;
  const timelines = state.timelines.map((tl) => ({ ...tl, boards: tl.boards.slice() }));
  const created: BoardRef[] = [];

  if (action.type === 'drop') {
    const tl = assertPending(state, action.timeline);
    const dropped = dropDisc(latestBoard(tl), action.col, me);
    if (!dropped) throw new IllegalAction('that column is full');
    timelines[tl.id].boards.push(dropped.board);
    created.push(latestRef(timelines[tl.id]));
  } else if (action.type === 'rotate') {
    const tl = assertPending(state, action.timeline);
    const board = latestBoard(tl);
    if (board.spun) throw new IllegalAction('that board was just spun; play a disc first');
    if (board.cells.every((c) => c === null)) throw new IllegalAction('spinning an empty board would change nothing');
    timelines[tl.id].boards.push(rotate(board, action.spin));
    created.push(latestRef(timelines[tl.id]));
  } else {
    const from = assertPending(state, action.from.timeline);
    const originBoard = latestBoard(from);
    if (cellAt(originBoard, action.from.row, action.from.col) !== me) {
      throw new IllegalAction('you can only send your own discs back in time');
    }
    if (!isTravelTarget(state, from.id, action.to)) {
      throw new IllegalAction('that board cannot be travelled to');
    }
    const target = getBoard(state, action.to)!;
    const arrived = dropDisc(target, action.col, me);
    if (!arrived) throw new IllegalAction('that column is full on the past board');

    timelines[from.id].boards.push(removeDisc(originBoard, action.from.row, action.from.col));
    created.push(latestRef(timelines[from.id]));

    const branch: Timeline = {
      id: timelines.length,
      startTurn: action.to.turn + 1,
      boards: [arrived.board],
      createdBy: me,
      branchedFrom: { ...action.to },
      origin: latestRef(from),
    };
    timelines.push(branch);
    created.push(latestRef(branch));
  }

  let next: GameState = {
    ...state,
    timelines,
    lastAction: action,
    lastCreated: created,
  };

  // Four in a row on any board that just changed ends the game. The mover's
  // lines take priority over any line the opponent gets from a collapse.
  for (const ref of created) {
    const line = winnerOf(getBoard(next, ref)!, me);
    if (line) {
      return { ...next, status: 'won', win: { player: line.player, board: ref, cells: line.cells } };
    }
  }

  return resolveTurn(next);
}

/**
 * Pass the turn once the current player has nothing left to do. If the next
 * player also has nothing to do (every board is full) the game is drawn.
 */
export function resolveTurn(state: GameState): GameState {
  if (state.status !== 'playing') return state;
  if (pendingTimelines(state).length > 0) return state;
  const flipped: GameState = {
    ...state,
    toMove: otherPlayer(state.toMove),
    round: state.toMove === 1 ? state.round + 1 : state.round,
  };
  if (pendingTimelines(flipped).length === 0) {
    return { ...flipped, status: 'draw' };
  }
  return flipped;
}

/**
 * Checkers' multiverse: the shared timeline machinery from `@5d/core`, plus
 * the rules that are this game's own.
 *
 * Rules in one breath:
 *  - A timeline is a sequence of boards, one per turn. Red moves on even
 *    turns, Black on odd turns.
 *  - On your turn you must make one move on EVERY timeline whose newest
 *    board is waiting for you. Only then does the turn pass.
 *  - A move is either a normal checkers move (jumps are mandatory), or a time
 *    travel: lift one of your pieces off the newest board and put it on the
 *    same square of a past board where it was also your move. That past
 *    board branches into a brand-new timeline.
 *  - You win the moment your opponent has no pieces left on any board, or
 *    has a board waiting for them with nothing they can do on it.
 *  - Forty moves by each side with no capture, crowning, or time travel is
 *    a draw, so two kings can't chase each other forever.
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
  otherPlayer,
} from '@5d/core';
import {
  Board,
  DEFAULT_RULES,
  Move,
  Rules,
  applyMove,
  countPieces,
  crownRow,
  initialBoard,
  legalMoves,
  moveTarget,
  pieceAt,
  piecesOf,
  placePiece,
  removePiece,
  rowOf,
} from './board';

export { IllegalAction };
export type { Status };

/** Plies (one move by one player) without progress before the game is drawn. */
export const QUIET_PLIES_FOR_DRAW = 80;

export type Action =
  | { type: 'move'; timeline: number; move: Move }
  | { type: 'travel'; from: { timeline: number; square: number }; to: BoardRef }
  | { type: 'endTurn' };

/** A piece in flight. It lands on the same square it left. */
interface Traveller {
  square: number;
}

export interface Spec extends GameSpec {
  board: Board;
  move: Move;
  rules: Rules;
  action: Action;
  traveller: Traveller;
  winExtra: { reason: 'captured' | 'trapped' };
  /** Consecutive plies with no capture, crowning, or time travel. */
  extra: { quietPlies: number };
}

export type Timeline = CoreTimeline<Board>;
export type GameState = CoreState<Spec>;
export type WinInfo = CoreWinInfo<{ reason: 'captured' | 'trapped' }>;

function sameMove(a: Move, b: Move): boolean {
  return (
    a.from === b.from &&
    a.path.length === b.path.length &&
    a.path.every((p, i) => p === b.path[i]) &&
    a.captures.length === b.captures.length &&
    a.captures.every((c, i) => c === b.captures[i])
  );
}

const adapter: GameAdapter<Spec> = {
  defaultRules: DEFAULT_RULES,
  initialExtra: { quietPlies: 0 },
  initialBoard: () => initialBoard(),

  read(action): ReadAction<Spec> {
    if (action.type === 'endTurn') return { kind: 'endTurn' };
    if (action.type === 'travel') {
      return {
        kind: 'travel',
        fromTimeline: action.from.timeline,
        to: action.to,
        traveller: { square: action.from.square },
      };
    }
    return { kind: 'move', timeline: action.timeline, move: action.move };
  },

  /** A checkers board is never finished on its own; someone always has a side. */
  isDead: () => false,

  applyMove(board, move, me, rules) {
    const legal = legalMoves(board, me, rules);
    if (!legal.some((m) => sameMove(m, move))) {
      const mustCapture = legal.some((m) => m.captures.length > 0) && move.captures.length === 0;
      throw new IllegalAction(mustCapture ? 'you must capture when you can' : 'that move is not legal');
    }
    return applyMove(board, move);
  },

  /** A past board can take the piece only if its square is still free there. */
  canReceive: (board, traveller) => !traveller || pieceAt(board, traveller.square) === null,

  depart(board, traveller, me) {
    const piece = pieceAt(board, traveller.square);
    if (!piece || piece.player !== me) {
      throw new IllegalAction('you can only send your own pieces back in time');
    }
    return removePiece(board, traveller.square);
  },

  arrive(target, traveller, _me, origin) {
    // The piece travels as it is, so a king arrives still crowned.
    const piece = pieceAt(origin, traveller.square)!;
    const arrived = placePiece(target, traveller.square, piece);
    if (!arrived) throw new IllegalAction('that square is taken on the past board');
    return arrived;
  },

  /** A quiet move is one with no capture and no crowning; travelling resets the count. */
  afterAction(next, { prev, action }) {
    if (action.type !== 'move') return { ...next, quietPlies: 0 };
    const tl = prev.timelines[action.timeline];
    const board = tl.boards[tl.boards.length - 1];
    const mover = pieceAt(board, action.move.from)!;
    const crowned = !mover.king && rowOf(moveTarget(action.move)) === crownRow(prev.toMove);
    const quiet = action.move.captures.length === 0 && !crowned;
    return { ...next, quietPlies: quiet ? prev.quietPlies + 1 : 0 };
  },

  /**
   * Wiping a side off any board ends the game. The mover's win takes priority
   * over the loss of moving your last piece away from a board.
   */
  resolveOutcome(created, mover) {
    const them = otherPlayer(mover);
    for (const { ref, board } of created) {
      if (countPieces(board, them) === 0) return { player: mover, board: ref, reason: 'captured' };
    }
    for (const { ref, board } of created) {
      if (countPieces(board, mover) === 0) return { player: them, board: ref, reason: 'captured' };
    }
    return null;
  },

  isDrawn: (state) => state.quietPlies >= QUIET_PLIES_FOR_DRAW,

  /** A player trapped on a board they must play has lost. */
  onTurnPassed(state) {
    for (const tl of engine.mandatoryTimelines(state)) {
      if (!hasAnyAction(state, tl.id)) {
        return {
          ...state,
          status: 'won',
          win: {
            player: otherPlayer(state.toMove),
            board: engine.latestRef(tl),
            reason: 'trapped',
          },
        };
      }
    }
    return null;
  },
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
 * Past boards the piece on `square` may travel to. The square matters here:
 * a piece can only arrive where its own square is still free.
 */
export const travelTargets = (state: GameState, fromTimeline: number, square: number): BoardRef[] =>
  engine.travelTargets(state, fromTimeline, { square });

export const isTravelTarget = (
  state: GameState,
  fromTimeline: number,
  square: number,
  ref: BoardRef,
): boolean => engine.isTravelTarget(state, fromTimeline, ref, { square });

/** Legal checkers moves on the newest board of a timeline for the current player. */
export function legalMovesOn(state: GameState, timeline: number): Move[] {
  const tl = state.timelines[timeline];
  if (!tl) return [];
  return legalMoves(tl.boards[tl.boards.length - 1], state.toMove, state.rules);
}

/** True when the player to move can do anything at all on this timeline. */
export function hasAnyAction(state: GameState, timeline: number): boolean {
  if (legalMovesOn(state, timeline).length > 0) return true;
  const tl = state.timelines[timeline];
  const board = tl.boards[tl.boards.length - 1];
  return piecesOf(board, state.toMove).some((sq) => travelTargets(state, timeline, sq).length > 0);
}

export type { Player };

/**
 * The multiverse: many boards arranged into timelines, with pieces that can
 * travel into the past. Everything here is game-agnostic — timelines, turn
 * parity, the present, branching, and how a turn ends. What a board is, what a
 * move does to it, and who has won are supplied by a `GameAdapter`.
 *
 * Rules in one breath:
 *  - A timeline is a sequence of boards, one per turn. Red moves on even
 *    turns, the other side on odd turns.
 *  - On your turn you must move on every timeline whose newest board is
 *    waiting for you. Only then does the turn pass.
 *  - A move is either a normal move on the newest board, or a time travel:
 *    take a piece out of the newest board and put it on a past board where it
 *    was also your move. That past board branches into a new timeline.
 *  - With the strict-present rule only boards at the present are compulsory;
 *    boards further ahead are optional and the turn ends explicitly.
 *
 * The core never builds an action. It reads the game's own actions through
 * `GameAdapter.read`, which is what lets each game keep the exact action shape
 * its saved games and share codes were written with.
 */
import { BoardRef, Player, otherPlayer, playerToMoveAt, sameRef } from '../types';

/** The types one game plugs into the core. */
export interface GameSpec {
  /** A single board position. */
  board: unknown;
  /** One ordinary move, as the game describes it. */
  move: unknown;
  /** The game's rule variants. Must include `strictPresent`. */
  rules: CoreRules;
  /** The game's own action union, stored verbatim in saved games. */
  action: unknown;
  /** Whatever identifies a travelling piece, e.g. a square or a row and column. */
  traveller: unknown;
  /** Extra fields the game attaches to a win, e.g. the winning line. */
  winExtra: unknown;
  /** Extra fields the game attaches to the state, e.g. a quiet-move counter. */
  extra: object;
}

/** The one rule the core itself reads. */
export interface CoreRules {
  /** Only boards at the present are compulsory; the turn ends explicitly. */
  strictPresent: boolean;
}

export interface Timeline<B> {
  id: number;
  /** Turn index of boards[0]. The root timeline starts at 0. */
  startTurn: number;
  boards: B[];
  /** Who created this timeline by travelling. null for the root timeline. */
  createdBy: Player | null;
  /** The past board this timeline branched from. */
  branchedFrom: BoardRef | null;
  /** The board the travelling piece left. */
  origin: BoardRef | null;
}

export type Status = 'playing' | 'won' | 'draw';

export type WinInfo<X> = { player: Player; board: BoardRef } & X;

export type GameState<G extends GameSpec> = {
  rules: G['rules'];
  timelines: Timeline<G['board']>[];
  toMove: Player;
  status: Status;
  win: WinInfo<G['winExtra']> | null;
  /** Completed full turns, for display. */
  round: number;
  lastAction: G['action'] | null;
  /** Boards created by the last action, so the UI can highlight them. */
  lastCreated: BoardRef[];
} & G['extra'];

/** How the core reads one of the game's actions. */
export type ReadAction<G extends GameSpec> =
  | { kind: 'move'; timeline: number; move: G['move'] }
  | { kind: 'travel'; fromTimeline: number; to: BoardRef; traveller: G['traveller'] }
  | { kind: 'endTurn' };

export class IllegalAction extends Error {}

/**
 * What a game must provide. Everything takes and returns plain values; boards
 * are immutable, so each of these returns a new one.
 */
export interface GameAdapter<G extends GameSpec> {
  /** The opening position. */
  initialBoard(rules: G['rules']): G['board'];
  defaultRules: G['rules'];
  /** Extra state fields at the start of a game. */
  initialExtra: G['extra'];

  /** Read one of the game's actions in the core's terms. */
  read(action: G['action']): ReadAction<G>;

  /**
   * A board nobody can play on again — full, in Connect Four's case. Games
   * where a board is never finished can return false.
   */
  isDead(board: G['board']): boolean;

  /** Apply an ordinary move, throwing `IllegalAction` if it is not legal. */
  applyMove(board: G['board'], move: G['move'], me: Player, rules: G['rules']): G['board'];

  /** Whether a past board could receive this traveller. */
  canReceive(board: G['board'], traveller: G['traveller'] | undefined): boolean;
  /** Take the traveller off the board it is leaving. Throws if it is not yours. */
  depart(board: G['board'], traveller: G['traveller'], me: Player): G['board'];
  /**
   * Put the traveller onto the past board. Throws if it cannot land. The board
   * it came from is passed too, since what travels may carry state with it —
   * a crowned checkers piece stays crowned.
   */
  arrive(target: G['board'], traveller: G['traveller'], me: Player, origin: G['board']): G['board'];

  /**
   * Whether any of the boards just created ends the game. Games decide their
   * own priority when both sides would win at once.
   */
  resolveOutcome(
    created: Array<{ ref: BoardRef; board: G['board'] }>,
    mover: Player,
  ): WinInfo<G['winExtra']> | null;

  /** Fold per-game bookkeeping into the new state, e.g. a quiet-move counter. */
  afterAction?(
    next: GameState<G>,
    context: { prev: GameState<G>; action: G['action']; created: BoardRef[] },
  ): GameState<G>;

  /**
   * A draw that does not depend on whose turn it is, such as a run of moves
   * with no progress. Checked after wins, so a win still beats it.
   */
  isDrawn?(state: GameState<G>): boolean;

  /**
   * Called once the turn has passed. A game returns a finished state when the
   * player now to move has nothing they can do — a draw, or a loss by being
   * trapped.
   */
  onTurnPassed?(state: GameState<G>): GameState<G> | null;
}

// --- reading the multiverse -------------------------------------------------

export function timelineLabel(id: number): string {
  return `Timeline ${id + 1}`;
}

export function latestTurn<B>(tl: Timeline<B>): number {
  return tl.startTurn + tl.boards.length - 1;
}

export function latestBoard<B>(tl: Timeline<B>): B {
  return tl.boards[tl.boards.length - 1];
}

export function latestRef<B>(tl: Timeline<B>): BoardRef {
  return { timeline: tl.id, turn: latestTurn(tl) };
}

export function getTimeline<G extends GameSpec>(state: GameState<G>, id: number): Timeline<G['board']> {
  const tl = state.timelines[id];
  if (!tl) throw new Error(`no timeline ${id}`);
  return tl;
}

export function getBoard<G extends GameSpec>(state: GameState<G>, ref: BoardRef): G['board'] | undefined {
  const tl = state.timelines[ref.timeline];
  if (!tl) return undefined;
  return tl.boards[ref.turn - tl.startTurn];
}

export function isLatest<G extends GameSpec>(state: GameState<G>, ref: BoardRef): boolean {
  const tl = state.timelines[ref.timeline];
  return !!tl && latestTurn(tl) === ref.turn;
}

/** Every board in the multiverse, in timeline order. */
export function allBoards<G extends GameSpec>(
  state: GameState<G>,
): Array<{ ref: BoardRef; board: G['board'] }> {
  const out: Array<{ ref: BoardRef; board: G['board'] }> = [];
  for (const tl of state.timelines) {
    tl.boards.forEach((board, i) => {
      out.push({ ref: { timeline: tl.id, turn: tl.startTurn + i }, board });
    });
  }
  return out;
}

/** The latest turn index anywhere in the multiverse. */
export function maxTurn<G extends GameSpec>(state: GameState<G>): number {
  return Math.max(...state.timelines.map(latestTurn));
}

/**
 * A multiverse bound to its adapter. Every rule that needs to look inside a
 * board goes through here, so the game only ever passes its adapter once.
 */
export class Multiverse<G extends GameSpec> {
  constructor(private readonly game: GameAdapter<G>) {}

  newGame(rules: Partial<G['rules']> = {}): GameState<G> {
    const merged = { ...this.game.defaultRules, ...rules } as G['rules'];
    return {
      ...this.game.initialExtra,
      rules: merged,
      timelines: [
        {
          id: 0,
          startTurn: 0,
          boards: [this.game.initialBoard(merged)],
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
    } as GameState<G>;
  }

  /** Timelines whose newest board the current player may move now. */
  pendingTimelines(state: GameState<G>): Timeline<G['board']>[] {
    if (state.status !== 'playing') return [];
    return state.timelines.filter(
      (tl) => playerToMoveAt(latestTurn(tl)) === state.toMove && !this.game.isDead(latestBoard(tl)),
    );
  }

  /** The present: the earliest "now" among unfinished timelines. */
  presentTurn(state: GameState<G>): number {
    const turns = state.timelines.filter((tl) => !this.game.isDead(latestBoard(tl))).map(latestTurn);
    return turns.length ? Math.min(...turns) : maxTurn(state);
  }

  /**
   * Timelines the current player MUST move before the turn can end. With the
   * strict-present rule only boards at the present count; otherwise every
   * waiting board does.
   */
  mandatoryTimelines(state: GameState<G>): Timeline<G['board']>[] {
    const pending = this.pendingTimelines(state);
    if (!state.rules.strictPresent) return pending;
    const present = this.presentTurn(state);
    return pending.filter((tl) => latestTurn(tl) === present);
  }

  /** Timelines the current player may move this turn but need not. */
  optionalTimelines(state: GameState<G>): Timeline<G['board']>[] {
    if (!state.rules.strictPresent) return [];
    const present = this.presentTurn(state);
    return this.pendingTimelines(state).filter((tl) => latestTurn(tl) > present);
  }

  /** Whether the current player may end the turn now (strict present only). */
  canEndTurn(state: GameState<G>): boolean {
    return (
      state.status === 'playing' &&
      state.rules.strictPresent &&
      this.mandatoryTimelines(state).length === 0 &&
      this.optionalTimelines(state).length > 0
    );
  }

  isPending(state: GameState<G>, ref: BoardRef): boolean {
    return isLatest(state, ref) && this.pendingTimelines(state).some((tl) => tl.id === ref.timeline);
  }

  /**
   * Past boards a piece may travel to from the newest board of `fromTimeline`.
   * A target must be strictly in the past, must not be the newest board of its
   * own timeline (you play those normally), must have been the traveller's
   * move, and must be able to receive the piece.
   */
  travelTargets(state: GameState<G>, fromTimeline: number, traveller?: G['traveller']): BoardRef[] {
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
        if (!this.game.canReceive(board, traveller)) return;
        out.push({ timeline: tl.id, turn });
      });
    }
    return out;
  }

  isTravelTarget(
    state: GameState<G>,
    fromTimeline: number,
    ref: BoardRef,
    traveller?: G['traveller'],
  ): boolean {
    return this.travelTargets(state, fromTimeline, traveller).some((t) => sameRef(t, ref));
  }

  private assertPending(state: GameState<G>, timeline: number): Timeline<G['board']> {
    const tl = getTimeline(state, timeline);
    if (!this.pendingTimelines(state).some((p) => p.id === timeline)) {
      throw new IllegalAction(`${timelineLabel(timeline)} is not waiting for a move`);
    }
    return tl;
  }

  /** Apply an action. Throws `IllegalAction` when the move is not allowed. */
  applyAction(state: GameState<G>, action: G['action']): GameState<G> {
    if (state.status !== 'playing') throw new IllegalAction('the game is over');
    const me = state.toMove;
    const read = this.game.read(action);

    if (read.kind === 'endTurn') {
      if (!this.canEndTurn(state)) throw new IllegalAction('you still have boards at the present to play');
      return this.passTurn({ ...state, lastAction: action, lastCreated: [] });
    }

    const timelines = state.timelines.map((tl) => ({ ...tl, boards: tl.boards.slice() }));
    const created: BoardRef[] = [];

    if (read.kind === 'move') {
      const tl = this.assertPending(state, read.timeline);
      timelines[tl.id].boards.push(this.game.applyMove(latestBoard(tl), read.move, me, state.rules));
      created.push(latestRef(timelines[tl.id]));
    } else {
      const from = this.assertPending(state, read.fromTimeline);
      const originBoard = latestBoard(from);
      // Ownership first, then whether the destination is reachable, then
      // whether the piece can land: the order the error messages assume.
      const left = this.game.depart(originBoard, read.traveller, me);
      if (!this.isTravelTarget(state, from.id, read.to, read.traveller)) {
        throw new IllegalAction('that board cannot be travelled to');
      }
      const arrived = this.game.arrive(getBoard(state, read.to)!, read.traveller, me, originBoard);

      timelines[from.id].boards.push(left);
      created.push(latestRef(timelines[from.id]));

      const branch: Timeline<G['board']> = {
        id: timelines.length,
        startTurn: read.to.turn + 1,
        boards: [arrived],
        createdBy: me,
        branchedFrom: { ...read.to },
        origin: latestRef(from),
      };
      timelines.push(branch);
      created.push(latestRef(branch));
    }

    let next = { ...state, timelines, lastAction: action, lastCreated: created } as GameState<G>;
    if (this.game.afterAction) next = this.game.afterAction(next, { prev: state, action, created });
    if (next.status !== 'playing') return next;

    const win = this.game.resolveOutcome(
      created.map((ref) => ({ ref, board: getBoard(next, ref)! })),
      me,
    );
    if (win) return { ...next, status: 'won', win };
    if (this.game.isDrawn?.(next)) return { ...next, status: 'draw' };

    return this.resolveTurn(next);
  }

  /**
   * Pass the turn once the current player has nothing compulsory left. With
   * optional boards outstanding the player ends the turn themselves.
   */
  resolveTurn(state: GameState<G>): GameState<G> {
    if (state.status !== 'playing') return state;
    if (this.mandatoryTimelines(state).length > 0) return state;
    if (this.optionalTimelines(state).length > 0) return state;
    return this.passTurn(state);
  }

  private passTurn(state: GameState<G>): GameState<G> {
    const flipped = {
      ...state,
      toMove: otherPlayer(state.toMove),
      round: state.toMove === 1 ? state.round + 1 : state.round,
    } as GameState<G>;
    return this.game.onTurnPassed?.(flipped) ?? flipped;
  }
}

/**
 * The multiverse as loose functions bound to one adapter, so a game can
 * publish its own engine API without hand-writing a wrapper per method:
 *
 * ```ts
 * export const { newGame, applyAction, pendingTimelines } = bindMultiverse(adapter);
 * ```
 */
export function bindMultiverse<G extends GameSpec>(adapter: GameAdapter<G>) {
  const mv = new Multiverse(adapter);
  return {
    multiverse: mv,
    adapter,
    /** Whether a board is finished, e.g. a full Connect Four grid. */
    isDead: (board: G['board']) => adapter.isDead(board),
    // The plain readers are bound too. They are generic over the whole spec,
    // which TypeScript cannot infer from a `GameState<G>` argument alone, so
    // binding them here is what keeps them properly typed for a game.
    timelineLabel,
    latestTurn: (tl: Timeline<G['board']>) => latestTurn(tl),
    latestBoard: (tl: Timeline<G['board']>) => latestBoard(tl),
    latestRef: (tl: Timeline<G['board']>) => latestRef(tl),
    getTimeline: (state: GameState<G>, id: number) => getTimeline<G>(state, id),
    getBoard: (state: GameState<G>, ref: BoardRef) => getBoard<G>(state, ref),
    isLatest: (state: GameState<G>, ref: BoardRef) => isLatest<G>(state, ref),
    maxTurn: (state: GameState<G>) => maxTurn<G>(state),
    allBoards: (state: GameState<G>) => allBoards<G>(state),
    newGame: (rules: Partial<G['rules']> = {}): GameState<G> => mv.newGame(rules),
    applyAction: (state: GameState<G>, action: G['action']): GameState<G> => mv.applyAction(state, action),
    resolveTurn: (state: GameState<G>): GameState<G> => mv.resolveTurn(state),
    pendingTimelines: (state: GameState<G>) => mv.pendingTimelines(state),
    mandatoryTimelines: (state: GameState<G>) => mv.mandatoryTimelines(state),
    optionalTimelines: (state: GameState<G>) => mv.optionalTimelines(state),
    presentTurn: (state: GameState<G>) => mv.presentTurn(state),
    canEndTurn: (state: GameState<G>) => mv.canEndTurn(state),
    isPending: (state: GameState<G>, ref: BoardRef) => mv.isPending(state, ref),
    travelTargets: (state: GameState<G>, fromTimeline: number, traveller?: G['traveller']) =>
      mv.travelTargets(state, fromTimeline, traveller),
    isTravelTarget: (state: GameState<G>, fromTimeline: number, ref: BoardRef, traveller?: G['traveller']) =>
      mv.isTravelTarget(state, fromTimeline, ref, traveller),
  };
}

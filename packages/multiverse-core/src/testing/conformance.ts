/**
 * The rules every multiverse game must obey, whatever its board is.
 *
 * A game hands over its bound engine and two small helpers, and gets back a
 * suite that checks turn parity, the present, branching, travel legality,
 * immutability and the strict-present variant. A new game inherits all of it
 * instead of re-deriving it, and a change to the core that breaks any game
 * breaks here first.
 *
 * Usage, from a game's own test file:
 *
 * ```ts
 * describeMultiverse('connect four', {
 *   engine,
 *   actions: (state) => enumerateActions(state, 3),
 *   isTravel: (a) => a.type === 'travel',
 *   endTurn: { type: 'endTurn' },
 *   strictRules: { strictPresent: true },
 * });
 * ```
 */
import { playerToMoveAt, sameRef } from '../types';
import type { BoardRef } from '../types';
import type { GameSpec, GameState, bindMultiverse } from '../engine';

type Engine<G extends GameSpec> = ReturnType<typeof bindMultiverse<G>>;

export interface ConformanceGame<G extends GameSpec> {
  engine: Engine<G>;
  /** Every legal action for the player to move, travels included. */
  actions: (state: GameState<G>) => G['action'][];
  /** True for the actions that branch a new timeline. */
  isTravel: (action: G['action']) => boolean;
  /** The game's own end-of-turn action. */
  endTurn: G['action'];
  /** Rules that turn the strict-present variant on. */
  strictRules: Partial<G['rules']>;
}

/** Play on until `want` says yes, or until the game ends. Returns null if it never does. */
function playUntil<G extends GameSpec>(
  game: ConformanceGame<G>,
  start: GameState<G>,
  want: (state: GameState<G>) => boolean,
  pick?: (actions: G['action'][], state: GameState<G>) => G['action'] | undefined,
): GameState<G> | null {
  let state = start;
  for (let i = 0; i < 40; i++) {
    if (want(state)) return state;
    if (state.status !== 'playing') return null;
    const options = game.actions(state);
    const chosen = pick?.(options, state) ?? options.find((a) => !game.isTravel(a)) ?? options[0];
    if (!chosen) return null;
    state = game.engine.applyAction(state, chosen);
  }
  return want(state) ? state : null;
}

/** A state with a second timeline, reached by the first travel the game offers. */
function branched<G extends GameSpec>(game: ConformanceGame<G>, rules: Partial<G['rules']> = {}): GameState<G> {
  const start = game.engine.newGame(rules);
  const state = playUntil(
    game,
    start,
    (s) => game.actions(s).some(game.isTravel),
  );
  if (!state) throw new Error('this game never offers a time travel');
  const travel = game.actions(state).find(game.isTravel)!;
  return game.engine.applyAction(state, travel);
}

export function describeMultiverse<G extends GameSpec>(name: string, game: ConformanceGame<G>): void {
  const e = game.engine;

  describe(`${name}: the multiverse contract`, () => {
    describe('a new game', () => {
      it('is one timeline, one board, player 0 to move', () => {
        const g = e.newGame();
        expect(g.timelines).toHaveLength(1);
        expect(g.timelines[0].boards).toHaveLength(1);
        expect(g.timelines[0].startTurn).toBe(0);
        expect(g.timelines[0].branchedFrom).toBeNull();
        expect(g.timelines[0].createdBy).toBeNull();
        expect(g.toMove).toBe(0);
        expect(g.round).toBe(0);
        expect(g.status).toBe('playing');
        expect(g.win).toBeNull();
        expect(g.lastAction).toBeNull();
        expect(g.lastCreated).toEqual([]);
        expect(e.pendingTimelines(g)).toHaveLength(1);
      });
    });

    describe('turns', () => {
      it('gives each new board to the other side', () => {
        let g = e.newGame();
        for (let i = 0; i < 4 && g.status === 'playing'; i++) {
          const before = g.toMove;
          g = e.applyAction(g, game.actions(g).find((a) => !game.isTravel(a))!);
          if (g.status !== 'playing') break;
          expect(g.toMove).toBe(before === 0 ? 1 : 0);
        }
      });

      it('agrees with turn parity on every board', () => {
        const g = branched(game);
        for (const tl of g.timelines) {
          tl.boards.forEach((_, i) => {
            const turn = tl.startTurn + i;
            expect(playerToMoveAt(turn)).toBe((turn % 2) as 0 | 1);
          });
        }
        for (const tl of e.pendingTimelines(g)) {
          expect(playerToMoveAt(e.latestTurn(tl))).toBe(g.toMove);
        }
      });

      it('only ever offers actions on boards that are waiting', () => {
        const g = branched(game);
        const pending = new Set(e.pendingTimelines(g).map((t) => t.id));
        for (const a of game.actions(g)) {
          const read = e.adapter.read(a);
          if (read.kind === 'move') expect(pending.has(read.timeline)).toBe(true);
          if (read.kind === 'travel') expect(pending.has(read.fromTimeline)).toBe(true);
        }
      });

      it('refuses a timeline that does not exist', () => {
        const g = e.newGame();
        expect(() => e.getTimeline(g, 99)).toThrow();
      });

      it('never changes the state it was given', () => {
        const g = branched(game);
        const before = JSON.stringify(g);
        e.applyAction(g, game.actions(g)[0]);
        expect(JSON.stringify(g)).toBe(before);
      });
    });

    describe('time travel', () => {
      it('branches a timeline that starts one turn after the board it left from', () => {
        const g = branched(game);
        expect(g.timelines.length).toBeGreaterThan(1);
        const branch = g.timelines[g.timelines.length - 1];
        expect(branch.id).toBe(g.timelines.length - 1);
        expect(branch.boards).toHaveLength(1);
        expect(branch.branchedFrom).not.toBeNull();
        expect(branch.startTurn).toBe(branch.branchedFrom!.turn + 1);
        expect(branch.createdBy).not.toBeNull();
        expect(branch.origin).not.toBeNull();
      });

      it("makes two boards at once, the one left behind and the branch", () => {
        const g = branched(game);
        expect(g.lastCreated).toHaveLength(2);
        const [left, arrived] = g.lastCreated;
        // The first is the board the traveller departed from, the second the branch.
        expect(left.timeline).toBe(g.timelines[g.timelines.length - 1].origin!.timeline);
        expect(arrived.timeline).toBe(g.timelines.length - 1);
      });

      it("only offers past boards of the mover's own parity", () => {
        const g = branched(game);
        if (g.status !== 'playing') return;
        for (const tl of e.pendingTimelines(g)) {
          const here = e.latestTurn(tl);
          for (const ref of e.travelTargets(g, tl.id)) {
            expect(ref.turn).toBeLessThan(here);
            expect(playerToMoveAt(ref.turn)).toBe(g.toMove);
            // Never the newest board of its own timeline: those are played normally.
            expect(e.isLatest(g, ref)).toBe(false);
            expect(e.getBoard(g, ref)).toBeDefined();
          }
        }
      });

      it('leaves the board it branched from untouched', () => {
        const g = branched(game);
        const branch = g.timelines[g.timelines.length - 1];
        const from = branch.branchedFrom!;
        const stillThere = e.getBoard(g, from);
        expect(stillThere).toBeDefined();
        expect(JSON.stringify(stillThere)).not.toBe(JSON.stringify(branch.boards[0]));
      });

      it('waits for every new board before the turn passes', () => {
        const g = branched(game);
        if (g.status !== 'playing') return;
        const waiting = e.mandatoryTimelines(g).length;
        expect(waiting).toBeGreaterThan(0);
        let next = g;
        for (let i = 0; i < waiting - 1; i++) {
          const tl = e.mandatoryTimelines(next)[0];
          const action = game.actions(next).find((a) => !game.isTravel(a) && onTimeline(a, tl.id));
          if (!action) return;
          next = e.applyAction(next, action);
          if (next.status !== 'playing') return;
          expect(next.toMove).toBe(g.toMove);
        }
      });
    });

    describe('the strict present rule', () => {
      it('splits the waiting boards into mandatory and optional', () => {
        const g = branched(game, game.strictRules);
        if (g.status !== 'playing') return;
        const present = e.presentTurn(g);
        const pending = e.pendingTimelines(g);
        const mandatory = e.mandatoryTimelines(g);
        const optional = e.optionalTimelines(g);
        expect(mandatory.length + optional.length).toBe(pending.length);
        for (const tl of mandatory) expect(e.latestTurn(tl)).toBe(present);
        for (const tl of optional) expect(e.latestTurn(tl)).toBeGreaterThan(present);
      });

      it('only lets the turn be ended once nothing at the present is waiting', () => {
        const start = branched(game, game.strictRules);
        if (start.status !== 'playing') return;
        expect(e.canEndTurn(start)).toBe(e.mandatoryTimelines(start).length === 0 && e.optionalTimelines(start).length > 0);
        if (!e.canEndTurn(start)) {
          expect(() => e.applyAction(start, game.endTurn)).toThrow();
        }
        const ready = playUntil(game, start, (s) => e.canEndTurn(s));
        if (!ready) return;
        const after = e.applyAction(ready, game.endTurn);
        expect(after.toMove).not.toBe(ready.toMove);
        expect(after.lastCreated).toEqual([]);
      });

      it('never makes a board mandatory that is not waiting at all', () => {
        const g = branched(game, game.strictRules);
        const pendingIds = new Set(e.pendingTimelines(g).map((t) => t.id));
        for (const tl of e.mandatoryTimelines(g)) expect(pendingIds.has(tl.id)).toBe(true);
      });
    });

    describe('a finished game', () => {
      it('accepts nothing more', () => {
        let g = e.newGame();
        for (let i = 0; i < 200 && g.status === 'playing'; i++) {
          const options = game.actions(g);
          const action = options.find((a) => !game.isTravel(a)) ?? options[0];
          if (!action) break;
          g = e.applyAction(g, action);
        }
        if (g.status === 'playing') return;
        expect(e.pendingTimelines(g)).toEqual([]);
        expect(() => e.applyAction(g, game.endTurn)).toThrow(/game is over/);
      });
    });
  });

  function onTimeline(action: G['action'], id: number): boolean {
    const read = e.adapter.read(action);
    return read.kind === 'move' ? read.timeline === id : read.kind === 'travel' && read.fromTimeline === id;
  }
}

/** Re-exported so a game's suite can talk about refs without importing twice. */
export type { BoardRef };
export { sameRef };

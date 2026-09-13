import {
  Action,
  IllegalAction,
  applyAction,
  canEndTurn,
  getBoard,
  index,
  isTravelTarget,
  latestBoard,
  mandatoryTimelines,
  newGame,
  optionalTimelines,
  pendingTimelines,
  presentTurn,
  travelTargets,
} from '../index';

const mark = (timeline: number, cell: number): Action => ({ type: 'mark', timeline, cell });
const play = (actions: Action[], rules = {}) => actions.reduce((s, a) => applyAction(s, a), newGame(rules));

describe('turns', () => {
  it('starts with one empty board waiting for X', () => {
    const g = newGame();
    expect(g.timelines).toHaveLength(1);
    expect(g.toMove).toBe(0);
    expect(pendingTimelines(g)).toHaveLength(1);
    expect(latestBoard(g.timelines[0]).cells.every((c) => c === null)).toBe(true);
  });

  it('passes the turn after the one waiting board is played', () => {
    const g = play([mark(0, 0)]);
    expect(g.toMove).toBe(1);
    expect(g.timelines[0].boards).toHaveLength(2);
  });

  it('refuses a cell that is taken, and a board that is not waiting', () => {
    const g = play([mark(0, 4)]);
    expect(() => applyAction(g, mark(0, 4))).toThrow(IllegalAction);
    expect(() => applyAction(g, mark(1, 0))).toThrow();
  });

  it('counts a round each time both sides have moved', () => {
    expect(play([mark(0, 0), mark(0, 1)]).round).toBe(1);
  });
});

describe('winning', () => {
  it('ends the game on three in a row', () => {
    const g = play([mark(0, 0), mark(0, 3), mark(0, 1), mark(0, 4), mark(0, 2)]);
    expect(g.status).toBe('won');
    expect(g.win).toEqual({ player: 0, board: { timeline: 0, turn: 5 }, cells: [0, 1, 2] });
    expect(() => applyAction(g, mark(0, 5))).toThrow(/game is over/);
  });

  it('draws when the last board fills with nobody connected', () => {
    // x o x / x o o / o x x
    const g = play([
      mark(0, 0), mark(0, 1), mark(0, 2), mark(0, 4), mark(0, 3), mark(0, 5), mark(0, 7), mark(0, 6), mark(0, 8),
    ]);
    expect(g.status).toBe('draw');
    expect(g.win).toBeNull();
  });
});

describe('time travel', () => {
  it('offers only past boards where the cell is free and it was your move', () => {
    const g = play([mark(0, 0), mark(0, 4), mark(0, 8), mark(0, 2)]);
    // X to move on turn 4. Past boards at even turns: 0 and 2, neither the newest.
    expect(travelTargets(g, 0, 8).map((r) => r.turn)).toEqual([0, 2]);
    // Cell 0 is taken from turn 1 onwards, so only the empty first board takes it.
    expect(travelTargets(g, 0, 0).map((r) => r.turn)).toEqual([0]);
    expect(isTravelTarget(g, 0, 8, { timeline: 0, turn: 2 })).toBe(true);
    expect(isTravelTarget(g, 0, 8, { timeline: 0, turn: 3 })).toBe(false);
  });

  it('branches a new timeline, leaving the mark behind in the present', () => {
    const g = play([mark(0, 0), mark(0, 4), mark(0, 8), mark(0, 2)]);
    const after = applyAction(g, { type: 'travel', from: { timeline: 0, cell: 8 }, to: { timeline: 0, turn: 2 } });
    expect(after.timelines).toHaveLength(2);
    const branch = after.timelines[1];
    expect(branch.startTurn).toBe(3);
    expect(branch.branchedFrom).toEqual({ timeline: 0, turn: 2 });
    expect(branch.createdBy).toBe(0);
    expect(getBoard(after, { timeline: 1, turn: 3 })!.cells[8]).toBe(0);
    expect(getBoard(after, { timeline: 0, turn: 5 })!.cells[8]).toBeNull();
    // Both boards are now waiting for O.
    expect(after.toMove).toBe(1);
    expect(pendingTimelines(after)).toHaveLength(2);
  });

  it('refuses a travel the rules do not offer', () => {
    const g = play([mark(0, 0), mark(0, 4), mark(0, 8), mark(0, 2)]);
    // The cell is taken on that past board.
    expect(() => applyAction(g, { type: 'travel', from: { timeline: 0, cell: 0 }, to: { timeline: 0, turn: 2 } })).toThrow(
      /cannot be travelled to/,
    );
    // That turn was the opponent's move.
    expect(() => applyAction(g, { type: 'travel', from: { timeline: 0, cell: 8 }, to: { timeline: 0, turn: 1 } })).toThrow();
  });

  it("refuses to send the opponent's mark", () => {
    const g = play([mark(0, 0), mark(0, 4), mark(0, 8), mark(0, 2)]);
    expect(() => applyAction(g, { type: 'travel', from: { timeline: 0, cell: 4 }, to: { timeline: 0, turn: 0 } })).toThrow(
      /your own marks/,
    );
  });

  it('makes every waiting board mandatory before the turn passes', () => {
    let g = play([mark(0, 0), mark(0, 4), mark(0, 8), mark(0, 2)]);
    g = applyAction(g, { type: 'travel', from: { timeline: 0, cell: 8 }, to: { timeline: 0, turn: 2 } });
    expect(g.toMove).toBe(1);
    g = applyAction(g, mark(0, 5));
    expect(g.toMove).toBe(1); // still O: the branch is waiting too
    g = applyAction(g, mark(1, 5));
    expect(g.toMove).toBe(0);
  });
});

describe('the strict present rule', () => {
  const strict = { strictPresent: true };

  it('leaves boards ahead of the present optional and ends the turn by hand', () => {
    let g = play([mark(0, 0), mark(0, 4), mark(0, 8), mark(0, 2)], strict);
    g = applyAction(g, { type: 'travel', from: { timeline: 0, cell: 8 }, to: { timeline: 0, turn: 2 } });
    // The branch's newest board is at turn 3, the root's at turn 5: the present is turn 3.
    expect(presentTurn(g)).toBe(3);
    expect(mandatoryTimelines(g).map((t) => t.id)).toEqual([1]);
    expect(optionalTimelines(g).map((t) => t.id)).toEqual([0]);
    expect(canEndTurn(g)).toBe(false);
    g = applyAction(g, mark(1, 5));
    expect(canEndTurn(g)).toBe(true);
    expect(g.toMove).toBe(1);
    g = applyAction(g, { type: 'endTurn' });
    expect(g.toMove).toBe(0);
  });

  it('refuses to end the turn while a board at the present is waiting', () => {
    const g = newGame(strict);
    expect(() => applyAction(g, { type: 'endTurn' })).toThrow(/at the present/);
  });
});

describe('cells', () => {
  it('numbers cells left to right, top to bottom', () => {
    expect(index(0, 0)).toBe(0);
    expect(index(2, 2)).toBe(8);
  });
});

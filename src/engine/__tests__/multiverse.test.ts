import { boardFromRows, cellAt, dropDisc, emptyBoard, findLines } from '../board';
import { chooseAction } from '../bot';
import {
  Action,
  GameState,
  IllegalAction,
  applyAction,
  canEndTurn,
  canRotate,
  mandatoryTimelines,
  optionalTimelines,
  presentTurn,
  getBoard,
  latestTurn,
  newGame,
  pendingTimelines,
  resolveTurn,
  travelTargets,
} from '../multiverse';

function play(state: GameState, ...actions: Action[]): GameState {
  return actions.reduce((s, a) => applyAction(s, a), state);
}

const drop = (timeline: number, col: number): Action => ({ type: 'drop', timeline, col });

describe('multiverse basics', () => {
  it('starts with one timeline and Red to move', () => {
    const g = newGame();
    expect(g.timelines).toHaveLength(1);
    expect(g.toMove).toBe(0);
    expect(pendingTimelines(g).map((t) => t.id)).toEqual([0]);
    expect(travelTargets(g, 0)).toEqual([]);
  });

  it('passes the turn after a drop', () => {
    const g = play(newGame(), drop(0, 3));
    expect(g.toMove).toBe(1);
    expect(latestTurn(g.timelines[0])).toBe(1);
    expect(cellAt(getBoard(g, { timeline: 0, turn: 1 })!, 0, 3)).toBe(0);
    expect(g.lastCreated).toEqual([{ timeline: 0, turn: 1 }]);
  });

  it('rejects moves on boards that are not waiting', () => {
    const g = play(newGame(), drop(0, 3));
    expect(() => applyAction(g, drop(1, 0))).toThrow();
    // Yellow to move; timeline 0 IS pending so this is fine.
    expect(() => applyAction(g, drop(0, 0))).not.toThrow();
  });
});

describe('time travel', () => {
  // Turn 0 Red, 1 Yellow, 2 Red, 3 Yellow -> now turn 4, Red to move.
  const base = play(newGame(), drop(0, 0), drop(0, 1), drop(0, 2), drop(0, 3));

  it('only offers past boards where it was your move', () => {
    expect(base.toMove).toBe(0);
    // Turns 0 and 2 were Red's; turn 4 is the newest board so it is excluded.
    expect(travelTargets(base, 0)).toEqual([
      { timeline: 0, turn: 0 },
      { timeline: 0, turn: 2 },
    ]);
  });

  it('branches a new timeline and collapses the origin column', () => {
    // Red's discs are at (0,0) and (0,2). Send the one in column 0 back to turn 2.
    const g = play(base, {
      type: 'travel',
      from: { timeline: 0, row: 0, col: 0 },
      to: { timeline: 0, turn: 2 },
      col: 6,
    });
    expect(g.timelines).toHaveLength(2);
    // Origin timeline got a new board with the disc removed.
    const origin = getBoard(g, { timeline: 0, turn: 5 })!;
    expect(cellAt(origin, 0, 0)).toBeNull();
    expect(cellAt(origin, 0, 2)).toBe(0);
    // Branch starts at turn 3 with the disc added to the turn-2 board.
    const branch = g.timelines[1];
    expect(branch.startTurn).toBe(3);
    expect(branch.createdBy).toBe(0);
    expect(branch.branchedFrom).toEqual({ timeline: 0, turn: 2 });
    expect(branch.origin).toEqual({ timeline: 0, turn: 4 });
    const bb = getBoard(g, { timeline: 1, turn: 3 })!;
    expect(cellAt(bb, 0, 6)).toBe(0);
    expect(cellAt(bb, 0, 0)).toBe(0); // the turn-2 board already had this disc
    expect(cellAt(bb, 0, 1)).toBe(1);
    expect(cellAt(bb, 0, 3)).toBeNull(); // turn 3's yellow disc never happened here
    // Red is done: both newest boards belong to Yellow now.
    expect(g.toMove).toBe(1);
    expect(pendingTimelines(g).map((t) => t.id)).toEqual([0, 1]);
    expect(g.lastCreated).toEqual([
      { timeline: 0, turn: 5 },
      { timeline: 1, turn: 3 },
    ]);
  });

  it('makes the opponent move on every waiting board before the turn passes', () => {
    let g = play(base, {
      type: 'travel',
      from: { timeline: 0, row: 0, col: 0 },
      to: { timeline: 0, turn: 2 },
      col: 6,
    });
    g = applyAction(g, drop(1, 5));
    expect(g.toMove).toBe(1); // still Yellow: timeline 0 is waiting
    expect(pendingTimelines(g).map((t) => t.id)).toEqual([0]);
    g = applyAction(g, drop(0, 5));
    expect(g.toMove).toBe(0);
    expect(pendingTimelines(g).map((t) => t.id)).toEqual([0, 1]);
  });

  it('refuses to send the opponent disc, or to travel to a wrong board', () => {
    const wrongDisc: Action = {
      type: 'travel',
      from: { timeline: 0, row: 0, col: 1 },
      to: { timeline: 0, turn: 2 },
      col: 6,
    };
    expect(() => applyAction(base, wrongDisc)).toThrow(IllegalAction);
    const wrongParity: Action = {
      type: 'travel',
      from: { timeline: 0, row: 0, col: 0 },
      to: { timeline: 0, turn: 1 },
      col: 6,
    };
    expect(() => applyAction(base, wrongParity)).toThrow(IllegalAction);
    const newest: Action = {
      type: 'travel',
      from: { timeline: 0, row: 0, col: 0 },
      to: { timeline: 0, turn: 4 },
      col: 6,
    };
    expect(() => applyAction(base, newest)).toThrow(IllegalAction);
  });

  it('cannot travel to the newest board of another timeline', () => {
    // After a travel, Yellow has two pending boards at different turns.
    let g = play(base, {
      type: 'travel',
      from: { timeline: 0, row: 0, col: 0 },
      to: { timeline: 0, turn: 2 },
      col: 6,
    });
    g = play(g, drop(1, 5), drop(0, 5)); // Yellow plays both -> Red at turn 6 / turn 4
    expect(g.toMove).toBe(0);
    const targets = travelTargets(g, 0);
    // Timeline 1 newest board is turn 4 (Red's), but newest boards are never targets.
    expect(targets).not.toContainEqual({ timeline: 1, turn: 4 });
    expect(targets).toContainEqual({ timeline: 0, turn: 2 });
    expect(targets).toContainEqual({ timeline: 0, turn: 4 });
  });
});

describe('winning', () => {
  it('wins with four in a row on the newest board', () => {
    const g = play(
      newGame(),
      drop(0, 0), drop(0, 0),
      drop(0, 1), drop(0, 1),
      drop(0, 2), drop(0, 2),
      drop(0, 3),
    );
    expect(g.status).toBe('won');
    expect(g.win!.player).toBe(0);
    expect(g.win!.board).toEqual({ timeline: 0, turn: 7 });
    expect(g.win!.cells).toEqual([0, 1, 2, 3]);
    expect(() => applyAction(g, drop(0, 4))).toThrow(IllegalAction);
  });

  it('wins by dropping a disc into a past board', () => {
    // Red builds R R R in columns 0-2 while Yellow stacks column 6. Red then
    // "forgets" to win on turn 6 and plays column 5 instead; Yellow blocks.
    const g = play(
      newGame(),
      drop(0, 0), drop(0, 6),
      drop(0, 1), drop(0, 6),
      drop(0, 2), drop(0, 6),
      drop(0, 5), drop(0, 3), // Red misses the win, Yellow blocks column 3
    );
    expect(g.toMove).toBe(0);
    expect(travelTargets(g, 0)).toContainEqual({ timeline: 0, turn: 6 });
    const won = applyAction(g, {
      type: 'travel',
      from: { timeline: 0, row: 0, col: 5 },
      to: { timeline: 0, turn: 6 },
      col: 3,
    });
    expect(won.status).toBe('won');
    expect(won.win!.player).toBe(0);
    expect(won.win!.board).toEqual({ timeline: 1, turn: 7 });
  });

  it('can hand the opponent a win when a column collapses', () => {
    // Column 0 from the bottom: Y R Y Y Y. Removing the Red disc drops the
    // yellows together into a vertical four.
    const g: GameState = {
      ...newGame(),
      timelines: [
        {
          id: 0,
          startTurn: 0,
          boards: [
            emptyBoard(),
            emptyBoard(),
            boardFromRows([
              '.......',
              'Y......',
              'Y......',
              'Y......',
              'R......',
              'YR.....',
            ]),
          ],
          createdBy: null,
          branchedFrom: null,
          origin: null,
        },
      ],
      toMove: 0,
    };
    const after = applyAction(g, {
      type: 'travel',
      from: { timeline: 0, row: 1, col: 0 },
      to: { timeline: 0, turn: 0 },
      col: 3,
    });
    expect(after.status).toBe('won');
    expect(after.win!.player).toBe(1);
    expect(after.win!.board).toEqual({ timeline: 0, turn: 3 });
  });
});

describe('draws', () => {
  it('is a draw when every newest board is full', () => {
    const full = boardFromRows([
      'YRYRYRY',
      'YRYRYRY',
      'RYRYRYR',
      'RYRYRYR',
      'YRYRYRY',
      'YRYRYRY',
    ]);
    const g: GameState = {
      ...newGame(),
      timelines: [{ id: 0, startTurn: 0, boards: [emptyBoard(), full], createdBy: null, branchedFrom: null, origin: null }],
      toMove: 1,
    };
    expect(pendingTimelines(g)).toEqual([]);
    expect(resolveTurn(g).status).toBe('draw');
  });

  it('skips full boards but keeps playing elsewhere', () => {
    const nearlyFull = boardFromRows([
      'YRYRYR.',
      'YRYRYRY',
      'RYRYRYR',
      'RYRYRYR',
      'YRYRYRY',
      'YRYRYRY',
    ]);
    // Yellow to move on turn 41; filling the last slot ends that board.
    const g: GameState = {
      ...newGame(),
      timelines: [
        { id: 0, startTurn: 40, boards: [emptyBoard(), nearlyFull], createdBy: null, branchedFrom: null, origin: null },
        { id: 1, startTurn: 41, boards: [dropDisc(emptyBoard(), 0, 0)!.board], createdBy: 0, branchedFrom: { timeline: 0, turn: 40 }, origin: { timeline: 0, turn: 40 } },
      ],
      toMove: 1,
    };
    let s = applyAction(g, drop(0, 6));
    expect(s.status).toBe('playing');
    expect(s.toMove).toBe(1);
    s = applyAction(s, drop(1, 1));
    expect(s.toMove).toBe(0);
    expect(pendingTimelines(s).map((t) => t.id)).toEqual([1]);
  });
});

describe('spinning the board', () => {
  it('is a move that turns the newest board and passes the turn', () => {
    const g = play(newGame(), drop(0, 0), drop(0, 0), drop(0, 1));
    expect(g.toMove).toBe(1);
    expect(canRotate(g, 0)).toBe(true);
    const spun = applyAction(g, { type: 'rotate', timeline: 0, spin: 'cw' });
    expect(spun.toMove).toBe(0);
    const board = getBoard(spun, { timeline: 0, turn: 4 })!;
    expect(board.cols).toBe(6);
    expect(board.rows).toBe(7);
    expect(board.spun).toBe(true);
    // Column 0 was R then Y; column 1 was R. Clockwise, the old floor becomes
    // the new left wall, so both reds stack in column 0 and the Y drops into column 1.
    expect(cellAt(board, 0, 0)).toBe(0);
    expect(cellAt(board, 1, 0)).toBe(0);
    expect(cellAt(board, 0, 1)).toBe(1);
    expect(cellAt(board, 2, 0)).toBeNull();
    expect(spun.lastCreated).toEqual([{ timeline: 0, turn: 4 }]);
  });

  it('cannot spin an empty board or a board that was just spun', () => {
    expect(canRotate(newGame(), 0)).toBe(false);
    expect(() => applyAction(newGame(), { type: 'rotate', timeline: 0, spin: 'cw' })).toThrow(IllegalAction);
    const g = play(newGame(), drop(0, 3), { type: 'rotate', timeline: 0, spin: 'ccw' });
    expect(canRotate(g, 0)).toBe(false);
    expect(() => applyAction(g, { type: 'rotate', timeline: 0, spin: 'cw' })).toThrow(/just turned/);
    // A drop clears the restriction.
    const after = applyAction(g, drop(0, 0));
    expect(canRotate(after, 0)).toBe(true);
  });

  // Floor: R . R R . R .   with   Y . Y Y . Y .   on top. Clockwise, the old
  // floor becomes the new left-most column and the old row 1 the next one,
  // and gravity closes the gaps: four reds and four yellows, both vertical.
  const stacked = boardFromRows([
    '.......',
    '.......',
    '.......',
    '.......',
    'Y.YY.Y.',
    'R.RR.R.',
  ]);

  /** Put `board` on the newest turn belonging to `toMove` (turn 2 for Red, turn 1 for Yellow). */
  function withBoard(board: ReturnType<typeof boardFromRows>, toMove: 0 | 1): GameState {
    const boards = toMove === 0 ? [emptyBoard(), emptyBoard(), board] : [emptyBoard(), board];
    return {
      ...newGame(),
      timelines: [{ id: 0, startTurn: 0, boards, createdBy: null, branchedFrom: null, origin: null }],
      toMove,
    };
  }

  it('can win by spinning discs into a line', () => {
    expect(findLines(stacked)).toEqual([]);
    const spun = applyAction(withBoard(stacked, 0), { type: 'rotate', timeline: 0, spin: 'cw' });
    expect(spun.status).toBe('won');
    expect(spun.win!.player).toBe(0);
    expect(spun.win!.board).toEqual({ timeline: 0, turn: 3 });
    const won = getBoard(spun, spun.win!.board)!;
    expect(spun.win!.cells.map((i) => won.cells[i])).toEqual([0, 0, 0, 0]);
  });

  it('gives the spinner priority when both players line up', () => {
    const yellowSpins = applyAction(withBoard(stacked, 1), { type: 'rotate', timeline: 0, spin: 'cw' });
    expect(yellowSpins.win!.player).toBe(1);
  });

  it('can hand the opponent a win', () => {
    const risky = boardFromRows([
      '.......',
      '.......',
      '.......',
      '.......',
      'Y.Y..Y.',
      'R.RR.R.',
    ]);
    const spun = applyAction(withBoard(risky, 1), { type: 'rotate', timeline: 0, spin: 'cw' });
    expect(spun.status).toBe('won');
    expect(spun.win!.player).toBe(0);
  });
});

describe('variants', () => {
  const stacked = boardFromRows([
    '.......',
    '.......',
    '.......',
    '.......',
    'Y......',
    'RYY....',
  ]);

  it('are off by default', () => {
    const g = play(newGame(), drop(0, 0), drop(0, 1));
    expect(() => applyAction(g, { type: 'pop', timeline: 0, col: 0 })).toThrow(/not enabled/);
    expect(() => applyAction(g, { type: 'flip', timeline: 0 })).toThrow(/not enabled/);
  });

  it('pop out removes your own bottom disc and collapses the column', () => {
    const g: GameState = {
      ...newGame({ popOut: true }),
      timelines: [{ id: 0, startTurn: 0, boards: [emptyBoard(), emptyBoard(), stacked], createdBy: null, branchedFrom: null, origin: null }],
      toMove: 0,
    };
    expect(() => applyAction(g, { type: 'pop', timeline: 0, col: 1 })).toThrow(/your own/);
    const popped = applyAction(g, { type: 'pop', timeline: 0, col: 0 });
    const board = getBoard(popped, { timeline: 0, turn: 3 })!;
    expect(cellAt(board, 0, 0)).toBe(1);
    expect(cellAt(board, 1, 0)).toBeNull();
    expect(popped.toMove).toBe(1);
  });

  it('flip turns the board upside down with gravity and keeps its size', () => {
    const g: GameState = {
      ...newGame({ flip: true }),
      timelines: [{ id: 0, startTurn: 0, boards: [emptyBoard(), emptyBoard(), stacked], createdBy: null, branchedFrom: null, origin: null }],
      toMove: 0,
    };
    const flipped = applyAction(g, { type: 'flip', timeline: 0 });
    const board = getBoard(flipped, { timeline: 0, turn: 3 })!;
    expect(board.cols).toBe(7);
    expect(board.spun).toBe(true);
    // Column 0 (R below Y) ends up in column 6 with Y below R; the Ys in
    // columns 1 and 2 land in columns 5 and 4.
    expect(cellAt(board, 0, 6)).toBe(1);
    expect(cellAt(board, 1, 6)).toBe(0);
    expect(cellAt(board, 0, 5)).toBe(1);
    expect(cellAt(board, 0, 4)).toBe(1);
    expect(() => applyAction(flipped, { type: 'flip', timeline: 0 })).toThrow(/just turned/);
  });

  it('keeps the rules on the state so a saved game replays the same way', () => {
    expect(newGame({ popOut: true }).rules).toEqual({ popOut: true, flip: false, strictPresent: false });
    expect(play(newGame({ flip: true }), drop(0, 3)).rules.flip).toBe(true);
  });
});

describe('strict present rule', () => {
  const strict = () => newGame({ strictPresent: true });
  const dropIn = (timeline: number, col: number): Action => ({ type: 'drop', timeline, col });

  it('behaves like the relaxed rule while there is one timeline', () => {
    const g = play(strict(), dropIn(0, 0), dropIn(0, 1));
    expect(g.toMove).toBe(0);
    expect(mandatoryTimelines(g).map((t) => t.id)).toEqual([0]);
    expect(optionalTimelines(g)).toEqual([]);
    expect(() => applyAction(g, { type: 'endTurn' })).toThrow(IllegalAction);
  });

  it('makes only present boards mandatory after a travel into the deep past', () => {
    // t0 R, t1 Y, t2 R, t3 Y -> Red at t4 travels a disc back to t0.
    let g = play(strict(), dropIn(0, 0), dropIn(0, 1), dropIn(0, 2), dropIn(0, 3));
    g = applyAction(g, { type: 'travel', from: { timeline: 0, row: 0, col: 0 }, to: { timeline: 0, turn: 0 }, col: 6 });
    // Red's turn ended at once: nothing of Red's was left at the present.
    expect(g.toMove).toBe(1);
    expect(presentTurn(g)).toBe(1);
    expect(mandatoryTimelines(g).map((t) => t.id)).toEqual([1]);
    // Timeline 0 sits at turn 5, also Yellow's, but it is ahead of the present: optional.
    expect(optionalTimelines(g).map((t) => t.id)).toEqual([0]);
    expect(canEndTurn(g)).toBe(false);
    // Yellow plays the branch; now the mandatory board is done and the turn may end.
    g = applyAction(g, dropIn(1, 0));
    expect(g.toMove).toBe(1);
    expect(canEndTurn(g)).toBe(true);
    g = applyAction(g, { type: 'endTurn' });
    expect(g.toMove).toBe(0);
    expect(presentTurn(g)).toBe(2);
    expect(mandatoryTimelines(g).map((t) => t.id)).toEqual([1]);
    expect(optionalTimelines(g)).toEqual([]);
  });

  it('lets a player use an optional board before ending the turn', () => {
    let g = play(strict(), dropIn(0, 0), dropIn(0, 1), dropIn(0, 2), dropIn(0, 3));
    g = applyAction(g, { type: 'travel', from: { timeline: 0, row: 0, col: 0 }, to: { timeline: 0, turn: 0 }, col: 6 });
    g = applyAction(g, dropIn(0, 4)); // Yellow plays the optional board first
    expect(g.toMove).toBe(1);
    expect(optionalTimelines(g)).toEqual([]);
    g = applyAction(g, dropIn(1, 0)); // then the mandatory one: turn passes by itself
    expect(g.toMove).toBe(0);
  });

  it('keeps every present board on the mover parity across random play', () => {
    let seed = 11;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let game = 0; game < 4; game++) {
      let g = strict();
      let plies = 0;
      while (g.status === 'playing' && plies++ < 150) {
        const a = chooseAction(g, 3, rng)!;
        g = applyAction(g, a);
        if (g.status !== 'playing') break;
        for (const tl of mandatoryTimelines(g)) expect(latestTurn(tl) % 2).toBe(g.toMove);
        // Between finishing the present boards and ending the turn, the present has already moved on.
        if (!canEndTurn(g)) expect(presentTurn(g) % 2).toBe(g.toMove);
      }
    }
  });
});

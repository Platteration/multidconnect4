import { Board, boardFromRows, emptyBoard, findLines, index, legalColumns } from '../board';
import {
  BotLevel,
  boardScore,
  canForkOnBoard,
  canWinOnBoard,
  chooseAction,
  enumerateActions,
  playTurn,
} from '../bot';
import {
  Action,
  GameState,
  Timeline,
  applyAction,
  canRotate,
  latestBoard,
  newGame,
  pendingTimelines,
} from '../multiverse';
import { Player } from '../types';

const drop = (timeline: number, col: number): Action => ({ type: 'drop', timeline, col });
const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

function withBoard(rows: string[], toMove: 0 | 1, rules = {}): GameState {
  const board = boardFromRows(rows);
  const boards = toMove === 0 ? [emptyBoard(), emptyBoard(), board] : [emptyBoard(), board];
  return {
    ...newGame(rules),
    timelines: [{ id: 0, startTurn: 0, boards, createdBy: null, branchedFrom: null, origin: null }],
    toMove,
  };
}

describe('bot', () => {
  it.each([1, 2, 3] as BotLevel[])('level %i takes a win when it can', (level) => {
    const g = withBoard(['.......', '.......', '.......', '.......', 'Y......', 'RRR.YY.'], 0);
    const a = chooseAction(g, level, seeded());
    expect(a).toEqual(drop(0, 3));
  });

  it.each([2, 3] as BotLevel[])('level %i blocks an immediate threat', (level) => {
    const g = withBoard(['.......', '.......', '.......', '.......', '.......', 'RRR.YY.'], 1);
    const a = chooseAction(g, level, seeded());
    expect(a).toEqual(drop(0, 3));
  });

  it.each([2, 3] as BotLevel[])('level %i stops an open two from becoming a fork', (level) => {
    // Red has 3 and 4 on the floor with both sides open; Yellow must play 2 or 5.
    const g = withBoard(['.......', '.......', '.......', '.......', '.......', '...RR..'], 1);
    const a = chooseAction(g, level, seeded())!;
    expect(a.type).toBe('drop');
    expect([2, 5]).toContain((a as { col: number }).col);
  });

  it('level 1 only ever drops discs', () => {
    const g = withBoard(['.......', '.......', '.......', '.......', 'Y......', 'RY.....'], 0);
    expect(enumerateActions(g, 1).every((a) => a.type === 'drop')).toBe(true);
  });

  it('level 3 considers time travel and pop-out', () => {
    let g = newGame({ popOut: true });
    g = [drop(0, 0), drop(0, 1), drop(0, 2), drop(0, 3)].reduce((s, a) => applyAction(s, a), g);
    const kinds = new Set(enumerateActions(g, 3).map((a) => a.type));
    expect(kinds.has('travel')).toBe(true);
    expect(kinds.has('pop')).toBe(true);
    expect(kinds.has('rotate')).toBe(true);
  });

  it('plays every waiting board before its turn ends', () => {
    // Red travels to give Yellow two boards, then Yellow (the bot) must answer both.
    let g = newGame();
    g = [drop(0, 0), drop(0, 1), drop(0, 2), drop(0, 3)].reduce((s, a) => applyAction(s, a), g);
    g = applyAction(g, { type: 'travel', from: { timeline: 0, row: 0, col: 0 }, to: { timeline: 0, turn: 2 }, col: 6 });
    expect(pendingTimelines(g)).toHaveLength(2);
    const steps = playTurn(g, { level: 2, player: 1 }, seeded());
    expect(steps).toHaveLength(2);
    expect(steps[1].toMove).toBe(0);
  });

  it('never picks an illegal action over many random games', () => {
    const rng = seeded(7);
    for (let game = 0; game < 5; game++) {
      let g = newGame({ popOut: true, flip: true });
      let plies = 0;
      while (g.status === 'playing' && plies++ < 120) {
        const level = ((plies % 3) + 1) as BotLevel;
        const a = chooseAction(g, level, rng);
        expect(a).not.toBeNull();
        expect(() => (g = applyAction(g, a!))).not.toThrow();
      }
    }
  });
});

/**
 * What the bot works out per board used to be worked out by applying the move
 * to the whole multiverse, which copied every timeline once per column of
 * every waiting board, for every candidate it scored - so its cost grew with
 * the square of the multiverse and a long branching game became unplayable.
 * The answers are now cached on the board itself, which is only sound while
 * they keep meaning exactly what the old ones did. These tests are the oracle:
 * they ask the multiverse the slow way and demand the same answer.
 */
describe('what the bot works out per board', () => {
  /** The old question: is there a move on this board that wins the game now? */
  function winsByApplying(state: GameState, tl: Timeline): boolean {
    for (const col of legalColumns(latestBoard(tl))) {
      const next = applyAction(state, { type: 'drop', timeline: tl.id, col });
      if (next.status === 'won' && next.win?.player === state.toMove) return true;
    }
    if (canRotate(state, tl.id)) {
      for (const spin of ['cw', 'ccw'] as const) {
        const next = applyAction(state, { type: 'rotate', timeline: tl.id, spin });
        if (next.status === 'won' && next.win?.player === state.toMove) return true;
      }
    }
    return false;
  }

  /** The old fork question, written out by hand rather than reused. */
  function forksByHand(board: Board, player: Player): boolean {
    const winningColumns = (b: Board): number[] =>
      legalColumns(b).filter((col) => {
        let row = 0;
        while (b.cells[index(b, row, col)] !== null) row++;
        const cells = b.cells.slice();
        cells[index(b, row, col)] = player;
        return findLines({ ...b, cells }).some((l) => l.player === player);
      });
    return legalColumns(board).some((col) => {
      let row = 0;
      while (board.cells[index(board, row, col)] !== null) row++;
      const cells = board.cells.slice();
      cells[index(board, row, col)] = player;
      return winningColumns({ ...board, cells }).length >= 2;
    });
  }

  it('sees the win a drop gives, for the right player', () => {
    const board = boardFromRows(['.......', '.......', '.......', '.......', 'Y......', 'RRR.YY.']);
    // Asked about Yellow first: a cache that forgot the player would hand
    // Yellow's answer back for Red.
    expect(canWinOnBoard(board, 1)).toBe(false);
    expect(canWinOnBoard(board, 0)).toBe(true);
    const mirror = boardFromRows(['.......', '.......', '.......', '.......', 'Y......', 'RRR.YY.']);
    expect(canWinOnBoard(mirror, 0)).toBe(true);
    expect(canWinOnBoard(mirror, 1)).toBe(false);
    expect(canWinOnBoard(emptyBoard(), 0)).toBe(false);
  });

  it('sees a win only a spin gives', () => {
    // Red has four discs along the second row with Yellow between them; no
    // drop wins, but spinning drops all four into one column.
    const board = boardFromRows(['.......', '.......', '.......', '.......', 'R.R.R.R', 'RYRYRYR']);
    expect(legalColumns(board).some((col) => {
      const cells = board.cells.slice();
      let row = 0;
      while (cells[index(board, row, col)] !== null) row++;
      cells[index(board, row, col)] = 0;
      return findLines({ ...board, cells }).some((l) => l.player === 0);
    })).toBe(false);
    expect(canWinOnBoard(board, 0)).toBe(true);
    // A board that was just spun cannot be spun again, so the same cells no
    // longer offer that win - which is what `canRotate` used to enforce.
    expect(canWinOnBoard({ ...board, spun: true }, 0)).toBe(false);
  });

  it('sees the fork the old code saw', () => {
    const board = boardFromRows(['.......', '.......', '.......', '.......', '.......', '...RR..']);
    expect(canForkOnBoard(board, 0)).toBe(forksByHand(board, 0));
    expect(canForkOnBoard(board, 0)).toBe(true);
    expect(canForkOnBoard(emptyBoard(), 1)).toBe(false);
  });

  it('agrees with the multiverse over whole played-out games', () => {
    const rng = seeded(23);
    let sawAWin = false;
    let sawNoWin = false;
    for (let game = 0; game < 2; game++) {
      let g = newGame({ popOut: true, flip: true });
      let plies = 0;
      while (g.status === 'playing' && plies++ < 40) {
        for (const tl of pendingTimelines(g)) {
          const board = latestBoard(tl);
          const expected = winsByApplying(g, tl);
          expect(canWinOnBoard(board, g.toMove)).toBe(expected);
          expect(canForkOnBoard(board, g.toMove)).toBe(forksByHand(board, g.toMove));
          if (expected) sawAWin = true;
          else sawNoWin = true;
        }
        const a = chooseAction(g, 3, rng);
        if (!a) break;
        g = applyAction(g, a);
      }
    }
    // A test that only ever saw one answer would prove nothing.
    expect(sawAWin).toBe(true);
    expect(sawNoWin).toBe(true);
  });

  it('scores a board the same way every time, and each player its own way', () => {
    const board = boardFromRows(['.......', '.......', '.......', '.......', 'Y......', 'RRR.YY.']);
    const forYellow = boardScore(board, 1);
    const forRed = boardScore(board, 0);
    expect(forRed).not.toBe(forYellow);
    expect(boardScore(board, 0)).toBe(forRed);
    expect(boardScore(board, 1)).toBe(forYellow);
    // A different board is worth something different, cache or no cache.
    expect(boardScore(emptyBoard(), 0)).toBe(0);
    expect(forRed).toBeGreaterThan(0);
  });
});

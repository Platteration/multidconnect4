import { boardFromRows, emptyBoard } from '../board';
import { BotLevel, chooseAction, enumerateActions, playTurn } from '../bot';
import { Action, GameState, applyAction, newGame, pendingTimelines } from '../multiverse';

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

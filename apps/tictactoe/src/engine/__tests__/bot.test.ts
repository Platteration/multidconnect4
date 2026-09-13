import { Action, BotLevel, applyAction, boardFromRows, newGame } from '../index';
import { chooseAction, enumerateActions, playTurn } from '../bot';
import { GameState } from '../multiverse';

/** A predictable rng so a level's choice is the same every run. */
const seeded = (seed = 1) => {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
};

const from = (rows: string[], toMove: 0 | 1, boards = 3): GameState => ({
  ...newGame(),
  toMove,
  timelines: [
    {
      id: 0,
      startTurn: 0,
      boards: [...Array(boards - 1).fill(boardFromRows(['...', '...', '...'])), boardFromRows(rows)],
      createdBy: null,
      branchedFrom: null,
      origin: null,
    },
  ],
});

const levels: BotLevel[] = [1, 2, 3];

describe('the bot', () => {
  it.each(levels)('level %i takes a win it can see', (level) => {
    const g = from(['xx.', 'oo.', '...'], 0);
    const a = chooseAction(g, level, seeded())!;
    expect(applyAction(g, a).win?.player).toBe(0);
  });

  it.each([2, 3] as BotLevel[])('level %i blocks a line it must block', (level) => {
    const g = from(['oo.', 'x..', 'x..'], 0);
    const a = chooseAction(g, level, seeded()) as Extract<Action, { type: 'mark' }>;
    expect(a.type).toBe('mark');
    expect(a.cell).toBe(2);
  });

  it('only travels at the top level', () => {
    const g = from(['x.o', '.x.', 'o.x'], 0);
    expect(enumerateActions(g, 1).every((a) => a.type === 'mark')).toBe(true);
    expect(enumerateActions(g, 3).some((a) => a.type === 'travel')).toBe(true);
  });

  it('plays a whole turn, one board at a time', () => {
    const g = newGame();
    const steps = playTurn(g, { level: 2, player: 0 }, seeded());
    expect(steps).toHaveLength(1);
    expect(steps[0].toMove).toBe(1);
  });

  it.each(levels)('level %i can play a game out without an illegal move', (level) => {
    const rng = seeded(level * 7 + 1);
    let g = newGame();
    let guard = 0;
    while (g.status === 'playing' && guard++ < 400) {
      const a = chooseAction(g, level, rng);
      if (!a) break;
      g = applyAction(g, a);
    }
    expect(g.status === 'won' || g.status === 'draw').toBe(true);
  });
});

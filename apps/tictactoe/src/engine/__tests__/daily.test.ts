import { EMPTY_DAILY, previousIso, todayIso, winningActions, withSolvedDay } from '@5d/core';
import { applyAction, engine, enumerateActions, pendingTimelines } from '../index';
import { dailyPuzzle } from '../../puzzles/daily';

const source = { engine, actions: (s: Parameters<typeof enumerateActions>[0]) => enumerateActions(s, 3) };

/** Thirty days from a fixed Monday, so the run covers every weekday. */
const DAYS = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(2026, 8, 14 + i);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
});

describe("today's challenge", () => {
  it.each(DAYS)('%s is a playable position whose stated solution wins', (iso) => {
    const puzzle = dailyPuzzle(iso);
    expect(puzzle).not.toBeNull();
    const { state, player, solution } = puzzle!;
    expect(state.status).toBe('playing');
    expect(state.win).toBeNull();
    expect(state.toMove).toBe(player);
    expect(pendingTimelines(state).length).toBeGreaterThan(0);

    const wins = winningActions(source, state);
    expect(wins.length).toBeGreaterThan(0);
    // "Only one" is a promise the brief makes, so it has to be true when made.
    if (puzzle!.brief.includes('Only one')) expect(wins).toHaveLength(1);

    const after = applyAction(state, solution[0]);
    expect(after.status).toBe('won');
    expect(after.win?.player).toBe(player);
  });

  it('gives the same puzzle to everyone on the same day', () => {
    // A second module instance would regenerate rather than read the cache.
    jest.resetModules();
    const again = require('../../puzzles/daily') as typeof import('../../puzzles/daily');
    for (const iso of DAYS.slice(0, 5)) {
      expect(JSON.stringify(again.dailyPuzzle(iso))).toBe(JSON.stringify(dailyPuzzle(iso)));
    }
  });

  it('asks for a time travel on its travel days', () => {
    const wednesdays = DAYS.filter((iso) => new Date(`${iso}T12:00:00`).getDay() === 3);
    const travelled = wednesdays.filter((iso) => dailyPuzzle(iso)!.solution[0].type === 'travel');
    // Not every Wednesday can be built that way, but most should be.
    expect(travelled.length).toBeGreaterThan(wednesdays.length / 2);
  });
});

describe('the streak', () => {
  it('counts up on consecutive days and resets after a gap', () => {
    let d = withSolvedDay(EMPTY_DAILY, '2026-09-14');
    expect(d).toMatchObject({ streak: 1, best: 1, lastSolved: '2026-09-14' });
    d = withSolvedDay(d, '2026-09-15');
    d = withSolvedDay(d, '2026-09-16');
    expect(d).toMatchObject({ streak: 3, best: 3 });
    // A day missed breaks the run, but not the best.
    d = withSolvedDay(d, '2026-09-18');
    expect(d).toMatchObject({ streak: 1, best: 3, days: ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-18'] });
  });

  it('ignores a day that was already solved', () => {
    const once = withSolvedDay(EMPTY_DAILY, '2026-09-14');
    expect(withSolvedDay(once, '2026-09-14')).toBe(once);
  });

  it('knows what yesterday was, across a month and a year', () => {
    expect(previousIso('2026-09-01')).toBe('2026-08-31');
    expect(previousIso('2027-01-01')).toBe('2026-12-31');
    expect(previousIso(todayIso(new Date(2026, 2, 1)))).toBe('2026-02-28');
  });
});

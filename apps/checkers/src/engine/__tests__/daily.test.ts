import { winningActions } from '@5d/core';
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

  it('asks for a chain of jumps on some days', () => {
    const chained = DAYS.map((iso) => dailyPuzzle(iso)!.solution[0]).filter(
      (a) => a.type === 'move' && a.move.captures.length > 1,
    );
    expect(chained.length).toBeGreaterThan(0);
  });
});

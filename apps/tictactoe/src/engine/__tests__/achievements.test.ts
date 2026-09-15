import { achievementsFor, describeRun, progressAchievementsFor } from '@5d/core';
import { Action, applyAction, newGame } from '../index';

const mark = (timeline: number, cell: number): Action => ({ type: 'mark', timeline, cell });
const play = (actions: Action[]) =>
  actions.reduce((h, a) => [...h, applyAction(h[h.length - 1], a)], [newGame()]);

/** X wins straight down the first column, with no travelling at all. */
const plainWin = play([mark(0, 0), mark(0, 4), mark(0, 3), mark(0, 5), mark(0, 6)]);

/** X sends a mark back, both sides answer on both boards, then X wins on the branch. */
const branchWin = play([
  mark(0, 0),
  mark(0, 4),
  mark(0, 8),
  mark(0, 2),
  { type: 'travel', from: { timeline: 0, cell: 8 }, to: { timeline: 0, turn: 2 } },
  mark(0, 5),
  mark(1, 5),
  mark(0, 3),
  mark(1, 3),
  mark(0, 7),
  mark(1, 7),
  mark(1, 6),
]);

describe('reading a finished game', () => {
  it('sees a plain win against a bot', () => {
    const run = describeRun(plainWin, { mode: 'bot', bot: { level: 3, player: 1 } });
    expect(run).toMatchObject({ me: 0, won: true, drawn: false, botLevel: 3, travels: 0, maxTimelines: 1 });
    expect(achievementsFor(run)).toEqual(expect.arrayContaining(['beat-paradox', 'win-no-travel']));
    expect(achievementsFor(run)).not.toContain('first-branch');
  });

  it('counts the travel and the timeline it made', () => {
    const run = describeRun(branchWin, { mode: 'local' });
    expect(run.travelsBySomeone).toBe(1);
    expect(run.maxTimelines).toBe(2);
    expect(run.wonOnBranch).toBe(true);
    expect(achievementsFor(run)).toContain('first-branch');
  });

  it('gives no bot badge for a game with no bot', () => {
    const run = describeRun(plainWin, { mode: 'local' });
    expect(run.won).toBe(false); // nobody "is" the player in pass-and-play
    expect(achievementsFor(run)).not.toContain('beat-paradox');
  });

  it('knows which side made each travel, and who won where', () => {
    const asX = describeRun(branchWin, { mode: 'bot', bot: { level: 1, player: 1 } });
    const asO = describeRun(branchWin, { mode: 'bot', bot: { level: 1, player: 0 } });
    expect(asX.travels).toBe(1); // X did the travelling
    expect(asO.travels).toBe(0);
    expect(achievementsFor(asX)).toContain('win-on-branch');
    expect(achievementsFor(asO)).not.toContain('win-on-branch');
  });
});

describe('badges that span games', () => {
  it('needs every puzzle, a week of dailies, or thirty of them', () => {
    expect(progressAchievementsFor({ puzzlesSolved: 3, puzzleCount: 3, dailyStreak: 0, dailyDays: 0 })).toEqual([
      'all-puzzles',
    ]);
    expect(progressAchievementsFor({ puzzlesSolved: 0, puzzleCount: 3, dailyStreak: 7, dailyDays: 7 })).toEqual([
      'streak-7',
    ]);
    expect(progressAchievementsFor({ puzzlesSolved: 0, puzzleCount: 0, dailyStreak: 1, dailyDays: 30 })).toEqual([
      'dailies-30',
    ]);
  });
});

import { Action, GameState, applyAction, mandatoryTimelines, newGame } from '../../engine';
import { enumerateActions } from '../../engine/bot';
import { PUZZLES } from '../../puzzles';
import { MAX_SAVED_ACTIONS, restoreSavedGame, toSavedGame } from '../savedGame';
import { MAX_BOARDS, MAX_TIMELINES, withinStateLimits } from '../share';
import { GameSetup } from '../setup';

const drop = (timeline: number, col: number): Action => ({ type: 'drop', timeline, col });

/** A game with a branch in it, so several timelines and many boards exist. */
function sampleHistory(): GameState[] {
  const actions: Action[] = [
    drop(0, 0), drop(0, 6), drop(0, 1), drop(0, 6), drop(0, 2), drop(0, 5),
    { type: 'travel', from: { timeline: 0, row: 0, col: 2 }, to: { timeline: 0, turn: 2 }, col: 4 },
    drop(0, 3), drop(1, 3), drop(0, 4), drop(1, 4),
  ];
  return actions.reduce((h, a) => [...h, applyAction(h[h.length - 1], a)], [newGame()]);
}

/**
 * A game two stubborn players actually reach: with pop out on, every move
 * leaves a board behind and the board keeps coming back to empty, so a few
 * hundred moves is one long timeline of hundreds of boards.
 */
function longShufflingGame(moves: number): GameState[] {
  const actions: Action[] = [];
  while (actions.length < moves) {
    actions.push(drop(0, 0), drop(0, 1), { type: 'pop', timeline: 0, col: 0 }, { type: 'pop', timeline: 0, col: 1 });
  }
  return actions
    .slice(0, moves)
    .reduce((h, a) => [...h, applyAction(h[h.length - 1], a)], [newGame({ popOut: true })]);
}

/** The other shape a long game takes: travel whenever travelling is legal. */
function longBranchingGame(): GameState[] {
  const history: GameState[] = [newGame()];
  while (history.length <= 200) {
    const state = history[history.length - 1];
    const legal = enumerateActions(state, 3);
    const action = legal.find((a) => a.type === 'travel') ?? legal[0];
    if (!action) break;
    const next = applyAction(state, action);
    if (next.status !== 'playing') break;
    history.push(next);
  }
  return history;
}

const LOCAL: GameSetup = { mode: 'local' };

describe('the game in storage', () => {
  it('rebuilds exactly the game that was saved', () => {
    const history = sampleHistory();
    const restored = restoreSavedGame(JSON.parse(JSON.stringify(toSavedGame(history, LOCAL))));
    expect(restored).not.toBeNull();
    expect(restored!.history).toHaveLength(history.length);
    expect(restored!.history).toEqual(history);
    expect(restored!.setup).toEqual(LOCAL);
  });

  it('is a fraction of the size of the states it replaces', () => {
    // Every state holds every board of every timeline, and JSON expands the
    // boards that are shared by reference in memory - which is how a long game
    // reached megabytes, past what one AsyncStorage row can hold.
    const history = sampleHistory();
    const asStates = JSON.stringify({ version: 2, history, setup: LOCAL }).length;
    const asActions = JSON.stringify(toSavedGame(history, LOCAL)).length;
    expect(asActions * 20).toBeLessThan(asStates);
  });

  it('rebuilds a puzzle from the puzzle itself', () => {
    const puzzle = PUZZLES[0];
    const setup: GameSetup = {
      mode: 'puzzle',
      puzzleId: puzzle.id,
      player: puzzle.player,
      within: puzzle.within,
      bot: { level: 3, player: puzzle.player === 0 ? 1 : 0 },
    };
    const history = [puzzle.state, applyAction(puzzle.state, puzzle.solution[0])];
    const restored = restoreSavedGame(JSON.parse(JSON.stringify(toSavedGame(history, setup))));
    expect(restored!.history).toEqual(history);
    expect(restored!.setup).toEqual(setup);
  });

  it('keeps a game that has outgrown what a code is allowed to carry', () => {
    // A save is the player's own game, not a stranger's code: every state in
    // it was reached a move at a time through the app and drew fine on the
    // way. This one is past the size an imported code is refused for, and it
    // has to still be there in the morning, whole.
    const history = longBranchingGame();
    const last = history[history.length - 1];
    const boards = last.timelines.reduce((n, tl) => n + tl.boards.length, 0);
    // Big enough to be the case under test, counted from the game itself.
    expect(boards > MAX_BOARDS || last.timelines.length > MAX_TIMELINES).toBe(true);
    expect(history.length - 1).toBeLessThanOrEqual(MAX_SAVED_ACTIONS);

    const restored = restoreSavedGame(JSON.parse(JSON.stringify(toSavedGame(history, LOCAL))));
    expect(restored).not.toBeNull();
    expect(restored!.truncated).toBe(false);
    expect(restored!.history).toHaveLength(history.length);
    expect(restored!.history[restored!.history.length - 1]).toEqual(last);
  });

  it('brings back what it can of a game longer than it will replay, not nothing', () => {
    // The ceiling on this path is real - an unbounded replay at launch is
    // unbounded work behind the spinner - but it used to refuse: replay
    // returned null, App.tsx removed the key, and a 55 KB save that storage
    // was nowhere near refusing became a new game at turn 0, in silence. The
    // game a code cannot carry is exactly the game this path exists for, so
    // what it can replay comes back, and says that it is short.
    const history = longShufflingGame(MAX_SAVED_ACTIONS + 40);
    expect(history.length - 1).toBeGreaterThan(MAX_SAVED_ACTIONS);

    const stored = JSON.parse(JSON.stringify(toSavedGame(history, LOCAL)));
    expect(JSON.stringify(stored).length).toBeLessThan(200 * 1024);
    const restored = restoreSavedGame(stored);
    expect(restored).not.toBeNull();
    expect(restored!.truncated).toBe(true);
    // What it kept is the game as it was played, up to where it stopped.
    expect(restored!.history.length).toBeGreaterThan(history.length / 2);
    expect(restored!.history[restored!.history.length - 1]).toEqual(history[restored!.history.length - 1]);
    expect(restored!.history[0]).toEqual(history[0]);
  });

  it('keeps every move of the long pop-out game, which a code carries too', () => {
    // The 500-move game the save path was written for. Nothing about it is
    // exotic, and both paths have to hold it: kept here, sendable there.
    const history = longShufflingGame(500);
    const last = history[history.length - 1];
    expect(last.timelines[0].boards).toHaveLength(501);
    const restored = restoreSavedGame(JSON.parse(JSON.stringify(toSavedGame(history, LOCAL))));
    expect(restored!.truncated).toBe(false);
    expect(restored!.history).toHaveLength(history.length);
    expect(restored!.history[restored!.history.length - 1]).toEqual(last);
    expect(withinStateLimits(last)).toBe(true);
  });

  it('still reads a save written as whole states', () => {
    const history = sampleHistory();
    const restored = restoreSavedGame({ version: 2, history, setup: LOCAL });
    expect(restored!.history).toEqual(history);
  });

  it('reads a version 1 save from before rules existed, without crashing on it', () => {
    // The states in such a save have no `rules`, and the first thing the screen
    // does with a restored state is read state.rules.strictPresent.
    const history = sampleHistory().map((s) => {
      const copy = { ...s } as Partial<GameState>;
      delete copy.rules;
      return copy;
    });
    const restored = restoreSavedGame({ version: 1, history });
    expect(restored).not.toBeNull();
    expect(restored!.history).toHaveLength(history.length);
    for (const state of restored!.history) {
      expect(state.rules).toEqual({ popOut: false, flip: false, strictPresent: false });
      expect(() => mandatoryTimelines(state)).not.toThrow();
    }
  });
});

describe('a saved game that cannot be trusted', () => {
  const history = sampleHistory();

  const corrupt: unknown[] = [
    null,
    'nonsense',
    42,
    {},
    { version: 9, history },
    { version: 2, history: [] },
    { version: 2, history: 'not a list' },
    // A state stripped of the fields the first render reads.
    { version: 2, history: [{ timelines: [], toMove: 0, status: 'playing' }] },
    { version: 2, history: [{ ...history[0] }, { lastAction: null }] },
    { version: 2, history: [{ ...history[0] }, { lastAction: { type: 'drop', timeline: 4, col: 0 } }] },
    { version: 3, rules: {}, setup: LOCAL, actions: 'not a list' },
    { version: 3, rules: {}, setup: LOCAL, actions: [{ type: 'drop', timeline: 0, col: 99 }] },
    { version: 3, rules: {}, setup: LOCAL, actions: [{ type: 'travel', from: { timeline: 0, row: 0, col: 7 } }] },
    { version: 3, rules: {}, setup: { mode: 'puzzle', puzzleId: 'no-such-puzzle' }, actions: [] },
  ];

  it('is dropped rather than handed to the screen', () => {
    for (const value of corrupt) {
      expect(() => restoreSavedGame(value)).not.toThrow();
      const restored = restoreSavedGame(value);
      if (restored) {
        // Anything that does come back must be a game the screen can draw.
        for (const state of restored.history) {
          expect(Array.isArray(state.timelines)).toBe(true);
          expect(() => mandatoryTimelines(state)).not.toThrow();
        }
      }
    }
    // The ones that carry a real but unusable game are refused outright.
    expect(restoreSavedGame({ version: 9, history })).toBeNull();
    expect(restoreSavedGame({ version: 2, history: [{ ...history[0] }, { lastAction: null }] })).toBeNull();
    expect(restoreSavedGame({ version: 3, rules: {}, setup: LOCAL, actions: [{ type: 'drop', timeline: 0, col: 99 }] })).toBeNull();
  });

  it('will not replay an unbounded list of actions', () => {
    // Nonsense past the first few moves: the column fills, so this one is
    // refused outright rather than truncated.
    const actions = Array.from({ length: MAX_SAVED_ACTIONS + 1 }, () => drop(0, 0));
    const started = Date.now();
    expect(restoreSavedGame({ version: 3, rules: {}, setup: LOCAL, actions })).toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('does not walk a list past the point it stops replaying it', () => {
    // Truncating must not mean reading the whole list first: a stored value
    // is still a stored value, and this one is 200 times the ceiling.
    const cycle: Action[] = [
      drop(0, 0),
      drop(0, 1),
      { type: 'pop', timeline: 0, col: 0 },
      { type: 'pop', timeline: 0, col: 1 },
    ];
    const actions: unknown[] = Array.from({ length: MAX_SAVED_ACTIONS * 200 }, (_, i) =>
      i < MAX_SAVED_ACTIONS ? cycle[i % 4] : 'not an action at all',
    );
    const started = Date.now();
    const restored = restoreSavedGame({ version: 3, rules: { popOut: true }, setup: LOCAL, actions });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(restored).not.toBeNull();
    expect(restored!.truncated).toBe(true);
    expect(restored!.history).toHaveLength(MAX_SAVED_ACTIONS + 1);
  });

  it('keeps a bot game only when the bot is one this app has', () => {
    const saved = toSavedGame(history, { mode: 'bot', bot: { level: 2, player: 1 } });
    expect(restoreSavedGame(saved)!.setup).toEqual({ mode: 'bot', bot: { level: 2, player: 1 } });
    const nonsense = { ...saved, setup: { mode: 'bot', bot: { level: 99, player: 'red' } } };
    expect(restoreSavedGame(nonsense)!.setup).toEqual({ mode: 'local' });
  });
});

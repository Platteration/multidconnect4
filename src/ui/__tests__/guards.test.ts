import { Action, GameState, applyAction, newGame } from '../../engine';
import { botShouldMove, cellLabel, travelOrigin } from '../guards';
import type { Selection } from '../useGame';

const drop = (timeline: number, col: number): Action => ({ type: 'drop', timeline, col });

// The screen cannot be rendered here (it is React Native all the way down), so
// that these helpers are the ones it really uses is checked by reading it.
// Declared locally because this project carries no node type definitions.
declare const require: (name: string) => { readFileSync(path: string, encoding: string): string };
declare const __dirname: string;
const source = (file: string): string => require('fs').readFileSync(`${__dirname}/../${file}`, 'utf8');

describe('when the bot may move', () => {
  const ok = { replaying: false, humanTurn: false, spinning: false, status: 'playing' as const };

  it('moves only when the live game is waiting for it', () => {
    expect(botShouldMove(ok)).toBe(true);
    expect(botShouldMove({ ...ok, humanTurn: true })).toBe(false);
    expect(botShouldMove({ ...ok, spinning: true })).toBe(false);
    expect(botShouldMove({ ...ok, status: 'won' })).toBe(false);
    expect(botShouldMove({ ...ok, status: 'draw' })).toBe(false);
  });

  it('never moves while the replay is open', () => {
    // Opening the replay used to force "it is not the human's turn", which
    // started the bot loop instead of stopping it - and the move it chose from
    // the replayed state was then applied to the live game.
    expect(botShouldMove({ ...ok, replaying: true })).toBe(false);
    expect(botShouldMove({ ...ok, replaying: true, humanTurn: true })).toBe(false);
  });

  it('is asked about the live game, not the state on screen', () => {
    const src = source('GameScreen.tsx');
    expect(src).toContain('chooseAction(liveState');
    expect(src).not.toMatch(/chooseAction\(state\b/);
    expect(src).toMatch(/botShouldMove\(\{[^}]*humanTurn: game\.humanTurn/);
  });
});

describe('the origin of a picked-up disc', () => {
  const live: GameState = [drop(0, 0), drop(0, 1), drop(0, 2), drop(0, 3)].reduce(
    (s, a) => applyAction(s, a),
    newGame(),
  );
  const branched = applyAction(live, {
    type: 'travel',
    from: { timeline: 0, row: 0, col: 0 },
    to: { timeline: 0, turn: 0 },
    col: 6,
  });
  const holding: Selection = { kind: 'disc', from: { timeline: 1, row: 0, col: 6 } };

  it('is the newest board of the timeline the disc sits on', () => {
    expect(travelOrigin(branched, holding, false)).toEqual({ timeline: 1, turn: 1 });
    expect(travelOrigin(branched, { kind: 'none' }, false)).toBeNull();
  });

  it('is nothing while replaying a state that never had that timeline', () => {
    // The replayed state has one timeline; the held disc is on the second.
    expect(newGame().timelines).toHaveLength(1);
    expect(() => travelOrigin(newGame(), holding, true)).not.toThrow();
    expect(travelOrigin(newGame(), holding, true)).toBeNull();
    // Even asked about the live game, a timeline that is gone is not a throw.
    expect(travelOrigin(newGame(), holding, false)).toBeNull();
  });

  it('is what the screen actually uses, and the replay puts the disc down', () => {
    const src = source('GameScreen.tsx');
    expect(src).toMatch(/const origin = travelOrigin\(state, selection, replaying\)/);
    expect(src).toMatch(/const openReplay = \(\) => \{\s*game\.cancel\(\);\s*setReplayIndex\(0\);/);
    expect(src).not.toMatch(/onPress: \(\) => setReplayIndex\(0\)/);
  });
});

describe('cell labels', () => {
  const names: readonly [string, string] = ['Red', 'Yellow'];

  it('names the player on the disc', () => {
    expect(cellLabel(0, 0, 0, names)).toBe('row 1 column 1 red');
    expect(cellLabel(2, 3, 1, names)).toBe('row 3 column 4 yellow');
    expect(cellLabel(0, 0, null, names)).toBe('row 1 column 1 empty');
  });

  it('calls anything that is not a player empty, instead of throwing', () => {
    // A corrupt board could hold undefined; reading a name off it took the
    // whole app down, because nothing above this catches a render throw.
    for (const value of [undefined, -1, 2, '0', {}]) {
      expect(() => cellLabel(0, 0, value, names)).not.toThrow();
      expect(cellLabel(0, 0, value, names)).toBe('row 1 column 1 empty');
    }
  });

  it('is what the board actually renders', () => {
    const src = source('DiscBoard.tsx');
    expect(src).toContain('cellLabel(r, c, value, colors.playerNames)');
    expect(src).not.toMatch(/playerNames\[value\]/);
  });
});

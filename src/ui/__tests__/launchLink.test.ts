/**
 * The link the app was launched with is answered once. `Linking.getInitialURL`
 * reports the same address for as long as the app runs - React Native keeps
 * the intent or launch option that started it, and react-native-web reads
 * `location.href` once, when the bundle loads - so it is no record of what is
 * still waiting to be answered. The screen asked it again on every mount, and
 * the screen is mounted again by the error boundary's reset: after a render
 * failure, "Clear it and start over" promised a new game and loaded the link's
 * game instead, with no question asked, even when the player had already
 * declined that link with "Keep playing". The autosave then wrote it over the
 * save the reset had just cleared.
 *
 * This mounts the real App and GameScreen, with one screen below it that can
 * be made to throw, and asks the platform for the same link every time, the
 * way the platform does.
 */
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { KEYS } from '../../app/persist';
import { toSavedGame } from '../../app/savedGame';
import { encodeGame } from '../../app/share';
import { Action, GameState, applyAction, newGame } from '../../engine';

// (babel-jest lifts every jest.mock above these imports.)
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (key: string) => store.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: async (key: string) => {
        store.delete(key);
      },
      getAllKeys: async () => [...store.keys()],
    },
  };
});
// The real provider renders nothing until the native side reports its insets.
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../app/sound', () => ({ playSound: () => {}, setSoundEnabled: () => {} }));
// One sheet that renders with the screen and throws while told to: any render
// failure below the boundary is what puts the reset in front of the player.
jest.mock('../StatsModal', () => ({
  StatsModal: () => {
    if (mockFailure.on) throw new Error('a render that throws');
    return null;
  },
}));

const mockFailure = { on: false };

const drop = (col: number): Action => ({ type: 'drop', timeline: 0, col });
const play = (...cols: number[]): GameState[] => cols.map(drop).reduce((h, a) => [...h, applyAction(h[h.length - 1]!, a)], [newGame()]);

/** The link's game has three discs; the player's own, when there is one, has one. */
const LINK = `multidconnect4://?code=${encodeURIComponent(encodeGame(play(3, 3, 2), { mode: 'local' }))}`;

/** The discs on the big board, read off the cells' labels. */
const discs = (tree: ReactTestRenderer): number =>
  tree.root.findAll((node) => typeof node.type === 'string' && /^row \d+ column \d+ (red|yellow)$/.test(String(node.props.accessibilityLabel))).length;

const texts = (tree: ReactTestRenderer): string[] =>
  tree.root
    .findAll((node) => node.type === 'Text')
    .map((node) => node.props.children)
    .filter((c): c is string => typeof c === 'string');

/** The pressable a person reads this label on (the press handler sits on the composite). */
function button(tree: ReactTestRenderer, label: string): ReactTestInstance {
  const found = tree.root.findAll(
    (node) =>
      typeof node.props.onPress === 'function' &&
      node.props.accessibilityRole === 'button' &&
      node.findAll((n) => n.type === 'Text').some((n) => n.props.children === label),
  )[0];
  if (!found) throw new Error(`no button labelled ${label}`);
  return found;
}

/**
 * One run of the app: every module loaded afresh, as a launch loads them, so
 * what one case's run remembered is not the next case's. React, the renderer,
 * the app and the mocked storage and Linking all come from that one registry.
 */
async function launch(saved: GameState[] | null) {
  // (jest.isolateModules is not enough here: React Native's components come
  // out of it holding a React other than the renderer's.)
  jest.resetModules();
  const React: typeof import('react') = require('react');
  const renderer: typeof import('react-test-renderer') = require('react-test-renderer');
  const App: typeof import('../../../App').default = require('../../../App').default;
  const storage: typeof import('@react-native-async-storage/async-storage').default = require('@react-native-async-storage/async-storage').default;
  const { Linking }: typeof import('react-native') = require('react-native');
  const { act } = renderer;
  await storage.setItem(KEYS.settings, JSON.stringify({ welcomed: true }));
  if (saved) await storage.setItem(KEYS.game, JSON.stringify(toSavedGame(saved, { mode: 'local' })));
  // The platform reports the launch link on every call, for the whole run.
  jest.mocked(Linking.getInitialURL).mockResolvedValue(LINK);

  /** Storage reads, the link's promise and the autosave's 250 ms timer, all settled. */
  const settle = () =>
    act(async () => {
      for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 300));
      for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0));
    });
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(React.createElement(App));
  });
  await settle();
  const press = (label: string) => act(async () => (button(tree, label).props.onPress as () => void)());
  return {
    tree,
    storage,
    settle,
    press,
    unmount: () => act(async () => tree.unmount()),
    /** A render below the boundary fails, the player resets, and the tree is drawn again. */
    async crashAndReset(): Promise<void> {
      mockFailure.on = true;
      await act(async () => tree.update(React.createElement(App)));
      expect(texts(tree)).toContain('Something went wrong');
      mockFailure.on = false;
      await press('Start a new game');
      await press('Clear it and start over');
      await settle();
    },
  };
}

// Each case loads the whole app afresh and mounts the real screen: measured
// here at 4.6 s for the first case of a run and 1.4-3.3 s for the others,
// against jest's default of 5 s, which a loaded CI runner would cross.
jest.setTimeout(20000);

let consoleError: jest.SpyInstance;
beforeEach(() => {
  // React reports the caught render error on the console; that is the boundary working.
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  mockFailure.on = false;
});
afterEach(() => consoleError.mockRestore());

describe('the link the app was launched with', () => {
  it('is loaded once, and the reset after a crash starts the new game it promises', async () => {
    // Nobody has moved yet, so the link is taken without asking.
    const app = await launch(null);
    expect(discs(app.tree)).toBe(3);

    await app.crashAndReset();

    expect(texts(app.tree)).not.toContain('Something went wrong');
    expect(texts(app.tree)).not.toContain('Load the shared game?');
    expect(discs(app.tree)).toBe(0);
    // Nothing written back: a game nobody has moved in is not saved.
    expect(await app.storage.getItem(KEYS.game)).toBeNull();
    await app.unmount();
  });

  it('stays declined once the player keeps their own game', async () => {
    const app = await launch(play(6));
    expect(texts(app.tree)).toContain('Load the shared game?');
    await app.press('Keep playing');
    await app.settle();
    expect(discs(app.tree)).toBe(1);

    await app.crashAndReset();

    // The reset cleared the player's own game, as it says; it did not hand the
    // screen the game they had just turned down.
    expect(texts(app.tree)).not.toContain('Load the shared game?');
    expect(discs(app.tree)).toBe(0);
    expect(await app.storage.getItem(KEYS.game)).toBeNull();
    await app.unmount();
  });

  it('is still asked about when the player has a game, the first time', async () => {
    // What the once-only read must not cost: the launch link itself.
    const app = await launch(play(6));
    expect(texts(app.tree)).toContain('Load the shared game?');
    await app.press('Load the shared game');
    await app.settle();
    expect(discs(app.tree)).toBe(3);
    await app.unmount();
  });
});

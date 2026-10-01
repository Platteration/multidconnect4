/**
 * The last line of defence, and what its two ways out do. A render that throws
 * unmounts the whole app, and when the value that threw is the saved game it
 * does so again at every launch - so one way out has to clear that value. It
 * is not the first one offered: drawing again costs nothing and is what a
 * momentary failure needs, and clearing spends the only copy of a game that
 * may have taken an hour, so it is confirmed. What it clears is the game key
 * and nothing else - the record, the settings and the puzzle progress are not
 * what crashed - and the tree is remounted so the fresh game actually draws.
 *
 * The sibling game's error-boundary test, against this app's App.tsx. The
 * saved game it seeds is a real one: a record this app cannot read is removed
 * by the launch itself, which is that app's own decision and not the reset's.
 */
// Storage in memory, so the reset's one removal can be seen - and so the
// providers above the boundary come up at all.
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
// The real provider renders nothing until the native side reports its insets,
// which never happens under the test renderer.
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
// The screen is React Native all the way down and is not what is under test.
// This stand-in throws until told to stop, which is what tells a remount from
// a boundary that merely stopped showing its fallback. (The flag is declared
// below the imports: the factory only reads it when the stand-in renders.)
jest.mock('../GameScreen', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    GameScreen: () => {
      if (mockScreen.broken) throw new Error('a render that throws');
      return React.createElement(Text, null, 'the game');
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { ReactTestInstance, ReactTestRenderer, act } from 'react-test-renderer';
import App from '../../../App';
import { KEYS } from '../../app/persist';
import { toSavedGame } from '../../app/savedGame';
import { Action, applyAction, newGame } from '../../engine';
import { ErrorBoundary } from '../ErrorBoundary';

const mockScreen = { broken: true };

/** Every host node: one per thing on screen, composites aside. */
const hosts = (tree: ReactTestRenderer): ReactTestInstance[] => tree.root.findAll((node) => typeof node.type === 'string');

/** Every string a person could read on screen. */
const texts = (tree: ReactTestRenderer): string[] =>
  hosts(tree)
    .filter((node) => node.type === 'Text')
    .map((node) => node.props.children)
    .filter((c): c is string => typeof c === 'string');

/**
 * The button a person reads this label on. The press handler sits on the
 * Pressable itself, not on the host view it renders, so this is the one place
 * a composite node is looked at.
 */
const button = (tree: ReactTestRenderer, label: string): ReactTestInstance | undefined =>
  tree.root.findAll(
    (node) =>
      node.props.accessibilityRole === 'button' &&
      typeof node.props.onPress === 'function' &&
      node.findAll((n) => n.type === 'Text').some((n) => n.props.children === label),
  )[0];

/** Let the providers' storage reads settle; each one is a promise and a state change. */
const settle = () =>
  act(async () => {
    for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  });

function Thrower(): never {
  throw new Error('a render that throws');
}

/** A child that throws until the flag is cleared, like a passing failure. */
function Sometimes() {
  if (mockScreen.broken) throw new Error('a render that throws');
  return React.createElement(Text, null, 'drawn this time');
}

/** The labels on the fallback's buttons, in the order they are offered. */
const labels = (tree: ReactTestRenderer): string[] =>
  tree.root
    .findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')
    .map((node) => node.findAll((n) => n.type === 'Text').map((n) => n.props.children)[0])
    .filter((label): label is string => typeof label === 'string');

/** A boundary around one child. (The props type lists `children`, which is passed as the child.) */
const boundary = (onReset: () => void, child: React.ReactNode) =>
  React.createElement(ErrorBoundary, { onReset } as React.ComponentProps<typeof ErrorBoundary>, child);

const drop = (col: number): Action => ({ type: 'drop', timeline: 0, col });

/**
 * A record under every key the app keeps, so the reset's reach can be
 * measured. The game is a real one: an unreadable record is cleared by the
 * launch, which would leave the reset with nothing to prove.
 */
async function seedEveryKey(): Promise<void> {
  const history = [drop(0), drop(1)].reduce((h, a) => [...h, applyAction(h[h.length - 1]!, a)], [newGame()]);
  for (const key of Object.values(KEYS)) await AsyncStorage.setItem(key, JSON.stringify({ seeded: key }));
  await AsyncStorage.setItem(KEYS.game, JSON.stringify(toSavedGame(history, { mode: 'local' })));
}

// React reports a caught render error on the console; that report is the
// boundary working, not a failure of the test.
let consoleError: jest.SpyInstance;
beforeEach(() => {
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  mockScreen.broken = true;
});
afterEach(() => consoleError.mockRestore());

describe('the error boundary', () => {
  it('shows its children while nothing throws', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(boundary(() => {}, React.createElement(Text, null, 'fine')));
    });
    expect(texts(tree)).toContain('fine');
    expect(texts(tree)).not.toContain('Something went wrong');
    act(() => tree.unmount());
  });

  it('replaces a child that throws with the fallback, and offers the free way out first', () => {
    // Drawing again costs nothing, and a throw that came from a moment - a
    // state the screen was in, a modal halfway open - does not come back.
    // Clearing the save spends the player's only copy of it, so it is offered
    // beside the free one rather than instead of it, and it is confirmed.
    const onReset = jest.fn();
    let tree!: ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(boundary(onReset, React.createElement(Thrower)));
    });
    expect(texts(tree)).toContain('Something went wrong');
    expect(labels(tree)).toEqual(['Try again', 'Start a new game']);
    expect(onReset).not.toHaveBeenCalled();

    // The destructive one asks first, and backing out spends nothing.
    act(() => (button(tree, 'Start a new game')!.props.onPress as () => void)());
    expect(texts(tree)).toContain('Clear the saved game?');
    expect(onReset).not.toHaveBeenCalled();
    act(() => (button(tree, 'Back')!.props.onPress as () => void)());
    expect(labels(tree)).toEqual(['Try again', 'Start a new game']);

    act(() => (button(tree, 'Start a new game')!.props.onPress as () => void)());
    act(() => (button(tree, 'Clear it and start over')!.props.onPress as () => void)());
    expect(onReset).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it('draws its child again on Try again, without touching what is stored', async () => {
    // The one recovery that cannot cost anything: no storage call at all, and
    // a child that renders this time is simply back on screen.
    await seedEveryKey();
    const before = [...(await AsyncStorage.getAllKeys())].sort();
    const onReset = jest.fn();
    let tree!: ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(boundary(onReset, React.createElement(Sometimes)));
    });
    expect(texts(tree)).toContain('Something went wrong');
    mockScreen.broken = false;
    act(() => (button(tree, 'Try again')!.props.onPress as () => void)());
    expect(texts(tree)).toContain('drawn this time');
    expect(texts(tree)).not.toContain('Something went wrong');
    expect(onReset).not.toHaveBeenCalled();
    expect([...(await AsyncStorage.getAllKeys())].sort()).toEqual(before);
    act(() => tree.unmount());
  });
});

describe('the app around it', () => {
  it('clears only the saved game on reset, and then draws a fresh tree', async () => {
    await seedEveryKey();
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(App));
    });
    await settle();
    // The crash is caught, and the crash alone deletes nothing.
    expect(texts(tree)).toContain('Something went wrong');
    expect(texts(tree)).not.toContain('the game');
    expect([...(await AsyncStorage.getAllKeys())].sort()).toEqual(Object.values(KEYS).sort());

    // The screen would draw now; only the boundary is in the way.
    mockScreen.broken = false;
    await act(async () => (button(tree, 'Start a new game')!.props.onPress as () => void)());
    await act(async () => (button(tree, 'Clear it and start over')!.props.onPress as () => void)());
    await settle();

    // The game key is gone and every other record is untouched.
    const kept = [...(await AsyncStorage.getAllKeys())].sort();
    expect(kept).not.toContain(KEYS.game);
    expect(kept).toEqual(
      Object.values(KEYS)
        .filter((key) => key !== KEYS.game)
        .sort(),
    );
    // And the tree was remounted: a boundary left in its failed state would
    // keep showing the fallback over a screen that now renders fine.
    expect(texts(tree)).not.toContain('Something went wrong');
    expect(texts(tree)).toContain('the game');
    await act(async () => tree.unmount());
  });
});

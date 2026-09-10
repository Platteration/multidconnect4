/**
 * A thumbnail is told where it sits in the multiverse as two loose numbers,
 * and has to hand that place back as a BoardRef when it is pressed. Nothing
 * downstream checks the ref: GameScreen passes it straight to focusBoard, and
 * the next render looks the timeline up with getTimeline, which throws for a
 * timeline that does not exist. So the two numbers coming back the right way
 * round is the whole of this component's behaviour, and the map's own test
 * cannot see it - that one replaces the thumbnail with a stub.
 */
// The settings store reaches native storage on import, by way of the theme.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));

import React from 'react';

import { Board, BoardRef, newGame } from '../../engine';
import { MiniBoard } from '../MiniBoard';

// The renderer ships with jest-expo but carries no type definitions, and this
// project deliberately depends on nothing extra, so it is described here.
interface Node {
  props: Record<string, unknown>;
}
interface Tree {
  root: { findAll(match: (node: Node) => boolean): Node[] };
  unmount(): void;
}
interface Renderer {
  create(element: React.ReactElement): Tree;
  act(body: () => void): void;
}
declare const require: (name: string) => unknown;
const TestRenderer = require('react-test-renderer') as Renderer;

function anyBoard(): Board {
  return newGame().timelines[0].boards[0];
}

/** Renders a real thumbnail and returns the press handler it gave its button. */
function pressable(props: { timeline?: number; turn?: number; onPress?: (ref: BoardRef) => void }) {
  let tree: Tree | undefined;
  TestRenderer.act(() => {
    tree = TestRenderer.create(React.createElement(MiniBoard, { board: anyBoard(), ...props }));
  });
  const buttons = tree!.root.findAll(
    (node) => node.props.accessibilityRole === 'button' && node.props.onPress !== undefined,
  );
  return {
    press: buttons.length === 1 ? (buttons[0].props.onPress as () => void) : undefined,
    buttons: buttons.length,
    unmount: () => TestRenderer.act(() => tree!.unmount()),
  };
}

describe('a multiverse thumbnail', () => {
  it('reports the board it was given, not a transposition of it', () => {
    const pressed: BoardRef[] = [];
    // Two different numbers, so swapping them cannot go unnoticed.
    const view = pressable({ timeline: 1, turn: 3, onPress: (ref) => pressed.push(ref) });
    expect(view.buttons).toBe(1);
    TestRenderer.act(() => view.press!());
    expect(pressed).toEqual([{ timeline: 1, turn: 3 }]);
    view.unmount();
  });

  it('reports the place each thumbnail was given', () => {
    const pressed: BoardRef[] = [];
    const push = (ref: BoardRef) => pressed.push(ref);
    for (const ref of [{ timeline: 0, turn: 0 }, { timeline: 2, turn: 5 }, { timeline: 5, turn: 2 }]) {
      const view = pressable({ timeline: ref.timeline, turn: ref.turn, onPress: push });
      TestRenderer.act(() => view.press!());
      view.unmount();
    }
    expect(pressed).toEqual([{ timeline: 0, turn: 0 }, { timeline: 2, turn: 5 }, { timeline: 5, turn: 2 }]);
  });

  it('is not pressable at all where the screen passes no handler', () => {
    // GameScreen draws thumbnails that are decoration; they must not report a
    // press, and a ref built from absent props would say board (0, 0).
    const view = pressable({});
    expect(view.buttons).toBe(0);
    view.unmount();
  });
});

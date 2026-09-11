/**
 * The sheet the sender reads. A game past what a code may carry has no code
 * to offer, and the buttons that would have copied one have to be shut, with
 * the reason where the code would have been: a sender who can still press
 * Copy sends a code their opponent's app refuses, and the only person told
 * anything is the opponent - about a real game, in words that call it fake.
 */
// The settings store reaches native storage on import; nothing here uses it.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));

import React from 'react';

import { ShareModal } from '../ShareModal';

// The renderer ships with jest-expo but carries no type definitions, and this
// project deliberately depends on nothing extra, so it is described here.
interface Node {
  type: unknown;
  props: Record<string, unknown>;
  findAll(match: (node: Node) => boolean): Node[];
}
interface Tree {
  root: Node;
  unmount(): void;
}
interface Renderer {
  create(element: React.ReactElement): Tree;
  act(body: () => void): void;
}
declare const require: (name: string) => unknown;
const TestRenderer = require('react-test-renderer') as Renderer;

function open(props: { code: string | null; problem?: string | null }) {
  let tree: Tree | undefined;
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      React.createElement(ShareModal, {
        visible: true,
        code: props.code,
        problem: props.problem ?? null,
        onLoad: () => null,
        onClose: () => {},
      }),
    );
  });
  const root = tree!.root;
  /** Every button, by the label a person reads on it, and whether it is shut. */
  const buttons = new Map<string, boolean>();
  for (const node of root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'button')) {
    const label = node.findAll((n) => n.type === 'Text')[0]?.props.children;
    // What the button reports to a screen reader, not what it was handed.
    const state = node.props.accessibilityState as { disabled?: boolean } | undefined;
    if (typeof label === 'string') buttons.set(label, state?.disabled === true);
  }
  const texts = root
    .findAll((n) => n.type === 'Text')
    .map((n) => n.props.children)
    .filter((c): c is string => typeof c === 'string');
  return { buttons, texts, unmount: () => TestRenderer.act(() => tree!.unmount()) };
}

describe('the share sheet', () => {
  it('offers the code when there is one to offer', () => {
    const sheet = open({ code: '5DC4.abc' });
    expect(sheet.texts).toContain('5DC4.abc');
    expect(sheet.buttons.get('Copy')).toBe(false);
    expect(sheet.buttons.get('Share…')).toBe(false);
    sheet.unmount();
  });

  it('shuts Copy and Share, and says why, when the game has outgrown a code', () => {
    const why = 'This game has grown past what a code can carry: 2000 boards, against the 1600 a code holds.';
    const sheet = open({ code: null, problem: why });
    expect(sheet.texts).toContain(why);
    expect(sheet.buttons.get('Copy')).toBe(true);
    expect(sheet.buttons.get('Share…')).toBe(true);
    // And nothing that looks like a code is left on screen to be copied by hand.
    expect(sheet.texts.some((t) => t.startsWith('5DC4.'))).toBe(false);
    sheet.unmount();
  });

  it('still says what to do before the first move', () => {
    const sheet = open({ code: null, problem: null });
    expect(sheet.texts).toContain('Make a move first, then come back here.');
    expect(sheet.buttons.get('Copy')).toBe(true);
    sheet.unmount();
  });
});

/**
 * The settings sheet: the rows it draws, and the two things its one
 * destructive button has to do - ask first, and ask from inside the sheet
 * rather than from a second modal beside it.
 *
 * The second one is a platform bug this cannot see: iOS presents each React
 * Native <Modal> from the nearest view controller, and that controller is
 * already presenting this sheet, so a confirmation rendered as a sibling
 * modal is refused there and "Reset to defaults" is a button that does
 * nothing at all. Android stacks dialogs and react-native-web draws DOM
 * overlays, so neither the suite nor a web build shows it. What can be
 * pinned, and is, is that only one modal is ever mounted - which is the
 * shape MenuModal's own confirmation already had.
 */
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
    },
  };
});

import React from 'react';
import { Modal } from 'react-native';
import TestRenderer, { ReactTestInstance, ReactTestRenderer, act } from 'react-test-renderer';
import { EntitlementsProvider } from '../../app/entitlements';
import { DEFAULT_SETTINGS, SettingsProvider } from '../../app/settings';
import { ThemeProvider } from '../../app/theme';
import { SettingsModal } from '../SettingsModal';

/** The sheet, under the providers it reads. */
function render() {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      React.createElement(
        SettingsProvider,
        null,
        React.createElement(
          ThemeProvider,
          null,
          React.createElement(
            EntitlementsProvider,
            null,
            React.createElement(SettingsModal, { visible: true, onClose: () => {} }),
          ),
        ),
      ),
    );
  });
  return tree;
}

const texts = (tree: ReactTestRenderer): string[] =>
  tree.root
    .findAll((node) => typeof node.type === 'string' && node.type === 'Text')
    .map((node) => node.props.children)
    .filter((c): c is string => typeof c === 'string');

/** The button, switch or choice a person reads this label on. */
const control = (tree: ReactTestRenderer, label: string): ReactTestInstance | undefined =>
  tree.root.findAll(
    (node) =>
      typeof node.props.onPress === 'function' &&
      (node.props.accessibilityLabel === label ||
        node.findAll((n) => n.type === 'Text').some((n) => n.props.children === label)),
  )[0];

const switchFor = (tree: ReactTestRenderer, label: string): ReactTestInstance =>
  tree.root.findAll((node) => node.props.accessibilityLabel === label && typeof node.props.onValueChange === 'function')[0];

const press = (node: ReactTestInstance) => act(() => (node.props.onPress as () => void)());

const modals = (tree: ReactTestRenderer): ReactTestInstance[] =>
  tree.root.findAllByType(Modal).filter((node) => node.props.visible !== false);

describe('the settings sheet', () => {
  it('draws the rows it says it has', () => {
    const tree = render();
    const shown = texts(tree);
    for (const row of ['Vibration', 'Sound', 'Piece markings', 'Theme', 'Reduce motion', 'Board', 'Pieces']) {
      expect(shown).toContain(row);
    }
    expect(shown).toContain('Reset to defaults');
    act(() => tree.unmount());
  });

  it('asks before it resets, and resets only when the answer is yes', () => {
    const tree = render();
    // Take a setting off its default, so a reset has something to undo.
    expect(DEFAULT_SETTINGS.haptics).toBe(true);
    act(() => (switchFor(tree, 'Vibration').props.onValueChange as (v: boolean) => void)(false));
    expect(switchFor(tree, 'Vibration').props.value).toBe(false);

    // Reset asks, and asking changes nothing.
    press(control(tree, 'Reset to defaults')!);
    expect(texts(tree)).toContain('Reset settings?');
    press(control(tree, 'Keep my settings')!);
    expect(texts(tree)).not.toContain('Reset settings?');
    expect(switchFor(tree, 'Vibration').props.value).toBe(false);

    // Answering yes puts every setting back.
    press(control(tree, 'Reset to defaults')!);
    press(control(tree, 'Reset')!);
    expect(texts(tree)).not.toContain('Reset settings?');
    expect(switchFor(tree, 'Vibration').props.value).toBe(DEFAULT_SETTINGS.haptics);
    act(() => tree.unmount());
  });

  it('asks from inside its own sheet, never from a second modal over it', () => {
    // A confirmation presented as a sibling modal is the one iOS refuses,
    // which would leave Reset to defaults doing nothing on an iPhone.
    const tree = render();
    expect(modals(tree)).toHaveLength(1);
    press(control(tree, 'Reset to defaults')!);
    expect(texts(tree)).toContain('Reset settings?');
    expect(modals(tree)).toHaveLength(1);
    // And the sheet it replaced is not underneath it.
    expect(texts(tree)).not.toContain('Reset to defaults');
    act(() => tree.unmount());
  });
});

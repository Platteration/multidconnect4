/**
 * The big board is told where a cell sits as a row and a column and has to
 * hand those same two numbers back when it is pressed. Nothing downstream
 * checks them: GameScreen passes them straight to the game, which drops into
 * that column or picks up the disc at that cell, so the pair surviving the
 * round trip is the whole of the press - and the board may take one only
 * while it is interactive.
 *
 * The sibling game's board test, against this app's disc board. Two things
 * differ and both are tested here rather than ported: every cell is playable
 * (there are no dark squares to leave out), and row 0 is the BOTTOM of the
 * board while the rows are drawn from the top down, so the row a label names
 * and the row a press reports have to agree in spite of that inversion.
 */
// The board reads the theme, which reaches the settings store and its storage.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));

import React from 'react';
import TestRenderer, { ReactTestInstance, ReactTestRenderer, act } from 'react-test-renderer';
import { Action, applyAction, newGame } from '../../engine';
import { DiscBoard } from '../DiscBoard';

type Props = React.ComponentProps<typeof DiscBoard>;

const drop = (col: number): Action => ({ type: 'drop', timeline: 0, col });

/** The starting board, and one with a red disc under a yellow one in column 4. */
const EMPTY = newGame().timelines[0].boards[0];
const PLAYED = (() => {
  const state = [drop(3), drop(3)].reduce((s, a) => applyAction(s, a), newGame());
  const boards = state.timelines[0].boards;
  return boards[boards.length - 1];
})();

/** Renders a real board and finds its cells. */
function render(props: Partial<Props>) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      React.createElement(DiscBoard, { board: EMPTY, cellSize: 30, interactive: true, ...props }),
    );
  });
  // The Pressable itself carries the handler, the label and `disabled`; the
  // host view it renders carries only the role.
  const cells: ReactTestInstance[] = tree.root.findAll(
    (node) => node.props.accessibilityRole === 'button' && typeof node.props.disabled === 'boolean',
  );
  return { cells, unmount: () => act(() => tree.unmount()) };
}

const labelOf = (cell: ReactTestInstance): string => cell.props.accessibilityLabel as string;
const at = (cells: ReactTestInstance[], row: number, col: number): ReactTestInstance | undefined =>
  cells.find((c) => labelOf(c).startsWith(`row ${row + 1} column ${col + 1} `));

describe('the board', () => {
  it('reports the cell it was given, not a transposition of it', () => {
    const pressed: [number, number][] = [];
    const view = render({ onPressCell: (row, col) => pressed.push([row, col]) });
    expect(view.cells).toHaveLength(EMPTY.rows * EMPTY.cols);
    // Two different numbers, so swapping them cannot go unnoticed, and a
    // board that is not square would not catch it on its own.
    act(() => (at(view.cells, 2, 3)!.props.onPress as () => void)());
    act(() => (at(view.cells, 0, 5)!.props.onPress as () => void)());
    expect(pressed).toEqual([
      [2, 3],
      [0, 5],
    ]);
    view.unmount();
  });

  it('draws the rows from the top down, with row 0 at the bottom', () => {
    // Gravity is "lowest empty row", and row 0 is the bottom of the board, so
    // the board has to draw its rows in the opposite order to the one they
    // are stored in. Drawn the other way up, every press still reports the
    // cell its own label names and the discs pile up towards the ceiling.
    const view = render({});
    expect(labelOf(view.cells[0])).toBe(`row ${EMPTY.rows} column 1 empty`);
    expect(labelOf(view.cells[EMPTY.cols - 1])).toBe(`row ${EMPTY.rows} column ${EMPTY.cols} empty`);
    expect(labelOf(view.cells[view.cells.length - 1])).toBe(`row 1 column ${EMPTY.cols} empty`);
    view.unmount();
  });

  it('takes a press only while the board is interactive', () => {
    // Every cell is playable on this board: a press picks a column, and a
    // disc already on the board is picked up to send it back in time.
    const live = render({});
    expect(live.cells.filter((c) => c.props.disabled === false)).toHaveLength(EMPTY.rows * EMPTY.cols);
    live.unmount();

    // A board that is not the player's to play (a past board, the bot's turn,
    // a finished game) takes no press at all.
    const frozen = render({ interactive: false });
    expect(frozen.cells.filter((c) => c.props.disabled === false)).toHaveLength(0);
    frozen.unmount();
  });

  it('has no press handler where the screen passes none', () => {
    const view = render({});
    for (const cell of view.cells) expect(cell.props.onPress).toBeUndefined();
    view.unmount();
  });

  it('names each cell for a screen reader', () => {
    const view = render({ board: PLAYED });
    // The two discs, bottom of the board upwards, and an empty cell above them.
    expect(labelOf(at(view.cells, 0, 3)!)).toBe('row 1 column 4 red');
    expect(labelOf(at(view.cells, 1, 3)!)).toBe('row 2 column 4 yellow');
    expect(labelOf(at(view.cells, 2, 3)!)).toBe('row 3 column 4 empty');
    // And a cell of the column beside them, which nothing has fallen into.
    expect(labelOf(at(view.cells, 0, 4)!)).toBe('row 1 column 5 empty');
    view.unmount();
  });
});

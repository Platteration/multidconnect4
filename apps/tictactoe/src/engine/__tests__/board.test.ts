import {
  CELLS,
  LINES,
  boardFromRows,
  cellName,
  cellsOf,
  emptyBoard,
  emptyCells,
  index,
  isFull,
  lineFor,
  placeMark,
  removeMark,
  winnerOf,
} from '../board';

describe('the board', () => {
  it('starts empty', () => {
    const b = emptyBoard();
    expect(b.cells).toHaveLength(CELLS);
    expect(emptyCells(b)).toHaveLength(9);
    expect(isFull(b)).toBe(false);
  });

  it('names cells from the bottom left, like a chessboard', () => {
    expect(cellName(index(2, 0))).toBe('a1');
    expect(cellName(index(0, 2))).toBe('c3');
    expect(cellName(index(1, 1))).toBe('b2');
  });

  it('places and lifts marks without touching the old board', () => {
    const b = emptyBoard();
    const marked = placeMark(b, 4, 0)!;
    expect(marked.cells[4]).toBe(0);
    expect(b.cells[4]).toBeNull();
    expect(placeMark(marked, 4, 1)).toBeNull();
    expect(removeMark(marked, 4).cells[4]).toBeNull();
    expect(cellsOf(marked, 0)).toEqual([4]);
  });

  it('has eight lines, every one three cells long', () => {
    expect(LINES).toHaveLength(8);
    expect(LINES.every((l) => l.length === 3)).toBe(true);
  });

  it('finds three in a row in every direction', () => {
    expect(lineFor(boardFromRows(['xxx', '...', '...']), 0)?.cells).toEqual([0, 1, 2]);
    expect(lineFor(boardFromRows(['o..', 'o..', 'o..']), 1)?.cells).toEqual([0, 3, 6]);
    expect(lineFor(boardFromRows(['x..', '.x.', '..x']), 0)?.cells).toEqual([0, 4, 8]);
    expect(lineFor(boardFromRows(['..x', '.x.', 'x..']), 0)?.cells).toEqual([2, 4, 6]);
    expect(lineFor(boardFromRows(['xx.', '...', '...']), 0)).toBeNull();
  });

  it('gives the named player their line first', () => {
    const both = boardFromRows(['xxx', 'ooo', '...']);
    expect(winnerOf(both, 1)?.player).toBe(1);
    expect(winnerOf(both, 0)?.player).toBe(0);
    expect(winnerOf(boardFromRows(['xo.', 'ox.', '...']), 0)).toBeNull();
  });

  it('reads a full board as full', () => {
    expect(isFull(boardFromRows(['xox', 'oxo', 'oxo']))).toBe(true);
  });
});

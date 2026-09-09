import {
  boardFromRows,
  cellAt,
  dropDisc,
  dropRow,
  emptyBoard,
  findLines,
  index,
  isFull,
  legalColumns,
  removeDisc,
  rotate,
  settle,
  winnerOf,
} from '../board';

describe('board', () => {
  it('drops discs with gravity', () => {
    const a = dropDisc(emptyBoard(), 3, 0)!;
    expect(a.row).toBe(0);
    const b = dropDisc(a.board, 3, 1)!;
    expect(b.row).toBe(1);
    expect(cellAt(b.board, 0, 3)).toBe(0);
    expect(cellAt(b.board, 1, 3)).toBe(1);
    expect(cellAt(a.board, 1, 3)).toBeNull(); // immutable
  });

  it('refuses to drop into a full column', () => {
    let board = emptyBoard();
    for (let i = 0; i < 6; i++) board = dropDisc(board, 0, (i % 2) as 0 | 1)!.board;
    expect(dropRow(board, 0)).toBe(-1);
    expect(dropDisc(board, 0, 0)).toBeNull();
    expect(legalColumns(board)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('collapses the column when a disc is removed', () => {
    const board = boardFromRows([
      '.......',
      '.......',
      '.......',
      '...Y...',
      '...R...',
      '...Y...',
    ]);
    const after = removeDisc(board, 0, 3);
    expect(cellAt(after, 0, 3)).toBe(0);
    expect(cellAt(after, 1, 3)).toBe(1);
    expect(cellAt(after, 2, 3)).toBeNull();
  });

  it('finds lines in every direction', () => {
    const horizontal = boardFromRows([
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      'RRRR...',
    ]);
    expect(findLines(horizontal)).toEqual([{ player: 0, cells: [0, 1, 2, 3] }]);

    const vertical = boardFromRows([
      '.......',
      '.......',
      'Y......',
      'Y......',
      'Y......',
      'Y......',
    ]);
    expect(findLines(vertical)[0].player).toBe(1);

    const diag = boardFromRows([
      '.......',
      '.......',
      '...R...',
      '..RY...',
      '.RYY...',
      'RYYY...',
    ]);
    expect(findLines(diag)).toEqual([{ player: 0, cells: [0, index(diag, 1, 1), index(diag, 2, 2), index(diag, 3, 3)] }]);

    const antiDiag = boardFromRows([
      '.......',
      '.......',
      '...Y...',
      '...RY..',
      '...RRY.',
      '...RRRY',
    ]);
    expect(findLines(antiDiag)[0].player).toBe(1);
  });

  it('prefers the given player when both have lines', () => {
    const board = boardFromRows([
      '.......',
      '.......',
      '.......',
      '.......',
      'YYYY...',
      'RRRR...',
    ]);
    expect(winnerOf(board, 1)!.player).toBe(1);
    expect(winnerOf(board, 0)!.player).toBe(0);
  });

  it('recognises a full drawn board', () => {
    const board = boardFromRows([
      'YRYRYRY',
      'YRYRYRY',
      'RYRYRYR',
      'RYRYRYR',
      'YRYRYRY',
      'YRYRYRY',
    ]);
    expect(isFull(board)).toBe(true);
    expect(findLines(board)).toEqual([]);
  });
});

describe('spinning', () => {
  const board = boardFromRows([
    '.......',
    '.......',
    '.......',
    '.......',
    'Y......',
    'RRY..R.',
  ]);

  it('swaps width and height', () => {
    const cw = rotate(board, 'cw');
    expect(cw.cols).toBe(6);
    expect(cw.rows).toBe(7);
    expect(cw.spun).toBe(true);
    expect(rotate(cw, 'ccw').cols).toBe(7);
  });

  it('turns clockwise so the old floor becomes the left wall', () => {
    // The floor read left to right (R R Y . . R .) becomes column 0 read top
    // to bottom, then gravity closes the gaps. The Y that sat on the
    // left-most R lands in column 1.
    const cw = rotate(board, 'cw');
    expect(textRows(cw)).toEqual([
      '......',
      '......',
      '......',
      'R.....',
      'R.....',
      'Y.....',
      'RY....',
    ]);
  });

  it('turns counter-clockwise so the old floor becomes the right wall', () => {
    const ccw = rotate(board, 'ccw');
    expect(textRows(ccw)).toEqual([
      '......',
      '......',
      '......',
      '.....R',
      '.....Y',
      '.....R',
      '....YR',
    ]);
  });

  it('spinning twice the same way is a half turn with gravity applied each time', () => {
    const twice = rotate(rotate(board, 'cw'), 'cw');
    expect(twice.cols).toBe(7);
    expect(textRows(twice)).toEqual([
      '.......',
      '.......',
      '.......',
      '.......',
      'R......',
      'YYRR...',
    ]);
  });

  it('settle drops floating discs', () => {
    const floating = { ...boardFromRows(['R......', '.......', '.......', '.......', '.......', '.......']), spun: false };
    expect(cellAt(settle(floating), 0, 0)).toBe(0);
    expect(cellAt(settle(floating), 5, 0)).toBeNull();
  });
});

describe('cells outside the board', () => {
  // Cells are stored row-major, so column `cols` is really the next row up:
  // an unchecked read there reports a disc that is not where it was asked for,
  // and an unchecked write lands past the end of the array.
  it('reads as empty rather than aliasing the row above', () => {
    const b = boardFromRows(['.......', '.......', '.......', '.......', 'R......', 'RY.....']);
    expect(cellAt(b, 1, 0)).toBe(0);
    expect(cellAt(b, 0, 7)).toBeNull();
    expect(cellAt(b, 0, -1)).toBeNull();
    expect(cellAt(b, 6, 0)).toBeNull();
    expect(cellAt(b, 0.5, 0)).toBeNull();
  });

  it('cannot be removed, so the board keeps its size and its holes', () => {
    const b = boardFromRows(['.......', '.......', '.......', '.......', 'R......', 'RY.....']);
    const after = removeDisc(b, 0, 7);
    expect(after.cells).toHaveLength(b.rows * b.cols);
    expect(textRows(after)).toEqual(textRows(b));
    // Every cell is still a disc or a hole gravity can fill; none is undefined.
    expect(after.cells.every((c) => c === 0 || c === 1 || c === null)).toBe(true);
    expect(dropRow(after, 0)).toBe(2);
  });
});

/** Render a board as rows of text, top row first, for readable assertions. */
function textRows(board: { cols: number; rows: number; cells: readonly (0 | 1 | null)[] }): string[] {
  const out: string[] = [];
  for (let r = board.rows - 1; r >= 0; r--) {
    let line = '';
    for (let c = 0; c < board.cols; c++) {
      const v = board.cells[r * board.cols + c];
      line += v === 0 ? 'R' : v === 1 ? 'Y' : '.';
    }
    out.push(line);
  }
  return out;
}

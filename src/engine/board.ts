/**
 * A single Connect Four board. Boards are immutable value objects; every
 * operation returns a new board.
 *
 * Cells are stored row-major with row 0 at the BOTTOM of the board so that
 * gravity is simply "lowest empty row". A board starts 7 wide and 6 tall,
 * but it can be spun a quarter turn, after which it is 6 wide and 7 tall
 * and every disc has fallen to the new bottom. So width and height belong
 * to the board, not to the module.
 */
import type { Player } from './types';

export const COLS = 7;
export const ROWS = 6;
/** The longest side a board can have, for sizing UI that must fit either orientation. */
export const MAX_SIDE = Math.max(COLS, ROWS);
export const WIN_LENGTH = 4;

export type Cell = Player | null;
export type Spin = 'cw' | 'ccw';

export interface Board {
  readonly cols: number;
  readonly rows: number;
  readonly cells: readonly Cell[];
  /** True when this board was produced by spinning. A spun board can't be spun again straight away. */
  readonly spun: boolean;
}

type Dims = Pick<Board, 'cols' | 'rows'>;

export function index(board: Dims, row: number, col: number): number {
  return row * board.cols + col;
}

export function rowOf(board: Dims, i: number): number {
  return Math.floor(i / board.cols);
}

export function colOf(board: Dims, i: number): number {
  return i % board.cols;
}

export function emptyBoard(cols = COLS, rows = ROWS): Board {
  return { cols, rows, cells: Array<Cell>(rows * cols).fill(null), spun: false };
}

/** True when (row, col) names a real cell of this board. */
export function inside(board: Dims, row: number, col: number): boolean {
  return (
    Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < board.rows && col >= 0 && col < board.cols
  );
}

/**
 * The cell at (row, col), or null when that is not a cell of this board.
 * Row-major storage means an out-of-range column silently aliases another
 * row, so callers must never be trusted to have checked: an action arriving
 * in a shared game code has not.
 */
export function cellAt(board: Board, row: number, col: number): Cell {
  return inside(board, row, col) ? board.cells[index(board, row, col)] : null;
}

/** Lowest empty row in a column, or -1 when the column is full. */
export function dropRow(board: Board, col: number): number {
  if (col < 0 || col >= board.cols) return -1;
  for (let r = 0; r < board.rows; r++) {
    if (board.cells[index(board, r, col)] === null) return r;
  }
  return -1;
}

export function legalColumns(board: Board): number[] {
  const out: number[] = [];
  for (let c = 0; c < board.cols; c++) if (dropRow(board, c) >= 0) out.push(c);
  return out;
}

export function isFull(board: Board): boolean {
  return legalColumns(board).length === 0;
}

/** Drop a disc into a column. Returns null when the column is full. */
export function dropDisc(board: Board, col: number, player: Player): { board: Board; row: number } | null {
  const row = dropRow(board, col);
  if (row < 0) return null;
  const cells = board.cells.slice();
  cells[index(board, row, col)] = player;
  return { board: { ...board, cells, spun: false }, row };
}

/**
 * Pull a disc out of the board. Everything stacked above it falls one row,
 * which is what makes sending a disc into the past interesting: the present
 * board rearranges itself.
 */
export function removeDisc(board: Board, row: number, col: number): Board {
  // Out of range would write past the end of the array and leave a hole that
  // gravity can never fill again; there is nothing to remove, so do nothing.
  if (!inside(board, row, col)) return board;
  const cells = board.cells.slice();
  for (let r = row; r < board.rows - 1; r++) {
    cells[index(board, r, col)] = cells[index(board, r + 1, col)];
  }
  cells[index(board, board.rows - 1, col)] = null;
  return { ...board, cells, spun: false };
}

/** Let every disc fall as far as it can. */
export function settle(board: Board): Board {
  const cells = Array<Cell>(board.rows * board.cols).fill(null);
  for (let c = 0; c < board.cols; c++) {
    let fill = 0;
    for (let r = 0; r < board.rows; r++) {
      const v = board.cells[index(board, r, c)];
      if (v !== null) cells[index(board, fill++, c)] = v;
    }
  }
  return { ...board, cells };
}

/**
 * Spin the board a quarter turn and let gravity do its thing. Width and
 * height swap. Clockwise, the old right wall becomes the new floor and the
 * old floor becomes the new left wall; counter-clockwise, the old left wall
 * becomes the floor.
 */
export function rotate(board: Board, spin: Spin): Board {
  const next: Dims = { cols: board.rows, rows: board.cols };
  const cells = Array<Cell>(next.rows * next.cols).fill(null);
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      const v = board.cells[index(board, r, c)];
      if (v === null) continue;
      // Clockwise: (x, y) -> (y, W-1-x). Counter-clockwise: (x, y) -> (H-1-y, x).
      const rr = spin === 'cw' ? board.cols - 1 - c : c;
      const cc = spin === 'cw' ? r : board.rows - 1 - r;
      cells[index(next, rr, cc)] = v;
    }
  }
  return settle({ ...next, cells, spun: true });
}

/** Turn the board upside down (a half turn) and let every disc fall. Width and height stay. */
export function flip(board: Board): Board {
  const cells = Array<Cell>(board.rows * board.cols).fill(null);
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      cells[index(board, board.rows - 1 - r, board.cols - 1 - c)] = board.cells[index(board, r, c)];
    }
  }
  return settle({ ...board, cells, spun: true });
}

export function sameCells(a: Board, b: Board): boolean {
  return a.cols === b.cols && a.rows === b.rows && a.cells.every((v, i) => v === b.cells[i]);
}

export function discsOf(board: Board, player: Player): number[] {
  const out: number[] = [];
  board.cells.forEach((c, i) => {
    if (c === player) out.push(i);
  });
  return out;
}

export interface Line {
  player: Player;
  cells: number[];
}

const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], // horizontal
  [1, 0], // vertical
  [1, 1], // diagonal up-right
  [1, -1], // diagonal up-left
];

/** Every four-in-a-row on the board, for either player. */
export function findLines(board: Board): Line[] {
  const lines: Line[] = [];
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      const p = board.cells[index(board, r, c)];
      if (p === null) continue;
      for (const [dr, dc] of DIRECTIONS) {
        const cells = [index(board, r, c)];
        let rr = r + dr;
        let cc = c + dc;
        while (
          cells.length < WIN_LENGTH &&
          rr >= 0 &&
          rr < board.rows &&
          cc >= 0 &&
          cc < board.cols &&
          board.cells[index(board, rr, cc)] === p
        ) {
          cells.push(index(board, rr, cc));
          rr += dr;
          cc += dc;
        }
        if (cells.length === WIN_LENGTH) lines.push({ player: p, cells });
      }
    }
  }
  return lines;
}

/**
 * The winner on a board, if any. When both players have a line (possible
 * after a collapse or a spin), the `preferred` player wins ties - the engine
 * passes the player who just moved.
 */
export function winnerOf(board: Board, preferred: Player): Line | null {
  const lines = findLines(board);
  if (lines.length === 0) return null;
  return lines.find((l) => l.player === preferred) ?? lines[0];
}

/**
 * Build a board from rows of text, top row first. 'R' = Red, 'Y' = Yellow,
 * '.' = empty. The board takes its size from the text.
 */
export function boardFromRows(rows: readonly string[], spun = false): Board {
  const rowsOfText = rows.map((t) => t.replace(/\s+/g, ''));
  const height = rowsOfText.length;
  const width = rowsOfText[0]?.length ?? 0;
  const dims: Dims = { cols: width, rows: height };
  const cells = Array<Cell>(height * width).fill(null);
  rowsOfText.forEach((chars, i) => {
    if (chars.length !== width) throw new Error(`expected ${width} columns in "${chars}"`);
    const row = height - 1 - i;
    for (let c = 0; c < width; c++) {
      const ch = chars[c];
      cells[index(dims, row, c)] = ch === 'R' ? 0 : ch === 'Y' ? 1 : null;
    }
  });
  return { ...dims, cells, spun };
}

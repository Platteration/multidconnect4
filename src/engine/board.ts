/**
 * A single Connect Four board. Boards are immutable value objects; every
 * operation returns a new board.
 *
 * Cells are stored row-major with row 0 at the BOTTOM of the board so that
 * gravity is simply "lowest empty row".
 */
import type { Player } from './types';

export const COLS = 7;
export const ROWS = 6;
export const WIN_LENGTH = 4;

export type Cell = Player | null;

export interface Board {
  readonly cells: readonly Cell[];
}

export function index(row: number, col: number): number {
  return row * COLS + col;
}

export function rowOf(i: number): number {
  return Math.floor(i / COLS);
}

export function colOf(i: number): number {
  return i % COLS;
}

export function emptyBoard(): Board {
  return { cells: Array<Cell>(ROWS * COLS).fill(null) };
}

export function cellAt(board: Board, row: number, col: number): Cell {
  return board.cells[index(row, col)];
}

/** Lowest empty row in a column, or -1 when the column is full. */
export function dropRow(board: Board, col: number): number {
  if (col < 0 || col >= COLS) return -1;
  for (let r = 0; r < ROWS; r++) {
    if (board.cells[index(r, col)] === null) return r;
  }
  return -1;
}

export function legalColumns(board: Board): number[] {
  const out: number[] = [];
  for (let c = 0; c < COLS; c++) if (dropRow(board, c) >= 0) out.push(c);
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
  cells[index(row, col)] = player;
  return { board: { cells }, row };
}

/**
 * Pull a disc out of the board. Everything stacked above it falls one row,
 * which is what makes sending a disc into the past interesting: the present
 * board rearranges itself.
 */
export function removeDisc(board: Board, row: number, col: number): Board {
  const cells = board.cells.slice();
  for (let r = row; r < ROWS - 1; r++) {
    cells[index(r, col)] = cells[index(r + 1, col)];
  }
  cells[index(ROWS - 1, col)] = null;
  return { cells };
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
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board.cells[index(r, c)];
      if (p === null) continue;
      for (const [dr, dc] of DIRECTIONS) {
        const cells = [index(r, c)];
        let rr = r + dr;
        let cc = c + dc;
        while (
          cells.length < WIN_LENGTH &&
          rr >= 0 &&
          rr < ROWS &&
          cc >= 0 &&
          cc < COLS &&
          board.cells[index(rr, cc)] === p
        ) {
          cells.push(index(rr, cc));
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
 * The winner on a board, if any. When both players somehow have a line
 * (possible after a disc is pulled out and the column collapses), the
 * `preferred` player wins ties - the engine passes the player who just moved.
 */
export function winnerOf(board: Board, preferred: Player): Line | null {
  const lines = findLines(board);
  if (lines.length === 0) return null;
  return lines.find((l) => l.player === preferred) ?? lines[0];
}

/** Build a board from rows of text, top row first. 'R' = Red, 'Y' = Yellow, '.' = empty. */
export function boardFromRows(rows: readonly string[]): Board {
  if (rows.length !== ROWS) throw new Error(`expected ${ROWS} rows`);
  const cells = Array<Cell>(ROWS * COLS).fill(null);
  rows.forEach((text, i) => {
    const row = ROWS - 1 - i;
    const chars = text.replace(/\s+/g, '');
    if (chars.length !== COLS) throw new Error(`expected ${COLS} columns in "${text}"`);
    for (let c = 0; c < COLS; c++) {
      const ch = chars[c];
      cells[index(row, c)] = ch === 'R' ? 0 : ch === 'Y' ? 1 : null;
    }
  });
  return { cells };
}

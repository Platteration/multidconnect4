/**
 * One tic-tac-toe board: nine cells, each empty or a player's mark. Boards are
 * immutable — every function here returns a new one.
 *
 * Cells are numbered left to right, top to bottom, so cell 0 is the top left
 * and cell 8 the bottom right.
 */
import { Player } from './types';

export const SIZE = 3;
export const CELLS = SIZE * SIZE;

export type Cell = Player | null;

export interface Board {
  readonly cells: readonly Cell[];
}

export const index = (row: number, col: number): number => row * SIZE + col;
export const rowOf = (cell: number): number => Math.floor(cell / SIZE);
export const colOf = (cell: number): number => cell % SIZE;

/** a1 is the bottom left, the way a chessboard is read. */
export function cellName(cell: number): string {
  return `${String.fromCharCode(97 + colOf(cell))}${SIZE - rowOf(cell)}`;
}

export function emptyBoard(): Board {
  return { cells: Array<Cell>(CELLS).fill(null) };
}

export function cellAt(board: Board, cell: number): Cell {
  return board.cells[cell] ?? null;
}

export function isFull(board: Board): boolean {
  return board.cells.every((c) => c !== null);
}

export function emptyCells(board: Board): number[] {
  const out: number[] = [];
  board.cells.forEach((c, i) => {
    if (c === null) out.push(i);
  });
  return out;
}

export function cellsOf(board: Board, player: Player): number[] {
  const out: number[] = [];
  board.cells.forEach((c, i) => {
    if (c === player) out.push(i);
  });
  return out;
}

/** Put a mark on an empty cell. Null when the cell is taken. */
export function placeMark(board: Board, cell: number, player: Player): Board | null {
  if (cell < 0 || cell >= CELLS || board.cells[cell] !== null) return null;
  const cells = board.cells.slice();
  cells[cell] = player;
  return { cells };
}

/** Lift a mark off a cell, leaving it empty. */
export function removeMark(board: Board, cell: number): Board {
  const cells = board.cells.slice();
  cells[cell] = null;
  return { cells };
}

/** The eight lines: three rows, three columns, two diagonals. */
export const LINES: ReadonlyArray<readonly [number, number, number]> = (() => {
  const lines: [number, number, number][] = [];
  for (let r = 0; r < SIZE; r++) lines.push([index(r, 0), index(r, 1), index(r, 2)]);
  for (let c = 0; c < SIZE; c++) lines.push([index(0, c), index(1, c), index(2, c)]);
  lines.push([index(0, 0), index(1, 1), index(2, 2)]);
  lines.push([index(0, 2), index(1, 1), index(2, 0)]);
  return lines;
})();

/** Three in a row for `player` on this board, if there is one. */
export function lineFor(board: Board, player: Player): { player: Player; cells: number[] } | null {
  for (const line of LINES) {
    if (line.every((i) => board.cells[i] === player)) return { player, cells: [...line] };
  }
  return null;
}

/** Any three in a row, whoever made it. The mover's line is looked for first. */
export function winnerOf(board: Board, first: Player): { player: Player; cells: number[] } | null {
  return lineFor(board, first) ?? lineFor(board, first === 0 ? 1 : 0);
}

/** A board written out as three rows of `.`, `x` and `o`, for tests and puzzles. */
export function boardFromRows(rows: readonly string[]): Board {
  const cells: Cell[] = [];
  for (const row of rows) {
    for (const ch of row.trim()) {
      cells.push(ch === 'x' ? 0 : ch === 'o' ? 1 : null);
    }
  }
  if (cells.length !== CELLS) throw new Error(`a board needs ${CELLS} cells, got ${cells.length}`);
  return { cells };
}

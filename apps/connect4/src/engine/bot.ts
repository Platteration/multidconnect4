/**
 * A computer opponent. Three levels, all built on the same idea: list every
 * legal action for the current player, score what the multiverse looks like
 * afterwards, and pick the best. No search beyond checking whether the
 * opponent could win at once, which keeps every level instant on a phone.
 *
 *  1 "Novice"  - plays discs only, takes wins, usually blocks, otherwise wanders.
 *  2 "Tricky"  - drops and spins, always blocks, values threats and the centre.
 *  3 "Paradox" - the above plus time travel, pop-out and flip when they pay.
 *
 * The loop around all of this is `bindBot` in the core; what is here is the
 * part that knows what a Connect Four board is worth.
 */
import { BotBrain, bindBot } from '@5d/core';
import { Board, discsOf, findLines, index, legalColumns } from './board';
import {
  Action,
  GameState,
  Spec,
  applyAction,
  canRotate,
  engine,
  latestBoard,
  pendingTimelines,
  travelTargets,
} from './multiverse';
import { BotLevel, Player, Rng, otherPlayer } from './types';

/** Every legal action for the player to move, across all waiting boards. */
function enumerate(state: GameState, level: BotLevel): Action[] {
  const out: Action[] = [];
  for (const tl of pendingTimelines(state)) {
    const board = latestBoard(tl);
    for (const col of legalColumns(board)) out.push({ type: 'drop', timeline: tl.id, col });
    if (level >= 2 && canRotate(state, tl.id)) {
      out.push({ type: 'rotate', timeline: tl.id, spin: 'cw' });
      out.push({ type: 'rotate', timeline: tl.id, spin: 'ccw' });
      if (state.rules.flip && level >= 3) out.push({ type: 'flip', timeline: tl.id });
    }
    if (level >= 3) {
      const targets = travelTargets(state, tl.id);
      for (const i of discsOf(board, state.toMove)) {
        const row = Math.floor(i / board.cols);
        const col = i % board.cols;
        if (state.rules.popOut && row === 0) out.push({ type: 'pop', timeline: tl.id, col });
        for (const to of targets) {
          const target = state.timelines[to.timeline].boards[to.turn - state.timelines[to.timeline].startTurn];
          for (const c of legalColumns(target)) {
            out.push({ type: 'travel', from: { timeline: tl.id, row, col }, to, col: c });
          }
        }
      }
    }
  }
  return out;
}

/** Number of empty cells that would complete four in a row for `player`, plus a small centre bonus. */
function score(board: Board, player: Player): number {
  let score = 0;
  const dirs: ReadonlyArray<readonly [number, number]> = [[0, 1], [1, 0], [1, 1], [1, -1]];
  const centre = (board.cols - 1) / 2;
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      if (board.cells[index(board, r, c)] === player) score += 1 - Math.abs(c - centre) / (board.cols * 2);
      for (const [dr, dc] of dirs) {
        let mine = 0;
        let empty = 0;
        let ok = true;
        for (let k = 0; k < 4; k++) {
          const rr = r + dr * k;
          const cc = c + dc * k;
          if (rr < 0 || rr >= board.rows || cc < 0 || cc >= board.cols) {
            ok = false;
            break;
          }
          const v = board.cells[index(board, rr, cc)];
          if (v === player) mine++;
          else if (v === null) empty++;
          else {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        if (mine === 3 && empty === 1) score += 12;
        else if (mine === 2 && empty === 2) score += 3;
      }
    }
  }
  return score;
}

function opponentCanWinAtOnce(state: GameState): boolean {
  if (state.status !== 'playing') return false;
  for (const tl of pendingTimelines(state)) {
    for (const col of legalColumns(latestBoard(tl))) {
      const next = applyAction(state, { type: 'drop', timeline: tl.id, col });
      if (next.status === 'won' && next.win?.player === state.toMove) return true;
    }
    if (canRotate(state, tl.id)) {
      for (const spin of ['cw', 'ccw'] as const) {
        const next = applyAction(state, { type: 'rotate', timeline: tl.id, spin });
        if (next.status === 'won' && next.win?.player === state.toMove) return true;
      }
    }
  }
  return false;
}

/** Columns where `player` would win at once by dropping, on one board. */
function winningColumns(board: Board, player: Player): number[] {
  const out: number[] = [];
  for (const col of legalColumns(board)) {
    const row = firstEmptyRow(board, col);
    const cells = board.cells.slice();
    cells[index(board, row, col)] = player;
    if (findLines({ ...board, cells }).some((l) => l.player === player)) out.push(col);
  }
  return out;
}

/**
 * Whether the opponent, moving next, can drop a disc that leaves them with
 * two ways to win at once (a fork) on the same board.
 */
function opponentCanFork(state: GameState): boolean {
  const them = state.toMove;
  for (const tl of pendingTimelines(state)) {
    const board = latestBoard(tl);
    for (const col of legalColumns(board)) {
      const row = firstEmptyRow(board, col);
      const cells = board.cells.slice();
      cells[index(board, row, col)] = them;
      if (winningColumns({ ...board, cells }, them).length >= 2) return true;
    }
  }
  return false;
}

/** Whether the board still has a line for `player` after this drop would be a block. */
function isBlock(state: GameState, action: Action, me: Player): boolean {
  if (action.type !== 'drop') return false;
  const tl = state.timelines[action.timeline];
  const board = latestBoard(tl);
  const asOpponent = { ...board, cells: board.cells.slice() };
  const row = legalColumns(board).includes(action.col) ? firstEmptyRow(board, action.col) : -1;
  if (row < 0) return false;
  asOpponent.cells[index(board, row, action.col)] = otherPlayer(me);
  return findLines(asOpponent).some((l) => l.player === otherPlayer(me));
}

function firstEmptyRow(board: Board, col: number): number {
  for (let r = 0; r < board.rows; r++) if (board.cells[index(board, r, col)] === null) return r;
  return -1;
}

const brain: BotBrain<Spec> = {
  enumerate,
  boardScore: score,
  endTurn: { type: 'endTurn' },
  /** Above this many candidates, time travels are sampled so a big multiverse stays snappy. */
  maxCandidates: 90,
  isTravel: (a) => a.type === 'travel',
  /** Time travel and pop-out reshape the present; only worth it with a real gain. */
  actionCost: (a) => (a.type === 'travel' || a.type === 'pop' ? 4 : 0),

  /** Block a threat most of the time, otherwise play something random. */
  novice(state: GameState, actions: Action[], rng: Rng) {
    const me = state.toMove;
    const blocks = actions.filter((a) => isBlock(state, a, me));
    if (blocks.length && rng() < 0.75) return blocks[Math.floor(rng() * blocks.length)];
    const drops = actions.filter((a) => a.type === 'drop');
    return drops[Math.floor(rng() * drops.length)] ?? null;
  },

  /** A reply that wins at once is fatal; one that sets up a fork nearly so. */
  replyPenalty: (probe) => (opponentCanWinAtOnce(probe) ? 5000 : opponentCanFork(probe) ? 2500 : 0),
};

export const { enumerateActions, boardScore, evaluate, chooseAction, playTurn } = bindBot(engine, brain);

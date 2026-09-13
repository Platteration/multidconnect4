/**
 * A computer opponent, in the shape every game here uses: list the legal
 * actions, score the multiverse each one leads to, and take the best.
 *
 *  1 "Novice"  - marks cells, takes wins, usually blocks. Never travels.
 *  2 "Tricky"  - counts lines and never lets you win in one.
 *  3 "Paradox" - the above plus time travel when a past board looks better.
 *
 * The loop is `bindBot` in the core; what is here is what a tic-tac-toe board
 * is worth.
 */
import { BotBrain, bindBot } from '@5d/core';
import { Board, LINES, cellsOf, emptyCells, placeMark } from './board';
import {
  Action,
  GameState,
  Spec,
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
    for (const cell of emptyCells(board)) out.push({ type: 'mark', timeline: tl.id, cell });
    if (level >= 3) {
      for (const cell of cellsOf(board, state.toMove)) {
        for (const to of travelTargets(state, tl.id, cell)) {
          out.push({ type: 'travel', from: { timeline: tl.id, cell }, to });
        }
      }
    }
  }
  return out;
}

/** Lines that are still winnable for `player`, weighted by how far along they are, plus the centre. */
function score(board: Board, player: Player): number {
  const them = otherPlayer(player);
  let total = 0;
  for (const line of LINES) {
    let mine = 0;
    let theirs = 0;
    for (const i of line) {
      if (board.cells[i] === player) mine++;
      else if (board.cells[i] === them) theirs++;
    }
    if (theirs > 0) continue;
    if (mine === 2) total += 12;
    else if (mine === 1) total += 3;
  }
  if (board.cells[4] === player) total += 2;
  return total;
}

/** Cells where `player` would make three in a row at once, on one board. */
function winningCells(board: Board, player: Player): number[] {
  return emptyCells(board).filter((cell) => {
    const next = placeMark(board, cell, player)!;
    return LINES.some((line) => line.every((i) => next.cells[i] === player));
  });
}

/** What the player to move could finish next: a line they can complete now. */
function opponentCanWinAtOnce(state: GameState): boolean {
  if (state.status !== 'playing') return false;
  return pendingTimelines(state).some((tl) => winningCells(latestBoard(tl), state.toMove).length > 0);
}

const brain: BotBrain<Spec> = {
  enumerate,
  boardScore: score,
  endTurn: { type: 'endTurn' },
  /** Above this many candidates, time travels are sampled so a big multiverse stays snappy. */
  maxCandidates: 60,
  isTravel: (a) => a.type === 'travel',
  /** Time travel hands the opponent another board; only worth it with a real gain. */
  actionCost: (a) => (a.type === 'travel' ? 6 : 0),

  /** Block a line most of the time, otherwise mark something at random. */
  novice(state: GameState, actions: Action[], rng: Rng) {
    const them = otherPlayer(state.toMove);
    const marks = actions.filter((a): a is Extract<Action, { type: 'mark' }> => a.type === 'mark');
    const blocks = marks.filter((a) => winningCells(latestBoard(state.timelines[a.timeline]), them).includes(a.cell));
    if (blocks.length && rng() < 0.75) return blocks[Math.floor(rng() * blocks.length)];
    return marks[Math.floor(rng() * marks.length)] ?? null;
  },

  /** A reply that finishes a line is fatal. */
  replyPenalty: (probe) => (opponentCanWinAtOnce(probe) ? 5000 : 0),
};

export const { enumerateActions, boardScore, evaluate, chooseAction, playTurn } = bindBot(engine, brain);

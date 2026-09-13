/**
 * A computer opponent. Three levels, all built on the same idea: list every
 * legal action for the current player, score what the multiverse looks like
 * afterwards, and pick the best. The only look-ahead is checking what the
 * opponent could capture in reply, which keeps every level instant.
 *
 *  1 "Novice"  - takes captures, likes crowning, otherwise wanders. Never travels.
 *  2 "Tricky"  - counts material after the opponent's best reply, pushes forward.
 *  3 "Paradox" - the above plus time travel when a past board looks better.
 *
 * The loop around all of this is `bindBot` in the core; what is here is the
 * part that knows what a checkers board is worth.
 */
import { BotBrain, bindBot } from '@5d/core';
import { Board, crownRow, legalMoves, moveTarget, pieceAt, piecesOf, rowOf } from './board';
import {
  Action,
  GameState,
  Spec,
  engine,
  latestBoard,
  pendingTimelines,
  travelTargets,
} from './multiverse';
import { BotLevel, Player, Rng } from './types';

/** Every legal action for the player to move, across all waiting boards. */
function enumerate(state: GameState, level: BotLevel): Action[] {
  const out: Action[] = [];
  for (const tl of pendingTimelines(state)) {
    const board = latestBoard(tl);
    for (const move of legalMoves(board, state.toMove, state.rules)) out.push({ type: 'move', timeline: tl.id, move });
    if (level >= 3) {
      for (const square of piecesOf(board, state.toMove)) {
        for (const to of travelTargets(state, tl.id, square)) {
          out.push({ type: 'travel', from: { timeline: tl.id, square }, to });
        }
      }
    }
  }
  return out;
}

/** Material and position for `player` on one board. */
function score(board: Board, player: Player): number {
  let score = 0;
  for (const sq of piecesOf(board, player)) {
    const piece = pieceAt(board, sq)!;
    if (piece.king) {
      score += 16;
    } else {
      // Men are worth more as they approach the crown row.
      const advance = player === 0 ? rowOf(sq) : crownRow(0) - rowOf(sq);
      score += 10 + advance * 0.4;
    }
  }
  return score;
}

/** The most material the player to move could take with one move on their waiting boards. */
function bestCaptureValue(state: GameState): number {
  let best = 0;
  for (const tl of pendingTimelines(state)) {
    const board = latestBoard(tl);
    for (const move of legalMoves(board, state.toMove, state.rules)) {
      let value = 0;
      for (const c of move.captures) value += pieceAt(board, c)?.king ? 16 : 10;
      if (value > best) best = value;
    }
  }
  return best;
}

const brain: BotBrain<Spec> = {
  enumerate,
  boardScore: score,
  endTurn: { type: 'endTurn' },
  /** Above this many candidates, time travels are sampled so a big multiverse stays snappy. */
  maxCandidates: 60,
  isTravel: (a) => a.type === 'travel',
  /** Time travel splits attention; only worth it with a real gain. */
  actionCost: (a) => (a.type === 'travel' ? 6 : 0),

  /** Crown when you can; captures are already forced by the rules, so otherwise wander. */
  novice(state: GameState, actions: Action[], rng: Rng) {
    const me = state.toMove;
    const moves = actions.filter((a): a is Extract<Action, { type: 'move' }> => a.type === 'move');
    const crowning = moves.filter(
      (a) =>
        !pieceAt(latestBoard(state.timelines[a.timeline]), a.move.from)!.king &&
        rowOf(moveTarget(a.move)) === crownRow(me),
    );
    if (crowning.length && rng() < 0.8) return crowning[Math.floor(rng() * crowning.length)];
    return moves[Math.floor(rng() * moves.length)] ?? null;
  },

  /** What can the opponent take straight back? */
  replyPenalty: (probe) => bestCaptureValue(probe) * 1.1,
};

export const { enumerateActions, boardScore, evaluate, chooseAction, playTurn } = bindBot(engine, brain);

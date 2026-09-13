/**
 * The shape every game's computer opponent has in common.
 *
 * All three levels work the same way in both games: list every legal action
 * for the player to move, apply each one, score the multiverse that comes out,
 * and pick the best. The only look-ahead is a single probe of the opponent's
 * reply. What differs is what a board is worth, what the opponent can do to
 * you in one move, and how a beginner picks — those three are the brain, and
 * everything around them lives here.
 */
import type { Bot, BotLevel, Rng } from '../bot';
import type { Player } from '../types';
import { otherPlayer } from '../types';
import type { GameSpec, GameState } from './multiverse';
import { latestBoard } from './multiverse';
import type { bindMultiverse } from './multiverse';

/** The bound engine the bot plays through. */
type Engine<G extends GameSpec> = ReturnType<typeof bindMultiverse<G>>;

export interface BotBrain<G extends GameSpec> {
  /** Every legal action for the player to move, across all waiting boards. */
  enumerate(state: GameState<G>, level: BotLevel): G['action'][];

  /** The game's own "I am done for this turn" action, under the strict-present rule. */
  endTurn: G['action'];

  /** What one board is worth to `player`: material, threats, position. */
  boardScore(board: G['board'], player: Player): number;

  /** How a beginner picks, with no look-ahead. Null falls through to the first action. */
  novice(state: GameState<G>, actions: G['action'][], rng: Rng): G['action'] | null;

  /**
   * What the opponent could do to us in one move, as a penalty subtracted
   * from the score. `probe` is the position with the opponent to move.
   */
  replyPenalty(probe: GameState<G>): number;

  /** What an action costs beyond its result, e.g. a time travel that splits attention. */
  actionCost?(action: G['action']): number;

  /** True for the actions the candidate sampler thins out first. */
  isTravel(action: G['action']): boolean;

  /** Above this many candidates, travels are sampled so a big multiverse stays snappy. */
  maxCandidates: number;
}

/**
 * A bot bound to one game. Returns the same functions every game published
 * before the frame existed, so a game re-exports them and nothing downstream
 * knows the difference.
 */
export function bindBot<G extends GameSpec>(engine: Engine<G>, brain: BotBrain<G>) {
  /** How good the multiverse looks for `player`: sum over every board still in play. */
  function evaluate(state: GameState<G>, player: Player): number {
    if (state.status === 'won' && state.win) return state.win.player === player ? 1e6 : -1e6;
    if (state.status === 'draw') return 0;
    let total = 0;
    for (const tl of state.timelines) {
      const board = latestBoard(tl);
      if (engine.isDead(board)) continue;
      total += brain.boardScore(board, player) - brain.boardScore(board, otherPlayer(player));
    }
    return total;
  }

  /** Pick one action for the player to move. Returns null when nothing is legal. */
  function chooseAction(state: GameState<G>, level: BotLevel, rng: Rng = Math.random): G['action'] | null {
    const me = state.toMove;
    // Under the strict-present rule, bots play what they must and leave the rest for later.
    if (engine.canEndTurn(state) && engine.mandatoryTimelines(state).length === 0) return brain.endTurn;
    let actions = brain.enumerate(state, level);
    if (actions.length === 0) return null;
    if (actions.length > brain.maxCandidates) {
      const plain = actions.filter((a) => !brain.isTravel(a));
      const travels = actions.filter((a) => brain.isTravel(a));
      for (let i = travels.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [travels[i], travels[j]] = [travels[j], travels[i]];
      }
      actions = [...plain, ...travels.slice(0, Math.max(0, brain.maxCandidates - plain.length))];
    }

    // Immediate wins first, at every level.
    for (const a of actions) {
      const next = engine.applyAction(state, a);
      if (next.status === 'won' && next.win?.player === me) return a;
    }

    if (level === 1) return brain.novice(state, actions, rng) ?? actions[0];

    let best: G['action'][] = [];
    let bestScore = -Infinity;
    for (const a of actions) {
      const next = engine.applyAction(state, a);
      let score = evaluate(next, me);
      if (next.status === 'playing') {
        // The turn may or may not have passed; either way, what comes back at us matters.
        const probe = next.toMove === me ? ({ ...next, toMove: otherPlayer(me) } as GameState<G>) : next;
        score -= brain.replyPenalty(probe);
      }
      score -= brain.actionCost?.(a) ?? 0;
      score += rng() * 0.5; // tie-breaking noise so games differ
      if (score > bestScore + 1e-9) {
        bestScore = score;
        best = [a];
      } else if (Math.abs(score - bestScore) <= 1e-9) {
        best.push(a);
      }
    }
    return best[Math.floor(rng() * best.length)] ?? actions[0];
  }

  /**
   * Play out the bot's whole turn: one action per waiting board until the
   * turn passes or the game ends. Returns every intermediate state so the UI
   * can show the moves one at a time.
   */
  function playTurn(state: GameState<G>, bot: Bot, rng: Rng = Math.random): GameState<G>[] {
    const steps: GameState<G>[] = [];
    let current = state;
    let guard = 0;
    while (current.status === 'playing' && current.toMove === bot.player && guard++ < 64) {
      const action = chooseAction(current, bot.level, rng);
      if (!action) break;
      current = engine.applyAction(current, action);
      steps.push(current);
    }
    return steps;
  }

  return {
    enumerateActions: (state: GameState<G>, level: BotLevel) => brain.enumerate(state, level),
    boardScore: (board: G['board'], player: Player) => brain.boardScore(board, player),
    evaluate,
    chooseAction,
    playTurn,
  };
}

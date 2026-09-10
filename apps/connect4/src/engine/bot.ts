/**
 * A computer opponent. Three levels, all built on the same idea: list every
 * legal action for the current player, score what the multiverse looks like
 * afterwards, and pick the best. No search beyond checking whether the
 * opponent could win at once, which keeps every level instant on a phone.
 *
 *  1 "Novice"  - plays discs only, takes wins, usually blocks, otherwise wanders.
 *  2 "Tricky"  - drops and spins, always blocks, values threats and the centre.
 *  3 "Paradox" - the above plus time travel, pop-out and flip when they pay.
 */
import { Board, discsOf, findLines, index, isFull, legalColumns } from './board';
import {
  Action,
  GameState,
  applyAction,
  canEndTurn,
  canRotate,
  latestBoard,
  mandatoryTimelines,
  pendingTimelines,
  travelTargets,
} from './multiverse';
import { Player, otherPlayer } from './types';

export type BotLevel = 1 | 2 | 3;

export const BOT_NAMES: Record<BotLevel, string> = { 1: 'Novice', 2: 'Tricky', 3: 'Paradox' };

export interface Bot {
  level: BotLevel;
  player: Player;
}

/** A random source in [0, 1), injectable so tests are deterministic. */
export type Rng = () => number;

/** Every legal action for the player to move, across all waiting boards. */
export function enumerateActions(state: GameState, level: BotLevel): Action[] {
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
export function boardScore(board: Board, player: Player): number {
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

/** How good the multiverse looks for `player`: sum over every newest board. */
export function evaluate(state: GameState, player: Player): number {
  if (state.status === 'won' && state.win) return state.win.player === player ? 1e6 : -1e6;
  if (state.status === 'draw') return 0;
  let total = 0;
  for (const tl of state.timelines) {
    const board = latestBoard(tl);
    if (isFull(board)) continue;
    total += boardScore(board, player) - boardScore(board, otherPlayer(player));
  }
  // Each extra board the opponent must answer is a small burden on them.
  return total;
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

/** Pick one action for the player to move. Returns null when nothing is legal. */
/** Above this many candidates, time travels are sampled so a big multiverse stays snappy. */
const MAX_CANDIDATES = 90;

export function chooseAction(state: GameState, level: BotLevel, rng: Rng = Math.random): Action | null {
  const me = state.toMove;
  // Under the strict-present rule, bots play what they must and leave the rest for later.
  if (canEndTurn(state) && mandatoryTimelines(state).length === 0) return { type: 'endTurn' };
  let actions = enumerateActions(state, level);
  if (actions.length === 0) return null;
  if (actions.length > MAX_CANDIDATES) {
    const plain = actions.filter((a) => a.type !== 'travel');
    const travels = actions.filter((a) => a.type === 'travel');
    for (let i = travels.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [travels[i], travels[j]] = [travels[j], travels[i]];
    }
    actions = [...plain, ...travels.slice(0, Math.max(0, MAX_CANDIDATES - plain.length))];
  }

  // Immediate wins first, at every level.
  for (const a of actions) {
    const next = applyAction(state, a);
    if (next.status === 'won' && next.win?.player === me) return a;
  }

  if (level === 1) {
    // Block a threat most of the time, otherwise play something random.
    const blocks = actions.filter((a) => isBlock(state, a, me));
    if (blocks.length && rng() < 0.75) return blocks[Math.floor(rng() * blocks.length)];
    const drops = actions.filter((a) => a.type === 'drop');
    return drops[Math.floor(rng() * drops.length)] ?? actions[0];
  }

  let best: Action[] = [];
  let bestScore = -Infinity;
  for (const a of actions) {
    const next = applyAction(state, a);
    let score = evaluate(next, me);
    if (next.status === 'playing') {
      // The turn may or may not have passed; either way, a reply that wins at once is fatal.
      const probe = next.toMove === me ? { ...next, toMove: otherPlayer(me) } : next;
      if (opponentCanWinAtOnce(probe)) score -= 5000;
      else if (opponentCanFork(probe)) score -= 2500;
    }
    // Time travel and pop-out reshape the present; only worth it with a real gain.
    if (a.type === 'travel' || a.type === 'pop') score -= 4;
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
export function playTurn(state: GameState, bot: Bot, rng: Rng = Math.random): GameState[] {
  const steps: GameState[] = [];
  let current = state;
  let guard = 0;
  while (current.status === 'playing' && current.toMove === bot.player && guard++ < 64) {
    const action = chooseAction(current, bot.level, rng);
    if (!action) break;
    current = applyAction(current, action);
    steps.push(current);
  }
  return steps;
}

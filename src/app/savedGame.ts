/**
 * The game in progress, as it is written to storage.
 *
 * Only the actions are kept, exactly like a game code: the history is rebuilt
 * by replaying them on load. Writing every GameState instead expands each
 * board of every timeline once per ply, which reached megabytes in a long
 * game - past what a single AsyncStorage row can hold on Android, and slow to
 * stringify on the JS thread every time the game changes.
 *
 * Replaying is also the validation. A save from an older shape, or one that
 * has been corrupted, fails to replay and is thrown away, instead of being
 * handed to the screen as a GameState that is missing the fields the first
 * render reads.
 */
import { Action, GameState, Player, Rules, applyAction, newGame } from '../engine';
import { puzzleById } from '../puzzles';
import { MAX_ACTIONS, actionsOf, cleanRules, isAction } from './share';
import { DEFAULT_SETUP, GameSetup } from './setup';

export const SAVE_VERSION = 3;

/**
 * No real game comes near this; it bounds the replay a stored value can ask
 * for, and it is deliberately the only ceiling on this path. A game code is
 * held to two more (MAX_TIMELINES, MAX_BOARDS): it arrives whole from someone
 * else, and refusing one costs the player nothing they had. A save is the
 * player's own game - every state in it was reached a move at a time through
 * this app, and drew fine each time - so a ceiling on its size does not
 * refuse anything, it deletes the game on the next launch, and two stubborn
 * players popping discs back out pass what a code may carry in 500 moves.
 * An oversized save cannot arrive by link either: decodeGame refuses the code
 * before it could be autosaved. What is left to pay is the replay - worst
 * case here, 1,500 actions rebuilding 2,473 boards, measured at 232 ms - and
 * the draw, which the map bounds by mounting only the boards near the
 * viewport.
 */
export const MAX_SAVED_ACTIONS = MAX_ACTIONS;

export interface SavedGame {
  version: 3;
  rules: Rules;
  setup: GameSetup;
  actions: Action[];
}

/** The value to store for a game in progress. */
export function toSavedGame(history: GameState[], setup: GameSetup): SavedGame {
  return { version: SAVE_VERSION, rules: history[0].rules, setup, actions: actionsOf(history) };
}

/**
 * Rebuild a stored game, or null when the value cannot be trusted. Older
 * saves (which held whole states) are read by taking the action out of each
 * state and replaying it, so a game in flight survives the format change.
 */
export function restoreSavedGame(value: unknown): { history: GameState[]; setup: GameSetup } | null {
  if (!value || typeof value !== 'object') return null;
  const saved = value as { version?: unknown; rules?: unknown; setup?: unknown; actions?: unknown; history?: unknown };
  const setup = cleanSetup(saved.setup);

  if (saved.version === SAVE_VERSION) {
    return replay(baseState(setup, saved.rules), saved.actions, setup);
  }
  if (saved.version === 1 || saved.version === 2) {
    const states = saved.history;
    if (!Array.isArray(states) || states.length === 0) return null;
    const first = states[0] as { rules?: unknown } | null;
    // Every state after the first records the action that made it.
    const actions = states.slice(1).map((s) => (s as { lastAction?: unknown } | null)?.lastAction);
    return replay(baseState(setup, first?.rules), actions, setup);
  }
  return null;
}

/** The position a game started from: a puzzle's, or an empty multiverse. */
function baseState(setup: GameSetup, rules: unknown): GameState | null {
  if (setup.mode === 'puzzle') {
    return (setup.puzzleId ? puzzleById(setup.puzzleId)?.state : undefined) ?? null;
  }
  return newGame(cleanRules(rules));
}

function replay(
  base: GameState | null,
  actions: unknown,
  setup: GameSetup,
): { history: GameState[]; setup: GameSetup } | null {
  if (!base || !Array.isArray(actions) || actions.length > MAX_SAVED_ACTIONS) return null;
  const history: GameState[] = [base];
  for (const action of actions) {
    if (!isAction(action)) return null;
    try {
      history.push(applyAction(history[history.length - 1], action));
    } catch {
      return null;
    }
  }
  return { history, setup };
}

const isPlayer = (v: unknown): v is Player => v === 0 || v === 1;

/** A stored setup, with anything unexpected replaced by the default. */
function cleanSetup(value: unknown): GameSetup {
  const s = (value ?? {}) as { mode?: unknown; bot?: unknown; puzzleId?: unknown; within?: unknown; player?: unknown };
  if (typeof s !== 'object') return DEFAULT_SETUP;
  const mode = s.mode === 'bot' || s.mode === 'puzzle' ? s.mode : 'local';
  const bot = s.bot as { level?: unknown; player?: unknown } | undefined;
  const setup: GameSetup = { mode };
  if (bot && typeof bot === 'object' && (bot.level === 1 || bot.level === 2 || bot.level === 3) && isPlayer(bot.player)) {
    setup.bot = { level: bot.level, player: bot.player };
  } else if (mode !== 'local') {
    // A bot game or a puzzle without a usable opponent is not restorable.
    return DEFAULT_SETUP;
  }
  if (mode === 'puzzle') {
    if (typeof s.puzzleId !== 'string' || !isPlayer(s.player) || typeof s.within !== 'number') return DEFAULT_SETUP;
    setup.puzzleId = s.puzzleId;
    setup.player = s.player;
    setup.within = s.within;
  }
  return setup;
}

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
 * How much of a stored game is replayed at launch, and the only ceiling on
 * this path. It is not a refusal: a longer save is replayed this far and the
 * rest dropped, and the player is told the game came back short. That
 * difference is the whole point. A game code is held to two more limits
 * (MAX_TIMELINES, MAX_BOARDS) and refused outright, because it arrives whole
 * from someone else and refusing one costs the player nothing they had. A
 * save is the player's own game - every state in it was reached a move at a
 * time through this app, and drew fine each time - so refusing one does not
 * decline anything, it deletes the game on the next launch, in silence, with
 * nothing left to undo. Two stubborn players popping discs back out pass what
 * a code may carry in 500 moves and keep every one of them; a game that
 * branches often spends an action per waiting timeline and can reach this
 * ceiling in a long evening, which is the case that must not end in a blank
 * board and no explanation.
 * An oversized save cannot arrive by link either: decodeGame refuses the code
 * before it could be autosaved. What is left to pay is the replay - worst
 * case here, 1,500 actions rebuilding 973 timelines and 2,473 boards,
 * measured on desktop V8 at 0.4 s at best, 0.5-1.2 s on a typical cold run,
 * retaining ~110 MB; Hermes on a phone is slower again - and the draw, which
 * the map bounds by mounting only the boards near the viewport.
 */
export const MAX_SAVED_ACTIONS = MAX_ACTIONS;

/** A game read back out of storage. */
export interface RestoredGame {
  history: GameState[];
  setup: GameSetup;
  /**
   * True when the save held more actions than MAX_SAVED_ACTIONS, so what came
   * back is the game up to that move and the rest is gone. The screen says so
   * rather than letting the difference pass as a game that never happened.
   */
  truncated: boolean;
}

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
export function restoreSavedGame(value: unknown): RestoredGame | null {
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

/**
 * Replay a stored list onto its base position. At most MAX_SAVED_ACTIONS
 * actions are replayed - the list is not walked past that either, so a stored
 * value cannot ask for unbounded work - and a list longer than that comes
 * back as the game up to there rather than as nothing at all.
 */
function replay(base: GameState | null, actions: unknown, setup: GameSetup): RestoredGame | null {
  if (!base || !Array.isArray(actions)) return null;
  const kept = Math.min(actions.length, MAX_SAVED_ACTIONS);
  const history: GameState[] = [base];
  for (let i = 0; i < kept; i++) {
    const action = actions[i];
    if (!isAction(action)) return null;
    try {
      history.push(applyAction(history[history.length - 1], action));
    } catch {
      return null;
    }
  }
  return { history, setup, truncated: kept < actions.length };
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

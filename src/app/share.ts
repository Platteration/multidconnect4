/**
 * Game codes: a whole game squeezed into a string you can paste into a
 * message. Only the actions are stored; loading replays them through the
 * engine, so a tampered code simply fails to load.
 *
 * A code arrives from a chat message or a link, so it is untrusted in both
 * directions: every action is checked against the shape the engine expects
 * before it is replayed, and both the code and the number of actions are
 * capped, because replaying a list costs memory that grows with its square.
 * The multiverse a code builds is capped as well, not just the list that
 * builds it: a short list of legal actions can still describe hundreds of
 * timelines.
 */
import { Action, GameState, Rules, applyAction, newGame } from '../engine';
import { decode, encode } from './base64';
import { DEFAULT_SETUP, GameSetup } from './setup';

const PREFIX = '5DC4.';

/** More actions than any real game reaches; replaying them all is bounded work. */
export const MAX_ACTIONS = 1500;
/** A code for MAX_ACTIONS actions is well under this; anything longer is not a game. */
export const MAX_CODE_LENGTH = 96 * 1024;
/**
 * The multiverse a code may carry, in either direction: a code that would
 * build more than this is refused when it is made as well as when it is read,
 * because a code the sender's own app will not load back is a game the two of
 * them cannot finish, announced on the wrong phone.
 *
 * Replaying an action rebuilds every timeline object and copies every board
 * reference, so a code costs its action count times the size of the state it
 * builds - timelines being the expensive half (a fresh object each) and
 * boards the cheap one (a reference). MAX_TIMELINES is therefore the cap that
 * bounds the work, and the one a branching game meets first: real play makes
 * about 5 to 7 boards per timeline (self-play measures 5.1-6.7 over the games
 * that branch), not the 2.6 of the all-travel construction these numbers were
 * first sized against, so 64 timelines of real play is 330-450 boards.
 *
 * MAX_BOARDS is a backstop for the other shape of long game, and it has to
 * sit above every game the app itself will keep: a 500-move pop-out game -
 * two stubborn players, one timeline, nothing exotic - is 501 boards, and
 * MAX_SAVED_ACTIONS lets that game run to 1,501. At 400 it refused all of
 * those, and refused them at both ends. Every action leaves at most one board
 * behind plus one more when it opens a timeline, so inside these two caps a
 * game holds at most 1 + MAX_ACTIONS + MAX_TIMELINES = 1,565 boards: the
 * board cap never fires first, which is what makes it a backstop rather than
 * a second opinion. Measured on desktop V8: the most expensive codes these
 * caps accept are 1,500 actions on one timeline (1,501 boards, 56 ms, 18 MB)
 * and 1,114 actions across 64 timelines (1,178 boards, 82 ms, 21 MB).
 */
export const MAX_TIMELINES = 64;
export const MAX_BOARDS = 1600;

/** Why a state is too big to travel in a code, or null when it is not. */
export interface StateLimit {
  what: 'timelines' | 'boards';
  count: number;
  limit: number;
}

/**
 * What makes a state too big to be a game somebody could play, or null when
 * nothing does. The caps above bound the replay but not what it produces:
 * every action can be legal, the list short enough and the code small enough,
 * and the state at the end still hold hundreds of timelines. So the state is
 * checked as it is built, action by action, which bounds the replay too, and
 * what it ran into is reported rather than just that it ran into something.
 */
export function stateLimit(state: GameState): StateLimit | null {
  if (state.timelines.length > MAX_TIMELINES) {
    return { what: 'timelines', count: state.timelines.length, limit: MAX_TIMELINES };
  }
  let boards = 0;
  for (const tl of state.timelines) boards += tl.boards.length;
  if (boards > MAX_BOARDS) return { what: 'boards', count: boards, limit: MAX_BOARDS };
  return null;
}

export function withinStateLimits(state: GameState): boolean {
  return stateLimit(state) === null;
}

const isIndex = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

function isBoardRef(v: unknown): boolean {
  const r = v as { timeline?: unknown; turn?: unknown };
  return !!r && typeof r === 'object' && isIndex(r.timeline) && isIndex(r.turn);
}

function isDiscRef(v: unknown): boolean {
  const d = v as { timeline?: unknown; row?: unknown; col?: unknown };
  return !!d && typeof d === 'object' && isIndex(d.timeline) && isIndex(d.row) && isIndex(d.col);
}

/**
 * Whether a decoded value is an action the engine can even look at. The
 * engine decides whether it is legal; this only keeps nonsense (and the
 * TypeErrors it would cause) out of applyAction.
 */
export function isAction(v: unknown): v is Action {
  const a = v as { type?: unknown; timeline?: unknown; col?: unknown; spin?: unknown; from?: unknown; to?: unknown };
  if (!a || typeof a !== 'object') return false;
  switch (a.type) {
    case 'drop':
    case 'pop':
      return isIndex(a.timeline) && isIndex(a.col);
    case 'rotate':
      return isIndex(a.timeline) && (a.spin === 'cw' || a.spin === 'ccw');
    case 'flip':
      return isIndex(a.timeline);
    case 'endTurn':
      return true;
    case 'travel':
      return isDiscRef(a.from) && isBoardRef(a.to) && isIndex(a.col);
    default:
      return false;
  }
}

/** Rules as booleans, whatever the code actually carried. */
export function cleanRules(v: unknown): Rules {
  const r = (typeof v === 'object' && v ? v : {}) as Partial<Record<keyof Rules, unknown>>;
  return { popOut: !!r.popOut, flip: !!r.flip, strictPresent: !!r.strictPresent };
}

interface Payload {
  v: 1;
  r: Rules;
  m: GameSetup['mode'];
  a: Action[];
}

export function actionsOf(history: GameState[]): Action[] {
  return history.slice(1).map((s) => s.lastAction).filter((a): a is Action => !!a);
}

/**
 * A game as a code. This only writes one: whether the code is one this app
 * would read back is shareCodeFor's question, and the screen asks it there.
 */
export function encodeGame(history: GameState[], setup: GameSetup): string {
  const payload: Payload = { v: 1, r: history[0].rules, m: setup.mode === 'puzzle' ? 'local' : setup.mode, a: actionsOf(history) };
  return PREFIX + encode(JSON.stringify(payload));
}

/** A game as a code to send, or the reason it cannot be sent. */
export interface ShareCode {
  code: string | null;
  /** Why there is no code, in words the sender can act on. */
  problem: string | null;
}

/**
 * The code for a game, refused here rather than on the recipient's phone.
 * Every limit decodeGame holds a code to is a limit this app can reach by
 * playing - 1,500 saved moves is past what a code may carry - and a sender
 * who is allowed to copy such a code learns nothing: their opponent is the
 * one who is told, about a game that is real, in words that suggest it is
 * not. So the same limits are asked before the Copy and Share buttons are
 * offered at all.
 */
export function shareCodeFor(history: GameState[], setup: GameSetup): ShareCode {
  const limit = stateLimit(history[history.length - 1]);
  if (limit) {
    return {
      code: null,
      problem: `This game has grown past what a code can carry: ${limit.count} ${limit.what}, against the ${limit.limit} a code holds. It is still yours to play and to keep - it just cannot be sent.`,
    };
  }
  const actions = actionsOf(history).length;
  if (actions > MAX_ACTIONS) {
    return { code: null, problem: `This game is ${actions} moves long, and a code carries ${MAX_ACTIONS}. It is still yours to play and to keep - it just cannot be sent.` };
  }
  const code = encodeGame(history, setup);
  if (code.length > MAX_CODE_LENGTH) {
    return { code: null, problem: `This game makes a code of ${code.length} characters, and a code carries ${MAX_CODE_LENGTH}. It is still yours to play and to keep - it just cannot be sent.` };
  }
  return { code, problem: null };
}

export function decodeGame(code: string): { history: GameState[]; setup: GameSetup } {
  const trimmed = code.trim();
  if (!trimmed.startsWith(PREFIX)) throw new Error('This is not a 5D Connect Four game code.');
  if (trimmed.length > MAX_CODE_LENGTH) throw new Error('That code is too long to be a real game.');
  let payload: Payload;
  try {
    payload = JSON.parse(decode(trimmed.slice(PREFIX.length))) as Payload;
  } catch {
    throw new Error('That code is damaged and cannot be read.');
  }
  if (!payload || typeof payload !== 'object' || payload.v !== 1 || !Array.isArray(payload.a)) {
    throw new Error('That code is from a version this app cannot read.');
  }
  if (payload.a.length > MAX_ACTIONS) throw new Error('That code is too long to be a real game.');
  const history: GameState[] = [newGame(cleanRules(payload.r))];
  for (const action of payload.a) {
    if (!isAction(action)) throw new Error('That code contains a move that is not legal.');
    let next: GameState;
    try {
      next = applyAction(history[history.length - 1], action);
    } catch {
      throw new Error('That code contains a move that is not legal.');
    }
    const limit = stateLimit(next);
    // Not "too long to be a real game": a game this size is perfectly real,
    // and telling the recipient otherwise accuses the sender of faking it.
    if (limit) {
      throw new Error(`That game has ${limit.count} ${limit.what}, more than the ${limit.limit} this app will load from a code.`);
    }
    history.push(next);
  }
  return { history, setup: payload.m === 'bot' ? { mode: 'local' } : DEFAULT_SETUP };
}

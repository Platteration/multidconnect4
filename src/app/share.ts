/**
 * Game codes: a whole game squeezed into a string you can paste into a
 * message. Only the actions are stored; loading replays them through the
 * engine, so a tampered code simply fails to load.
 *
 * A code arrives from a chat message or a link, so it is untrusted in both
 * directions: every action is checked against the shape the engine expects
 * before it is replayed, and both the code and the number of actions are
 * capped, because replaying a list costs memory that grows with its square.
 */
import { Action, GameState, Rules, applyAction, newGame } from '../engine';
import { decode, encode } from './base64';
import { DEFAULT_SETUP, GameSetup } from './setup';

const PREFIX = '5DC4.';

/** More actions than any real game reaches; replaying them all is bounded work. */
export const MAX_ACTIONS = 1500;
/** A code for MAX_ACTIONS actions is well under this; anything longer is not a game. */
export const MAX_CODE_LENGTH = 96 * 1024;

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

export function encodeGame(history: GameState[], setup: GameSetup): string {
  const payload: Payload = { v: 1, r: history[0].rules, m: setup.mode === 'puzzle' ? 'local' : setup.mode, a: actionsOf(history) };
  return PREFIX + encode(JSON.stringify(payload));
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
    try {
      history.push(applyAction(history[history.length - 1], action));
    } catch {
      throw new Error('That code contains a move that is not legal.');
    }
  }
  return { history, setup: payload.m === 'bot' ? { mode: 'local' } : DEFAULT_SETUP };
}

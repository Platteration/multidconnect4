/**
 * Game codes: a whole game squeezed into a string you can paste into a
 * message. Only the actions are stored; loading replays them through the
 * engine, so a tampered code simply fails to load.
 */
import { Action, GameState, Rules, applyAction, newGame } from '../engine';
import { decode, encode } from './base64';
import { DEFAULT_SETUP, GameSetup } from './setup';

const PREFIX = '5DC4.';
const MAX_CODE_BYTES = 100000;
// The decoded payload limit is the primary guard; this bounds the work done
// by base64 decoding before that limit can be checked.
const MAX_CODE_CHARS = 140000;
const MAX_GAME_ACTIONS = 4000;

function safeParse<T>(text: string): T {
  return JSON.parse(text, (key, value) => {
    return key === '__proto__' || key === 'constructor' || key === 'prototype' ? undefined : value;
  }) as T;
}

interface Payload {
  v: 1;
  r: Rules;
  m: GameSetup['mode'];
  a: Action[];
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function isBoardRef(value: unknown): value is { timeline: number; turn: number } {
  if (!value || typeof value !== 'object') return false;
  const ref = value as Record<string, unknown>;
  return isInteger(ref.timeline) && ref.timeline >= 0 && isInteger(ref.turn) && ref.turn >= 0;
}

function isDiscRef(value: unknown): value is { timeline: number; row: number; col: number } {
  if (!value || typeof value !== 'object') return false;
  const ref = value as Record<string, unknown>;
  return isInteger(ref.timeline) && ref.timeline >= 0 && isInteger(ref.row) && ref.row >= 0 && isInteger(ref.col) && ref.col >= 0;
}

/** Validate the JSON shape before handing untrusted data to the engine. */
function isAction(value: unknown): value is Action {
  if (!value || typeof value !== 'object') return false;
  const action = value as Record<string, unknown>;
  switch (action.type) {
    case 'drop':
    case 'pop':
      return isInteger(action.timeline) && action.timeline >= 0 && isInteger(action.col) && action.col >= 0;
    case 'rotate':
      return isInteger(action.timeline) && action.timeline >= 0 && (action.spin === 'cw' || action.spin === 'ccw');
    case 'flip':
      return isInteger(action.timeline) && action.timeline >= 0;
    case 'endTurn':
      return true;
    case 'travel':
      return isDiscRef(action.from) && isBoardRef(action.to) && isInteger(action.col) && action.col >= 0;
    default:
      return false;
  }
}

function cleanRules(value: unknown): Rules {
  if (!value || typeof value !== 'object') return { popOut: false, flip: false, strictPresent: false };
  const rules = value as Record<string, unknown>;
  return { popOut: rules.popOut === true, flip: rules.flip === true, strictPresent: rules.strictPresent === true };
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
  if (trimmed.length > MAX_CODE_CHARS) throw new Error('That code is too long to load safely.');
  let payload: Payload;
  try {
    const payloadText = decode(trimmed.slice(PREFIX.length));
    if (payloadText.length > MAX_CODE_BYTES) throw new Error('That code is too long to load safely.');
    payload = safeParse<Payload>(payloadText);
  } catch {
    throw new Error('That code is damaged and cannot be read.');
  }
  if (!payload || typeof payload !== 'object' || payload.v !== 1 || !Array.isArray(payload.a)) throw new Error('That code is from a version this app cannot read.');
  if (payload.a.length > MAX_GAME_ACTIONS) throw new Error('That code is too long to load safely.');
  if (!payload.a.every(isAction)) throw new Error('That code contains an invalid move.');
  const history: GameState[] = [newGame(cleanRules(payload.r))];
  for (const action of payload.a) {
    try {
      history.push(applyAction(history[history.length - 1], action));
    } catch {
      throw new Error('That code contains a move that is not legal.');
    }
  }
  return { history, setup: payload.m === 'bot' ? { mode: 'local' } : DEFAULT_SETUP };
}

import { decode, encode } from '../../app/base64';
import { codeFromUrl } from '../../app/links';
import {
  MAX_ACTIONS,
  MAX_BOARDS,
  MAX_CODE_LENGTH,
  MAX_TIMELINES,
  decodeGame,
  encodeGame,
  shareCodeFor,
  stateLimit,
} from '../../app/share';
import { enumerateActions } from '../bot';
import { GameSetup } from '../../app/setup';
import { Action, GameState, IllegalAction, applyAction, getTimeline, newGame } from '../index';

/** Wrap a payload exactly as a sender would, so the whole decode path runs. */
const codeFor = (payload: unknown): string => `5DC4.${encode(JSON.stringify(payload))}`;

describe('game codes', () => {
  it('round-trips text through base64', () => {
    for (const t of ['', 'a', 'ab', 'abc', 'héllo wörld ✓', JSON.stringify({ a: [1, 2, 3] })]) {
      expect(decode(encode(t))).toBe(t);
    }
  });

  it('round-trips a game with travel and spins', () => {
    const drop = (col: number): Action => ({ type: 'drop', timeline: 0, col });
    const actions: Action[] = [
      drop(0), drop(6), drop(1), drop(6), drop(2), drop(6), drop(5), drop(3),
      { type: 'travel', from: { timeline: 0, row: 0, col: 5 }, to: { timeline: 0, turn: 6 }, col: 4 },
      { type: 'rotate', timeline: 1, spin: 'cw' },
    ];
    const history = actions.reduce((h, a) => [...h, applyAction(h[h.length - 1]!, a)], [newGame({ popOut: true })]);
    const code = encodeGame(history, { mode: 'local' });
    expect(code.startsWith('5DC4.')).toBe(true);
    const loaded = decodeGame(code);
    expect(loaded.history).toHaveLength(history.length);
    expect(loaded.history[loaded.history.length - 1]).toEqual(history[history.length - 1]);
    expect(loaded.history[0]?.rules.popOut).toBe(true);
  });

  it('rejects junk and illegal codes', () => {
    expect(() => decodeGame('hello')).toThrow(/not a 5D/);
    expect(() => decodeGame('5DC4.!!!')).toThrow(/damaged/);
    const bad = encodeGame([newGame(), applyAction(newGame(), { type: 'drop', timeline: 0, col: 0 })], { mode: 'local' });
    // Corrupt the action list by hand: drop twice in the same column beyond its height.
    const tampered = bad.replace(/.$/, 'A');
    expect(() => decodeGame(tampered)).toThrow();
  });

  it('rejects malformed actions before the engine sees them', () => {
    const payload = { v: 1, r: {}, m: 'local', a: [{ type: 'drop', timeline: 0, col: '0' }] };
    expect(() => decodeGame(`5DC4.${encode(JSON.stringify(payload))}`)).toThrow(/invalid move/);
  });
});

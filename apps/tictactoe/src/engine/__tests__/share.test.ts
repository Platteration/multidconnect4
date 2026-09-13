import { decode, encode } from '@5d/core';
import { decodeGame, encodeGame } from '../../app/share';
import { Action, applyAction, newGame } from '../index';

const mark = (cell: number): Action => ({ type: 'mark', timeline: 0, cell });

describe('game codes', () => {
  it('round-trips text through base64', () => {
    for (const t of ['', 'a', 'ab', 'abc', 'héllo wörld ✓']) expect(decode(encode(t))).toBe(t);
  });

  it('round-trips a game with a time travel', () => {
    const actions: Action[] = [
      mark(0),
      mark(4),
      mark(8),
      mark(2),
      { type: 'travel', from: { timeline: 0, cell: 8 }, to: { timeline: 0, turn: 2 } },
    ];
    const history = actions.reduce((h, a) => [...h, applyAction(h[h.length - 1], a)], [newGame({ strictPresent: true })]);
    const code = encodeGame(history, { mode: 'local' });
    expect(code.startsWith('5DTT.')).toBe(true);
    const loaded = decodeGame(code);
    expect(loaded.history).toHaveLength(history.length);
    expect(loaded.history[loaded.history.length - 1]).toEqual(history[history.length - 1]);
    expect(loaded.history[0].rules.strictPresent).toBe(true);
  });

  it('rejects junk codes', () => {
    expect(() => decodeGame('hello')).toThrow(/not a 5D/);
    expect(() => decodeGame('5DTT.!!!')).toThrow(/damaged/);
  });
});

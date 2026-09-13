/**
 * A game code recorded before the multiverse core was extracted. Share codes
 * and saved games both store the raw action list, so any change to the shape
 * of an Action silently invalidates every code already in the wild and every
 * game on someone's phone. This fixture is the tripwire for that.
 *
 * If this test fails, the fix is a migration that upgrades old actions on
 * decode, never a new fixture.
 */
import { decodeGame } from '../../app/share';

const CODE =
  '5DC4.eyJ2IjoxLCJyIjp7InBvcE91dCI6dHJ1ZSwiZmxpcCI6dHJ1ZSwic3RyaWN0UHJlc2VudCI6ZmFsc2V9LCJtIjoibG9jYWwiLCJhIjpbeyJ0eXBlIjoiZHJvcCIsInRpbWVsaW5lIjowLCJjb2wiOjB9LHsidHlwZSI6ImRyb3AiLCJ0aW1lbGluZSI6MCwiY29sIjo2fSx7InR5cGUiOiJkcm9wIiwidGltZWxpbmUiOjAsImNvbCI6MX0seyJ0eXBlIjoiZHJvcCIsInRpbWVsaW5lIjowLCJjb2wiOjZ9LHsidHlwZSI6ImRyb3AiLCJ0aW1lbGluZSI6MCwiY29sIjoyfSx7InR5cGUiOiJkcm9wIiwidGltZWxpbmUiOjAsImNvbCI6Nn0seyJ0eXBlIjoiZHJvcCIsInRpbWVsaW5lIjowLCJjb2wiOjV9LHsidHlwZSI6ImRyb3AiLCJ0aW1lbGluZSI6MCwiY29sIjozfSx7InR5cGUiOiJ0cmF2ZWwiLCJmcm9tIjp7InRpbWVsaW5lIjowLCJyb3ciOjAsImNvbCI6NX0sInRvIjp7InRpbWVsaW5lIjowLCJ0dXJuIjo2fSwiY29sIjo0fSx7InR5cGUiOiJyb3RhdGUiLCJ0aW1lbGluZSI6MSwic3BpbiI6ImN3In1dfQ';

describe('the recorded wire format', () => {
  it('still decodes to the same game', () => {
    const { history, setup } = decodeGame(CODE);
    const last = history[history.length - 1];

    expect(setup.mode).toBe('local');
    expect(history).toHaveLength(11);
    expect(last.rules).toEqual({ popOut: true, flip: true, strictPresent: false });
    expect(last.status).toBe('won');
    expect(last.toMove).toBe(1);
    expect(last.round).toBe(4);
    expect(last.timelines).toHaveLength(2);
    expect(last.win).toEqual({ player: 0, board: { timeline: 1, turn: 8 }, cells: [6, 12, 18, 24] });
  });

  it('replays every kind of action the format carries', () => {
    const { history } = decodeGame(CODE);
    const kinds = new Set(history.slice(1).map((s) => s.lastAction?.type));
    expect(kinds).toEqual(new Set(['drop', 'travel', 'rotate']));
  });
});

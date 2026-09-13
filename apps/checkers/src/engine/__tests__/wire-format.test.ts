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
  '5DCK.eyJ2IjoxLCJyIjp7ImZseWluZ0tpbmdzIjp0cnVlLCJiYWNrQ2FwdHVyZSI6ZmFsc2UsInN0cmljdFByZXNlbnQiOmZhbHNlfSwibSI6ImxvY2FsIiwiYSI6W3sidHlwZSI6Im1vdmUiLCJ0aW1lbGluZSI6MCwibW92ZSI6eyJmcm9tIjoxNywicGF0aCI6WzI0XSwiY2FwdHVyZXMiOltdfX0seyJ0eXBlIjoibW92ZSIsInRpbWVsaW5lIjowLCJtb3ZlIjp7ImZyb20iOjQ2LCJwYXRoIjpbMzldLCJjYXB0dXJlcyI6W119fSx7InR5cGUiOiJtb3ZlIiwidGltZWxpbmUiOjAsIm1vdmUiOnsiZnJvbSI6MTksInBhdGgiOlsyNl0sImNhcHR1cmVzIjpbXX19LHsidHlwZSI6Im1vdmUiLCJ0aW1lbGluZSI6MCwibW92ZSI6eyJmcm9tIjo0NCwicGF0aCI6WzM3XSwiY2FwdHVyZXMiOltdfX0seyJ0eXBlIjoidHJhdmVsIiwiZnJvbSI6eyJ0aW1lbGluZSI6MCwic3F1YXJlIjoyNn0sInRvIjp7InRpbWVsaW5lIjowLCJ0dXJuIjoyfX1dfQ';

describe('the recorded wire format', () => {
  it('still decodes to the same game', () => {
    const { history, setup } = decodeGame(CODE);
    const last = history[history.length - 1];

    expect(setup.mode).toBe('local');
    expect(history).toHaveLength(6);
    expect(last.rules).toEqual({ flyingKings: true, backCapture: false, strictPresent: false });
    expect(last.status).toBe('playing');
    expect(last.toMove).toBe(1);
    expect(last.quietPlies).toBe(0);
    expect(last.timelines).toHaveLength(2);
    expect(last.win).toBeNull();
  });

  it('replays both kinds of action the format carries', () => {
    const { history } = decodeGame(CODE);
    const kinds = new Set(history.slice(1).map((s) => s.lastAction?.type));
    expect(kinds).toEqual(new Set(['move', 'travel']));
  });
});

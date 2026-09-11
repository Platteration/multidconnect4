import { decode, encode } from '../../app/base64';
import { codeFromUrl } from '../../app/links';
import { MAX_ACTIONS, MAX_BOARDS, MAX_CODE_LENGTH, MAX_TIMELINES, decodeGame, encodeGame } from '../../app/share';
import { enumerateActions } from '../bot';
import { Action, GameState, IllegalAction, applyAction, newGame } from '../index';

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
    const history = actions.reduce((h, a) => [...h, applyAction(h[h.length - 1], a)], [newGame({ popOut: true })]);
    const code = encodeGame(history, { mode: 'local' });
    expect(code.startsWith('5DC4.')).toBe(true);
    const loaded = decodeGame(code);
    expect(loaded.history).toHaveLength(history.length);
    expect(loaded.history[loaded.history.length - 1]).toEqual(history[history.length - 1]);
    expect(loaded.history[0].rules.popOut).toBe(true);
  });

  it('rejects junk and illegal codes', () => {
    expect(() => decodeGame('hello')).toThrow(/not a 5D/);
    expect(() => decodeGame('5DC4.!!!')).toThrow(/damaged/);
    const bad = encodeGame([newGame(), applyAction(newGame(), { type: 'drop', timeline: 0, col: 0 })], { mode: 'local' });
    // Corrupt the action list by hand: drop twice in the same column beyond its height.
    const tampered = bad.replace(/.$/, 'A');
    expect(() => decodeGame(tampered)).toThrow();
  });
});

describe('hostile game codes', () => {
  // Actions in a code are written by whoever sent it. These are the shapes an
  // opponent can reach for: a cell outside the board (which used to alias
  // another row, remove the wrong disc and leave a hole nothing could fill),
  // a move the engine does not know, and a code too big to replay.
  const drop = (col: number) => ({ type: 'drop', timeline: 0, col });

  it('rejects a travel from outside the board, as captured in the wild', () => {
    // A code built by hand: four legal drops, then a travel from column 7 of a
    // seven-wide board. It used to load, and the board it produced then broke
    // the screen that drew it.
    const captured =
      '5DC4.eyJ2IjoxLCJyIjp7InBvcE91dCI6ZmFsc2UsImZsaXAiOmZhbHNlLCJzdHJpY3RQcmVzZW50IjpmYWxzZX0sIm0iOiJsb2NhbCIsImEiOlt7InR5cGUiOiJkcm9wIiwidGltZWxpbmUiOjAsImNvbCI6MH0seyJ0eXBlIjoiZHJvcCIsInRpbWVsaW5lIjowLCJjb2wiOjF9LHsidHlwZSI6ImRyb3AiLCJ0aW1lbGluZSI6MCwiY29sIjowfSx7InR5cGUiOiJkcm9wIiwidGltZWxpbmUiOjAsImNvbCI6MX0seyJ0eXBlIjoidHJhdmVsIiwiZnJvbSI6eyJ0aW1lbGluZSI6MCwicm93IjowLCJjb2wiOjd9LCJ0byI6eyJ0aW1lbGluZSI6MCwidHVybiI6MH0sImNvbCI6M31dfQ';
    // It really is the code described: readable, and only its last action is hostile.
    const payload = JSON.parse(decode(captured.slice('5DC4.'.length))) as { a: Action[] };
    expect(payload.a).toHaveLength(5);
    expect(payload.a[4]).toEqual({
      type: 'travel',
      from: { timeline: 0, row: 0, col: 7 },
      to: { timeline: 0, turn: 0 },
      col: 3,
    });
    expect(() => decodeGame(captured)).toThrow(/not legal/);
    // The engine, not just the message, must refuse it - and as an illegal
    // move, not as a TypeError a bare toThrow would have accepted.
    const legal = payload.a.slice(0, 4).reduce((s, a) => applyAction(s, a), newGame());
    expect(() => applyAction(legal, payload.a[4])).toThrow(IllegalAction);
  });

  it('rejects a pop from outside the board', () => {
    const code = codeFor({
      v: 1,
      r: { popOut: true, flip: false, strictPresent: false },
      m: 'local',
      a: [drop(0), drop(1), drop(0), drop(1), { type: 'pop', timeline: 0, col: 7 }],
    });
    expect(() => decodeGame(code)).toThrow(/not legal/);
  });

  it('rejects actions that are not actions at all', () => {
    for (const action of [
      null,
      'drop',
      { type: 'nope', timeline: 0 },
      { type: 'drop', timeline: 0 },
      { type: 'drop', timeline: 0, col: '0' },
      { type: 'drop', timeline: 0, col: 1.5 },
      { type: 'drop', timeline: -1, col: 0 },
      { type: 'rotate', timeline: 0, spin: 'sideways' },
      { type: 'travel', from: { timeline: 0, row: 0 }, to: { timeline: 0, turn: 0 }, col: 3 },
    ]) {
      expect(() => decodeGame(codeFor({ v: 1, r: {}, m: 'local', a: [action] }))).toThrow(/not legal/);
    }
  });

  it('reads rules as rules, whatever the code says they are', () => {
    const code = codeFor({ v: 1, r: 'popOut', m: 'local', a: [drop(0)] });
    expect(decodeGame(code).history[0].rules).toEqual({ popOut: false, flip: false, strictPresent: false });
  });

  it('refuses a code with more actions than a game could have', () => {
    // With pop-out on, drop/drop/pop/pop is an endless cycle of legal moves,
    // so a sender can make the list as long as they like. Replaying it copies
    // every board on every action, so the cost grows with the square.
    const cycle: unknown[] = [];
    while (cycle.length <= MAX_ACTIONS) {
      cycle.push(drop(0), drop(1), { type: 'pop', timeline: 0, col: 0 }, { type: 'pop', timeline: 0, col: 1 });
    }
    const code = codeFor({ v: 1, r: { popOut: true }, m: 'local', a: cycle });
    const started = Date.now();
    expect(() => decodeGame(code)).toThrow(/too long/);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  /** Every board of every timeline, which is what the map has to draw. */
  const boardCount = (state: GameState) => state.timelines.reduce((n, tl) => n + tl.boards.length, 0);

  /**
   * A legal game played to branch as often as it can: travel whenever a
   * travel is legal, otherwise take whatever else is on offer. Every travel
   * adds a whole timeline, which is a row of thumbnails on the map.
   */
  function branchingActions(count: number): Action[] {
    let state = newGame();
    const actions: Action[] = [];
    while (actions.length < count) {
      const legal = enumerateActions(state, 3);
      const action = legal.find((a) => a.type === 'travel') ?? legal[0];
      if (!action) break;
      const next = applyAction(state, action);
      if (next.status !== 'playing') break;
      state = next;
      actions.push(action);
    }
    return actions;
  }

  it('refuses a code that builds more timelines than a game has, though it is inside both caps', () => {
    // The caps above bound the replay, not the multiverse it leaves on
    // screen. Every action here is legal and the code is small; what makes it
    // hostile is the state at the end - one row of thumbnails per timeline.
    const actions = branchingActions(200);
    const code = codeFor({ v: 1, r: {}, m: 'local', a: actions });
    expect(actions.length).toBeLessThanOrEqual(MAX_ACTIONS);
    expect(code.length).toBeLessThanOrEqual(MAX_CODE_LENGTH);
    // Counted from the actions themselves, not from the cap they run into.
    const built = actions.reduce((s, a) => applyAction(s, a), newGame());
    expect(built.timelines.length).toBeGreaterThan(MAX_TIMELINES);
    expect(() => decodeGame(code)).toThrow(/too long/);
  });

  it('refuses a code that builds more boards than a game has, though it is inside both caps', () => {
    // One timeline, so the cap above cannot be what stops it: drop/drop/pop/
    // pop returns the board to empty, and every action still leaves a board
    // behind for the map to draw.
    const cycle: Action[] = [];
    while (cycle.length < MAX_BOARDS + 50) {
      cycle.push(
        { type: 'drop', timeline: 0, col: 0 },
        { type: 'drop', timeline: 0, col: 1 },
        { type: 'pop', timeline: 0, col: 0 },
        { type: 'pop', timeline: 0, col: 1 },
      );
    }
    const code = codeFor({ v: 1, r: { popOut: true }, m: 'local', a: cycle });
    expect(cycle.length).toBeLessThanOrEqual(MAX_ACTIONS);
    expect(code.length).toBeLessThanOrEqual(MAX_CODE_LENGTH);
    const built = cycle.reduce((s, a) => applyAction(s, a), newGame({ popOut: true }));
    expect(built.timelines.length).toBe(1);
    expect(boardCount(built)).toBeGreaterThan(MAX_BOARDS);
    expect(() => decodeGame(code)).toThrow(/too long/);
  });

  it('still loads a game of the size people actually play', () => {
    // The limits must not reach a real game: a branching one, replayed whole.
    const actions = branchingActions(40);
    const built = actions.reduce((s, a) => applyAction(s, a), newGame());
    expect(built.timelines.length).toBeGreaterThan(1);
    const loaded = decodeGame(codeFor({ v: 1, r: {}, m: 'local', a: actions }));
    expect(loaded.history).toHaveLength(actions.length + 1);
    expect(loaded.history[loaded.history.length - 1]).toEqual(built);
  });

  it('refuses an oversized code and an oversized link before decoding either', () => {
    const huge = `5DC4.${'A'.repeat(MAX_CODE_LENGTH + 1)}`;
    expect(() => decodeGame(huge)).toThrow(/too long/);
    expect(codeFromUrl(`multidconnect4://?code=${huge}`)).toBeNull();
    expect(codeFromUrl('multidconnect4://?code=5DC4.abc')).toBe('5DC4.abc');
  });

  it('survives a payload that is not an object', () => {
    for (const payload of [null, 5, 'x', [1, 2, 3]]) {
      expect(() => decodeGame(codeFor(payload))).toThrow(/version this app cannot read/);
    }
  });
});

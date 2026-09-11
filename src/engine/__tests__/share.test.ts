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
  /** The first state in a replay that passes a cap, which is where decode stops. */
  function firstStatePast(actions: Action[], past: (s: GameState) => boolean): GameState {
    let state = newGame();
    for (const action of actions) {
      state = applyAction(state, action);
      if (past(state)) return state;
    }
    throw new Error('this game never passes the cap');
  }

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
    // Replaying stops at the first state past the cap, so that is the one the
    // message counts; both numbers come from replaying the actions here.
    const refused = firstStatePast(actions, (s) => s.timelines.length > MAX_TIMELINES);
    expect(() => decodeGame(code)).toThrow(new RegExp(`${refused.timelines.length} timelines`));
  });

  it('says a game is too big for a code without saying it is not a game', () => {
    // The refusal the recipient reads. A game of this size is perfectly real
    // - the sender played it - and the length message ("too long to be a real
    // game", for a code no game could produce) accuses them of faking it.
    const actions = branchingActions(200);
    const refused = firstStatePast(actions, (s) => s.timelines.length > MAX_TIMELINES);
    let message = '';
    try {
      decodeGame(codeFor({ v: 1, r: {}, m: 'local', a: actions }));
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain(`${refused.timelines.length} timelines`);
    expect(message).toContain(`${MAX_TIMELINES}`);
    expect(message).not.toMatch(/real game/);
    // And the two refusals stay distinguishable, which is the point of it.
    expect(() => decodeGame(`5DC4.${'A'.repeat(MAX_CODE_LENGTH + 1)}`)).toThrow(/real game/);
  });

  it('keeps the board cap above every game that can be played into a save', () => {
    // A code may carry MAX_ACTIONS actions, and every action leaves at most
    // one board behind plus one more when it opens a timeline, so inside the
    // timeline cap no code can reach the board cap: it is a backstop, and it
    // has to stay one, because the game it used to refuse (a pop-out game of
    // a few hundred moves) is a game this app will happily save.
    expect(MAX_BOARDS).toBeGreaterThanOrEqual(1 + MAX_ACTIONS + MAX_TIMELINES);
    // The premise, measured on a played game rather than assumed.
    const actions = branchingActions(200);
    const built = actions.reduce((s, a) => applyAction(s, a), newGame());
    expect(boardCount(built)).toBeLessThanOrEqual(1 + actions.length + (built.timelines.length - 1));
    // The check itself still refuses a state past it, however it got there.
    const board = newGame().timelines[0].boards[0];
    const huge: GameState = {
      ...newGame(),
      timelines: [{ ...newGame().timelines[0], boards: Array.from({ length: MAX_BOARDS + 1 }, () => board) }],
    };
    expect(stateLimit(huge)).toEqual({ what: 'boards', count: MAX_BOARDS + 1, limit: MAX_BOARDS });
    // And passes a game of the size people play, boards and timelines alike.
    const ordinary = branchingActions(40).reduce((s, a) => applyAction(s, a), newGame());
    expect(stateLimit(ordinary)).toBeNull();
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

/**
 * The other end of the same limits. Everything decodeGame refuses, this app
 * can also reach by playing - a saved game runs to MAX_SAVED_ACTIONS moves -
 * so a code has to be refused where it is made too. Offering one that cannot
 * be loaded back moves the failure onto the recipient's phone, where it reads
 * as the sender's real game being called fake, and neither player is told
 * which of them is at fault.
 */
describe('a code this app makes', () => {
  const LOCAL: GameSetup = { mode: 'local' };
  const drop = (col: number): Action => ({ type: 'drop', timeline: 0, col });
  const play = (actions: Action[], rules?: Parameters<typeof newGame>[0]): GameState[] =>
    actions.reduce((h, a) => [...h, applyAction(h[h.length - 1], a)], [newGame(rules)]);

  /** The game the save path is written for: two stubborn players, one timeline. */
  function popOutGame(moves: number): GameState[] {
    const actions: Action[] = [];
    while (actions.length < moves) {
      actions.push(drop(0), drop(1), { type: 'pop', timeline: 0, col: 0 }, { type: 'pop', timeline: 0, col: 1 });
    }
    return play(actions.slice(0, moves), { popOut: true, flip: false, strictPresent: false });
  }

  function branchingGame(actions: number): GameState[] {
    const history: GameState[] = [newGame()];
    while (history.length <= actions) {
      const state = history[history.length - 1];
      const legal = enumerateActions(state, 3);
      const action = legal.find((a) => a.type === 'travel') ?? legal[0];
      if (!action) break;
      const next = applyAction(state, action);
      if (next.status !== 'playing') break;
      history.push(next);
    }
    return history;
  }

  it('carries the 500-move pop-out game, which is a game and not an attack', () => {
    // 501 boards on one timeline. The app will save this game and draw it, so
    // it must also be able to send it: a limit that refuses it here ends the
    // game for both players, on the far phone, with no way to tell why.
    const history = popOutGame(500);
    const last = history[history.length - 1];
    expect(last.timelines).toHaveLength(1);
    expect(last.timelines[0].boards.length).toBe(501);

    const { code, problem } = shareCodeFor(history, LOCAL);
    expect(problem).toBeNull();
    expect(code).not.toBeNull();
    // And the recipient really can read what the sender was handed.
    const loaded = decodeGame(code!);
    expect(loaded.history[loaded.history.length - 1]).toEqual(last);
  });

  it('refuses to make a code the app itself would refuse to read', () => {
    const history = branchingGame(200);
    const last = history[history.length - 1];
    expect(last.timelines.length).toBeGreaterThan(MAX_TIMELINES);

    const { code, problem } = shareCodeFor(history, LOCAL);
    expect(code).toBeNull();
    expect(problem).toContain(`${last.timelines.length} timelines`);
    expect(problem).toContain(`${MAX_TIMELINES}`);
    // What used to be offered instead: a code that fails on the other phone.
    expect(() => decodeGame(encodeGame(history, LOCAL))).toThrow();
  });

  it('refuses a game with more moves than a code carries', () => {
    const history = popOutGame(MAX_ACTIONS + 4);
    const { code, problem } = shareCodeFor(history, LOCAL);
    expect(code).toBeNull();
    expect(problem).toContain(`${history.length - 1} moves`);
  });

  it('hands back nothing it would not take back', () => {
    // The property the two ends have to keep between them, over every shape
    // of game to hand: a code that is offered is a code that loads.
    for (const history of [popOutGame(4), popOutGame(500), branchingGame(40), branchingGame(200)]) {
      const { code, problem } = shareCodeFor(history, LOCAL);
      expect(code === null).toBe(problem !== null);
      if (code) {
        expect(decodeGame(code).history).toHaveLength(history.length);
      }
    }
  });
});

/**
 * Where the game controller points the screen when it lands on a position it
 * did not just play: a resumed game, a loaded code, an undo, and "go to the
 * waiting board". Each of those asks for the first board still waiting for
 * the player to move, and under the strict-present rule "waiting" has an
 * order: a board at the present must be played before the turn can end, and
 * one ahead of it may be left for later. The board that must be played comes
 * first, and only when there is none does a board that may wait.
 *
 * The rule was restated as one expression when every index that can miss
 * started to be handled as one, and nothing held it: the two halves could be
 * swapped with the whole suite green. On the position below every one of these
 * paths would then point a strict-present player at a board they may leave
 * for later, while the one they have to play sat somewhere else on the map.
 */
import React from 'react';
import TestRenderer, { ReactTestRenderer, act } from 'react-test-renderer';
import {
  Action,
  BoardRef,
  GameState,
  Rules,
  applyAction,
  canEndTurn,
  latestRef,
  getTimeline,
  mandatoryTimelines,
  newGame,
  optionalTimelines,
  pendingTimelines,
} from '../../engine';
import { DEFAULT_SETUP } from '../../app/setup';
import { GameController, useGame } from '../useGame';

// The controller reaches expo-audio through its feedback, and expo-audio will
// not load under jest without its native side. Nothing here is about sound.
// (jest.mock is hoisted above the imports.)
jest.mock('../../app/sound', () => ({ playSound: () => {}, setSoundEnabled: () => {} }));

const drop = (timeline: number, col: number): Action => ({ type: 'drop', timeline, col });

const STRICT: Partial<Rules> = { strictPresent: true };

/** Every state of a game played from the start, oldest first, as useGame keeps it. */
function played(actions: Action[], rules: Partial<Rules> = STRICT): GameState[] {
  const history = [newGame(rules)];
  for (const action of actions) history.push(applyAction(history[history.length - 1]!, action));
  return history;
}

/**
 * The welcome pages' demo, played with the strict-present rule on: four drops
 * on timeline 0 (columns 3, 3, 2 and 4), then player 0 lifts the disc it
 * dropped in column 2 and sends it back to turn 2, into column 5. Timeline 0
 * ends at turn 5 and the travel opens timeline 1 at turn 3, so the present is
 * turn 3 and it is player 1 to move on both.
 */
const DEMO: Action[] = [
  drop(0, 3),
  drop(0, 3),
  drop(0, 2),
  drop(0, 4),
  { type: 'travel', from: { timeline: 0, row: 0, col: 2 }, to: { timeline: 0, turn: 2 }, col: 5 },
];
const demo = played(DEMO);
const afterTravel = demo[demo.length - 1]!;
/** The same game once player 1 has played the board at the present, leaving only the one ahead. */
const presentPlayed = [...demo, applyAction(afterTravel, drop(1, 0))];
const onlyAhead = presentPlayed[presentPlayed.length - 1]!;

/** The two boards the demo leaves waiting, named from the game rather than from the controller. */
const atPresent: BoardRef = latestRef(getTimeline(afterTravel, 1));
const ahead: BoardRef = latestRef(getTimeline(afterTravel, 0));
const ids = (timelines: { id: number }[]) => timelines.map((tl) => tl.id);

interface Mounted {
  game: () => GameController;
  tree: ReactTestRenderer;
}

function mount(history: GameState[], rules: Partial<Rules> = STRICT): Mounted {
  let game!: GameController;
  function Probe() {
    game = useGame(history, rules, DEFAULT_SETUP);
    return null;
  }
  let tree!: ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(React.createElement(Probe));
  });
  return { game: () => game, tree };
}

describe('the position the scenarios below stand on', () => {
  it('has a board that must be played, listed after one that may wait', () => {
    // Player 1 is to move on both boards; the one at the present is timeline
    // 1, which comes second in the list of every waiting board. A test on a
    // position where the two lists agreed on which board comes first could
    // not tell the order of the halves apart.
    expect(afterTravel.toMove).toBe(1);
    expect(atPresent).toEqual({ timeline: 1, turn: 3 });
    expect(ahead).toEqual({ timeline: 0, turn: 5 });
    expect(ids(pendingTimelines(afterTravel))).toEqual([0, 1]);
    expect(ids(mandatoryTimelines(afterTravel))).toEqual([1]);
    expect(ids(optionalTimelines(afterTravel))).toEqual([0]);
    // Once the present is played, only the board ahead is left, and the turn may end.
    expect(onlyAhead.toMove).toBe(1);
    expect(ids(mandatoryTimelines(onlyAhead))).toEqual([]);
    expect(ids(pendingTimelines(onlyAhead))).toEqual([0]);
    expect(canEndTurn(onlyAhead)).toBe(true);
  });
});

describe('where the controller points the screen', () => {
  it('opens a resumed game on the board that must be played', () => {
    const { game, tree } = mount(demo);
    expect(game().focus).toEqual(atPresent);
    act(() => tree.unmount());
  });

  it('opens a resumed game on the board ahead once nothing at the present is left', () => {
    const { game, tree } = mount(presentPlayed);
    expect(game().focus).toEqual(ahead);
    act(() => tree.unmount());
  });

  it('loads a game code onto the board that must be played', () => {
    const { game, tree } = mount([newGame(STRICT)]);
    act(() => game().load(demo, DEFAULT_SETUP));
    expect(game().state).toBe(afterTravel);
    expect(game().focus).toEqual(atPresent);
    act(() => tree.unmount());
  });

  it('undoes back onto the board that must be played', () => {
    const { game, tree } = mount(presentPlayed);
    act(() => game().undo());
    expect(game().state).toBe(afterTravel);
    expect(game().focus).toEqual(atPresent);
    act(() => tree.unmount());
  });

  it('opens on the first waiting board when every waiting board must be played', () => {
    // Without the strict-present rule both boards of the same position must be
    // played before the turn passes, and the first of them is the one shown.
    const loose = played(DEMO, {});
    const last = loose[loose.length - 1]!;
    expect(ids(mandatoryTimelines(last))).toEqual([0, 1]);
    const { game, tree } = mount(loose, {});
    expect(game().focus).toEqual(latestRef(getTimeline(last, 0)));
    act(() => tree.unmount());
  });

  it('goes to the waiting board that must be played, from anywhere on the map', () => {
    const { game, tree } = mount(demo);
    act(() => game().focusBoard({ timeline: 0, turn: 0 }));
    expect(game().focus).toEqual({ timeline: 0, turn: 0 });
    act(() => game().goToWaitingBoard());
    expect(game().focus).toEqual(atPresent);
    act(() => tree.unmount());
  });
});

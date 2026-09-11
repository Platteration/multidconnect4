/**
 * The multiverse map draws every board that has ever existed, and each
 * thumbnail is rows x cols views. It re-renders on every focus, selection,
 * animation and layout change, so the thumbnails have to be skippable: their
 * props must compare equal when nothing about that board's look has changed.
 * They were not - the map handed each one a fresh `() => onPressBoard(ref)` -
 * so React.memo never skipped a single one.
 */
// The settings store reaches native storage on import; nothing here uses it.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));

// Stand in for the thumbnail so its renders can be counted, wrapped in the
// same React.memo the real one uses. What is under test is what the map hands
// it, not what it draws. (Jest hoists the mock above the imports, so anything
// it closes over has to carry a name jest recognises as a test double.)
let mockThumbnailRenders = 0;
let mockThumbnailProps: Array<Record<string, unknown>> = [];
jest.mock('../MiniBoard', () => {
  const react = jest.requireActual('react') as typeof import('react');
  const actual = jest.requireActual('../MiniBoard') as Record<string, unknown>;
  return {
    ...actual,
    MiniBoard: react.memo(function MiniBoardStub(props: Record<string, unknown>) {
      mockThumbnailRenders++;
      mockThumbnailProps.push(props);
      return null;
    }),
  };
});

import React from 'react';

import { Action, BoardRef, GameState, applyAction, newGame } from '../../engine';
import { MultiverseMap } from '../MultiverseMap';

// The renderer ships with jest-expo but carries no type definitions, and this
// project deliberately depends on nothing extra, so it is described here.
interface Node {
  props: Record<string, unknown>;
}
interface Tree {
  root: { findAll(match: (node: Node) => boolean): Node[] };
  update(element: React.ReactElement): void;
  unmount(): void;
}
interface Renderer {
  create(element: React.ReactElement): Tree;
  act(body: () => void): void;
}
declare const require: (name: string) => unknown;
const TestRenderer = require('react-test-renderer') as Renderer;

const drop = (timeline: number, col: number): Action => ({ type: 'drop', timeline, col });

/**
 * Four moves and a time travel, then one more drop: two timelines, and a last
 * action that is not a travel, so the map does not start its flight animation.
 */
function multiverse(): GameState {
  const start = [drop(0, 0), drop(0, 1), drop(0, 2), drop(0, 3)].reduce(
    (s, a) => applyAction(s, a),
    newGame(),
  );
  const branched = applyAction(start, {
    type: 'travel',
    from: { timeline: 0, row: 0, col: 0 },
    to: { timeline: 0, turn: 2 },
    col: 6,
  });
  return applyAction(branched, drop(0, 1));
}

function boardCount(state: GameState): number {
  return state.timelines.reduce((n, tl) => n + tl.boards.length, 0);
}

function render(state: GameState, onPressBoard: (ref: BoardRef) => void) {
  const element = () =>
    React.createElement(MultiverseMap, {
      state,
      focus: { timeline: 0, turn: 0 },
      targets: [],
      origin: null,
      onPressBoard,
    });
  let tree: Tree | undefined;
  TestRenderer.act(() => {
    tree = TestRenderer.create(element());
  });
  return {
    rerender: () =>
      TestRenderer.act(() => {
        tree!.update(element());
      }),
    /** Scroll the map down, the way a finger would. */
    scrollDown: (y: number) => {
      // The vertical scroller is the nested one; the outer scroller is
      // horizontal. Both have an onScroll, and the host view repeats it.
      const scrollers = tree!.root.findAll(
        (node) => typeof node.props.onScroll === 'function' && node.props.nestedScrollEnabled === true,
      );
      const onScroll = scrollers[0].props.onScroll as (e: unknown) => void;
      TestRenderer.act(() => {
        onScroll({ nativeEvent: { contentOffset: { x: 0, y } } });
      });
    },
    unmount: () =>
      TestRenderer.act(() => {
        tree!.unmount();
      }),
  };
}

/**
 * A multiverse far bigger than any screen, built by hand rather than played:
 * what is under test is what the map does with the state it is handed, and a
 * game code decides that state. Every timeline is the same shape, so the
 * number of thumbnails the map draws can be compared between two sizes.
 */
function wideMultiverse(timelines: number): GameState {
  const base = newGame();
  const board = base.timelines[0].boards[0];
  return {
    ...base,
    timelines: Array.from({ length: timelines }, (_, id) => ({
      id,
      startTurn: 0,
      boards: [board, board, board, board],
      createdBy: id === 0 ? null : (0 as const),
      branchedFrom: id === 0 ? null : { timeline: 0, turn: 0 },
      origin: id === 0 ? null : { timeline: 0, turn: 0 },
    })),
  };
}

/** One timeline that has run for a very long time: a wide map, not a tall one. */
function longTimeline(turns: number): GameState {
  const base = newGame();
  const board = base.timelines[0].boards[0];
  return { ...base, timelines: [{ ...base.timelines[0], boards: Array.from({ length: turns }, () => board) }] };
}

/** Which timelines have a thumbnail mounted right now. */
function drawnTimelines(): number[] {
  return mockThumbnailProps.map((p) => p.timeline as number);
}

describe('the multiverse map', () => {
  beforeEach(() => {
    mockThumbnailRenders = 0;
    mockThumbnailProps = [];
  });

  it('does not rebuild every thumbnail when it re-renders unchanged', () => {
    const state = multiverse();
    const view = render(state, () => {});
    const first = mockThumbnailRenders;
    expect(first).toBe(boardCount(state));

    // Same props, a fresh element: the map re-renders, the thumbnails must not.
    view.rerender();
    expect(mockThumbnailRenders).toBe(first);
    view.unmount();
  });

  it('still reports which board was pressed, through the shared callback', () => {
    const pressed: BoardRef[] = [];
    const view = render(multiverse(), (ref) => pressed.push(ref));
    // The last thumbnail drawn is the newest board of the branched timeline.
    const last = mockThumbnailProps[mockThumbnailProps.length - 1] as {
      timeline?: number;
      turn?: number;
      onPress?: (ref: BoardRef) => void;
    };
    expect(typeof last.onPress).toBe('function');
    last.onPress!({ timeline: last.timeline!, turn: last.turn! });
    expect(pressed).toEqual([{ timeline: 1, turn: 3 }]);
    view.unmount();
  });

  it('draws a screenful of thumbnails, not every board the state holds', () => {
    // Each thumbnail is rows x cols views, so a map that drew them all would
    // mount as many native views as whoever wrote the game code chose. Ten
    // times the multiverse must not be ten times the views.
    const small = wideMultiverse(200);
    const big = wideMultiverse(2000);
    expect(boardCount(big)).toBe(boardCount(small) * 10);

    const first = render(small, () => {});
    const drawnSmall = mockThumbnailRenders;
    first.unmount();
    mockThumbnailRenders = 0;
    mockThumbnailProps = [];
    const second = render(big, () => {});
    const drawnBig = mockThumbnailRenders;
    second.unmount();

    expect(drawnBig).toBe(drawnSmall);
    expect(drawnSmall * 4).toBeLessThan(boardCount(small));
  });

  it('draws a screenful of turns, however long the game has run', () => {
    // The same bound the other way round: one timeline, thousands of turns.
    const short = longTimeline(200);
    const long = longTimeline(2000);
    expect(boardCount(long)).toBe(boardCount(short) * 10);

    const first = render(short, () => {});
    const drawnShort = mockThumbnailRenders;
    first.unmount();
    mockThumbnailRenders = 0;
    mockThumbnailProps = [];
    const second = render(long, () => {});
    const drawnLong = mockThumbnailRenders;
    second.unmount();

    expect(drawnLong).toBe(drawnShort);
    expect(drawnShort * 4).toBeLessThan(boardCount(short));
  });

  it('draws the rows a scroll brings into view', () => {
    // Windowing is only honest if the rest of the multiverse is still
    // reachable: what is drawn has to follow the scroll.
    const state = wideMultiverse(2000);
    const view = render(state, () => {});
    const before = drawnTimelines();
    mockThumbnailProps = [];
    view.scrollDown(50000);
    const after = drawnTimelines();
    view.unmount();

    expect(after.length).toBeGreaterThan(0);
    expect(Math.min(...after)).toBeGreaterThan(Math.max(...before));
    expect(after.length * 4).toBeLessThan(boardCount(state));
  });

  it('keeps the thumbnail memoised', () => {
    // The map's half of this only pays off while MiniBoard is a memo.
    const real = (jest.requireActual('../MiniBoard') as { MiniBoard: { $$typeof: symbol } }).MiniBoard;
    expect(real.$$typeof).toBe(Symbol.for('react.memo'));
  });
});

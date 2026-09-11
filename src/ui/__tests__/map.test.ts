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
import { MINI_HEIGHT, MINI_WIDTH } from '../MiniBoard';
import { MAP_LAYOUT, MultiverseMap } from '../MultiverseMap';

// The renderer ships with jest-expo but carries no type definitions, and this
// project deliberately depends on nothing extra, so it is described here.
interface Node {
  type: unknown;
  props: Record<string, unknown>;
  findAll(match: (node: Node) => boolean): Node[];
}
interface Tree {
  root: Node;
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
  const scrollTo = (x: number, y: number) => {
    // The vertical scroller is the nested one; the outer scroller is
    // horizontal. Both have an onScroll, and the host view repeats it.
    const vertical = tree!.root.findAll(
      (node) => typeof node.props.onScroll === 'function' && node.props.nestedScrollEnabled === true,
    )[0];
    const horizontal = tree!.root.findAll(
      (node) => typeof node.props.onScroll === 'function' && node.props.horizontal === true,
    )[0];
    const across = horizontal.props.onScroll as (e: unknown) => void;
    const down = vertical.props.onScroll as (e: unknown) => void;
    mockThumbnailProps = [];
    TestRenderer.act(() => {
      across({ nativeEvent: { contentOffset: { x, y: 0 } } });
      down({ nativeEvent: { contentOffset: { x: 0, y } } });
    });
  };
  return {
    rerender: () =>
      TestRenderer.act(() => {
        tree!.update(element());
      }),
    /** Scroll the map down, the way a finger would. */
    scrollDown: (y: number) => scrollTo(0, y),
    scrollTo,
    /** Tell the map how big it is, which on a device onLayout does. */
    layout: (width: number, height: number) => {
      const outer = tree!.root.findAll((node) => typeof node.props.onLayout === 'function')[0];
      mockThumbnailProps = [];
      TestRenderer.act(() => {
        (outer.props.onLayout as (e: unknown) => void)({ nativeEvent: { layout: { width, height } } });
      });
    },
    hosts: () => tree!.root.findAll((node) => typeof node.type === 'string'),
    /** The thumbnail elements themselves, mounted or not yet re-rendered. */
    thumbnails: () =>
      tree!.root.findAll(
        (node) => typeof node.props.turn === 'number' && typeof node.props.timeline === 'number' && !!node.props.board,
      ),
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

/**
 * A multiverse whose timelines start at different turns, so the horizontal
 * window has something to get wrong: each row holds the same number of
 * boards but they sit at different places along the map.
 */
function staggeredMultiverse(timelines: number, boardsPer: number): GameState {
  const base = newGame();
  const board = base.timelines[0].boards[0];
  return {
    ...base,
    timelines: Array.from({ length: timelines }, (_, id) => ({
      id,
      startTurn: (id * 7) % 40,
      boards: Array.from({ length: boardsPer }, () => board),
      createdBy: id === 0 ? null : (0 as const),
      branchedFrom: id === 0 ? null : { timeline: Math.floor(id / 2), turn: (id * 7) % 40 },
      origin: id === 0 ? null : { timeline: Math.floor(id / 2), turn: (id * 7) % 40 },
    })),
  };
}

const { HEADER, ROW, SLOT, SLOT_TOP } = MAP_LAYOUT;

/** Where the map says this board belongs, from the state alone. */
function boardRect(tl: GameState['timelines'][number], index: number) {
  const turn = tl.startTurn + index;
  const left = (turn + 1) * SLOT;
  const top = HEADER + tl.id * ROW + SLOT_TOP;
  return { turn, left, right: left + MINI_WIDTH, top, bottom: top + MINI_HEIGHT };
}

const overlaps = (a: number, b: number, from: number, to: number) => a < to && b > from;

/**
 * Render, then hand the map a layout the way a phone does. Every map test
 * before this one ran on the unmeasured fallback, which is the one path a
 * real device never takes.
 */
function laidOut(state: GameState, viewport: { width: number; height: number }) {
  const view = render(state, () => {});
  view.layout(viewport.width, viewport.height);
  return {
    ...view,
    /** Every row the map drew, by the timeline its own label names. */
    rows(): Array<{ id: number; top: number }> {
      const out: Array<{ id: number; top: number }> = [];
      for (const node of view.hosts()) {
        const style = flatten(node.props.style);
        if (style.position !== 'absolute' || style.height !== ROW || style.left !== 0) continue;
        const label = node.findAll(
          (n) => n.type === 'Text' && Array.isArray(n.props.children) && n.props.children[0] === 'T',
        )[0];
        const shown = label ? (label.props.children as unknown[])[1] : undefined;
        if (typeof shown === 'number') out.push({ id: shown - 1, top: style.top as number });
      }
      return out;
    },
    /**
     * Every thumbnail mounted right now, as the boards they stand for. Read
     * off the tree rather than from the render counter above: the stub is
     * memoised, so a thumbnail that is still mounted after a scroll does not
     * render again and would be missed.
     */
    boards(): Array<{ timeline: number; turn: number }> {
      const seen = new Map<string, { timeline: number; turn: number }>();
      for (const node of view.thumbnails()) {
        const board = { timeline: node.props.timeline as number, turn: node.props.turn as number };
        seen.set(`${board.timeline}:${board.turn}`, board);
      }
      return [...seen.values()];
    },
    /** How many branch lines are drawn, and for which timelines. */
    links(): number {
      return view.hosts().filter((n) => flatten(n.props.style).width === 2).length;
    },
  };
}

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten));
  return (style ?? {}) as Record<string, unknown>;
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

/**
 * Where the map puts things, rather than how many things it puts. The rows
 * are absolutely placed at HEADER + tl.id * ROW while the window that chooses
 * them is a slice by index: the two agree only because timeline ids are dense
 * (the engine's own test pins that), and nothing here counted rows before, so
 * placing them by their position in the window instead - one word - passed
 * every test, typechecked, exported, and left the map blank at most scroll
 * positions on a real phone.
 *
 * The size below is the map viewport the phone web build reports; the tests
 * above it all run on the unmeasured fallback, which no device ever takes.
 */
describe('where the map puts what it draws', () => {
  const PHONE = { width: 356, height: 281 };

  beforeEach(() => {
    mockThumbnailRenders = 0;
    mockThumbnailProps = [];
  });

  /** Scroll offsets a finger reaches on a map this size, top to bottom. */
  const positions: Array<[number, number]> = [
    [0, 0],
    [0, 1500],
    [340, 5000],
    [0, 9000],
    [200, 13800],
  ];

  it('places every row by its timeline, not by its place in the window', () => {
    const state = staggeredMultiverse(200, 6);
    const view = laidOut(state, PHONE);
    for (const [x, y] of positions) {
      view.scrollTo(x, y);
      const rows = view.rows();
      expect(rows.length).toBeGreaterThan(0);
      // Each row sits where its own id says, wherever the window starts.
      for (const row of rows) expect({ id: row.id, top: row.top }).toEqual({ id: row.id, top: HEADER + row.id * ROW });
      // And every row the viewport crosses is one of the rows drawn.
      const showing = state.timelines
        .filter((tl) => overlaps(HEADER + tl.id * ROW, HEADER + tl.id * ROW + ROW, y, y + PHONE.height))
        .map((tl) => tl.id);
      expect(showing.length).toBeGreaterThan(0);
      expect(rows.map((r) => r.id)).toEqual(expect.arrayContaining(showing));
    }
    view.unmount();
  });

  it('mounts every board the viewport covers, and not many more', () => {
    const state = staggeredMultiverse(200, 6);
    const view = laidOut(state, PHONE);
    const total = boardCount(state);
    for (const [x, y] of positions) {
      view.scrollTo(x, y);
      const mounted = new Set(view.boards().map((b) => `${b.timeline}:${b.turn}`));
      // The boards that are on screen, worked out from the state's own
      // timelines rather than from the window arithmetic under test.
      const showing: string[] = [];
      for (const tl of state.timelines) {
        for (let i = 0; i < tl.boards.length; i++) {
          const r = boardRect(tl, i);
          if (overlaps(r.left, r.right, x, x + PHONE.width) && overlaps(r.top, r.bottom, y, y + PHONE.height)) {
            showing.push(`${tl.id}:${r.turn}`);
          }
        }
      }
      expect(showing.length).toBeGreaterThan(0);
      for (const board of showing) expect(mounted.has(board)).toBe(true);
      // Still a window: a screenful and its overscan, not the multiverse.
      expect(mounted.size * 4).toBeLessThan(total);
    }
    view.unmount();
  });

  it('draws a branch line that crosses the window, not only one that ends in it', () => {
    // A line runs from the row a timeline came from down to its own, so it
    // can cross the screen with neither end on it. Windowing the lines with
    // the rows dropped 23 of the 29 lines at the top of a 30-timeline game.
    const state = wideMultiverse(30);
    const view = laidOut(state, PHONE);
    let deepest = 0;
    for (const y of [0, 400, 800, 1200, 1600]) {
      view.scrollTo(0, y);
      const crossing = state.timelines.filter(
        (tl) =>
          tl.branchedFrom &&
          overlaps(
            HEADER + tl.branchedFrom.timeline * ROW + SLOT_TOP + MINI_HEIGHT,
            HEADER + tl.id * ROW + SLOT_TOP,
            y,
            y + PHONE.height,
          ),
      );
      expect(crossing.length).toBeGreaterThan(0);
      expect(view.links()).toBeGreaterThanOrEqual(crossing.length);
      deepest = Math.max(deepest, crossing.length);
    }
    // The top of the map is where most of them cross, and where all but six
    // of the twenty-nine used to be missing.
    expect(deepest).toBeGreaterThan(20);
    view.unmount();
  });

  it('still bounds how many branch lines it draws', () => {
    // Every timeline in this state branched off the first one, so every line
    // crosses the top of the map: the fix above must not become a view per
    // timeline again.
    const state = wideMultiverse(2000);
    const view = laidOut(state, PHONE);
    view.scrollTo(0, 0);
    expect(view.links()).toBeGreaterThan(20);
    expect(view.links() * 4).toBeLessThan(state.timelines.length);
    view.unmount();
  });
});

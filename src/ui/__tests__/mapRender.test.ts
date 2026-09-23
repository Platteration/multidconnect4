/**
 * The map as it is actually mounted, with the real thumbnails in it.
 * `map.test.ts` covers the arithmetic of the window and the places things are
 * put; this covers the focus - the board the screen is pointing the map at -
 * which nothing tested at all: the map could stop following it entirely with
 * the whole suite staying green.
 *
 * The sibling game's map-render test, against this app's map. The window here
 * is kept as the row and turn in the corner rather than as a band of pixels,
 * so what a stale one means is different, but the two properties are the
 * same: the focused board is mounted, and it stays mounted when the state
 * changes shape under a scroll position that no longer means anything.
 *
 * The map pulls in the thumbnails, which pull in the theme and with it the
 * storage the app keeps its settings in. None of that is under test here.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));

import React from 'react';
import { Animated, ScrollView } from 'react-native';
import TestRenderer, { ReactTestInstance, ReactTestRenderer, act } from 'react-test-renderer';
import { Action, BoardRef, GameState, Timeline, applyAction, getTimeline, latestBoard, newGame, timelineLabel } from '../../engine';
import { MAP_LAYOUT, MultiverseMap } from '../MultiverseMap';

const { HEADER, ROW, SLOT } = MAP_LAYOUT;

declare const require: (name: string) => { readFileSync(path: string, encoding: string): string };
declare const __dirname: string;
const source = (file: string): string => require('fs').readFileSync(`${__dirname}/../${file}`, 'utf8');

/** A phone-sized map pane. */
const VIEWPORT = { width: 380, height: 260 };

/**
 * A multiverse of a given size. Nothing here has to be played: the map draws
 * from the counts and the boards, and every board of a real game is shared by
 * reference anyway.
 */
function multiverse(timelines: number, boardsEach: number): GameState {
  const start = newGame();
  const board = latestBoard(getTimeline(start, 0));
  const rows: Timeline[] = Array.from({ length: timelines }, (_, id) => ({
    id,
    startTurn: 0,
    boards: new Array(boardsEach).fill(board),
    createdBy: id === 0 ? null : ((id % 2) as 0 | 1),
    branchedFrom: id === 0 ? null : { timeline: id - 1, turn: 0 },
    origin: id === 0 ? null : { timeline: id - 1, turn: 0 },
  }));
  return { ...start, timelines: rows };
}

const mapElement = (state: GameState, focus: BoardRef, reduceMotion = false) =>
  React.createElement(MultiverseMap, { state, focus, targets: [], origin: null, onPressBoard: () => {}, reduceMotion });

const render = (state: GameState, focus: BoardRef, reduceMotion = false): ReactTestRenderer => {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(mapElement(state, focus, reduceMotion));
  });
  return tree;
};

const scrollViews = (tree: ReactTestRenderer): ReactTestInstance[] => tree.root.findAllByType(ScrollView);

const layout = (tree: ReactTestRenderer, size: { width: number; height: number }) =>
  act(() => {
    (scrollViews(tree)[0]!.props.onLayout as (e: unknown) => void)({ nativeEvent: { layout: { ...size, x: 0, y: 0 } } });
  });

/** The scroll the focus effect's scrollTo would produce, delivered by hand. */
const scrollTo = (tree: ReactTestRenderer, to: { x: number; y: number }) =>
  act(() => {
    const [horizontal, vertical] = scrollViews(tree);
    (horizontal!.props.onScroll as (e: unknown) => void)({ nativeEvent: { contentOffset: { x: to.x, y: 0 } } });
    (vertical!.props.onScroll as (e: unknown) => void)({ nativeEvent: { contentOffset: { x: 0, y: to.y } } });
  });

/** The host views of the tree: one node per thing on screen, composites aside. */
const hosts = (tree: ReactTestRenderer): ReactTestInstance[] => tree.root.findAll((node) => typeof node.type === 'string');

/** Every board actually mounted, by the label the map gives it. */
const drawn = (tree: ReactTestRenderer): string[] =>
  hosts(tree)
    .map((node) => node.props.accessibilityLabel)
    .filter((label): label is string => typeof label === 'string' && / turn \d+,/.test(label));

const labelFor = (ref: BoardRef) => `${timelineLabel(ref.timeline)} turn ${ref.turn}`;
const isDrawn = (tree: ReactTestRenderer, ref: BoardRef) => drawn(tree).some((label) => label.startsWith(labelFor(ref)));

/** Where the focus effect scrolls to for this board. */
const focusOffset = (ref: BoardRef) => ({
  x: Math.max(0, (ref.turn + 1) * SLOT + SLOT / 2 - VIEWPORT.width / 2),
  y: Math.max(0, ref.timeline * ROW + ROW / 2 - VIEWPORT.height / 2),
});

describe('what the map mounts', () => {
  it('draws a screenful of a big multiverse, and keeps room for the rest', () => {
    // 90 timelines of 60 boards is 5,400 thumbnails of some fifty views each,
    // and the map has to skip them in both directions: the rows outside the
    // viewport and, inside the rows it does draw, the turns outside it. The
    // bound is the screen and not either guard - what fits on a 380x260 pane
    // is its own width and height in slots and rows, plus the overscan either
    // side.
    const state = multiverse(90, 60);
    const tree = render(state, { timeline: 0, turn: 0 });
    layout(tree, VIEWPORT);
    const roomFor = Math.ceil(VIEWPORT.width / SLOT + 6) * Math.ceil(VIEWPORT.height / ROW + 6);
    expect(roomFor).toBeLessThan(5400 / 40);
    expect(drawn(tree).length).toBeGreaterThan(0);
    expect(drawn(tree).length).toBeLessThanOrEqual(roomFor);

    // The rows it leaves out still take up their room: the boards are placed
    // at their own timeline's offset, so the scrollable content has to be as
    // tall as every timeline whether or not its row was drawn. Sized from the
    // window instead, the scroll position would stop matching where the
    // boards are and the map would draw the wrong part of itself.
    const tall = hosts(tree).filter((node) => {
      const style = node.props.style as { height?: number } | undefined;
      return !!style && style.height === HEADER + state.timelines.length * ROW;
    });
    expect(tall).toHaveLength(1);
    act(() => tree.unmount());
  });

  it('follows the focus, and redraws from it when the scroll position stops meaning anything', () => {
    // The player jumps to a board deep in the multiverse; the map scrolls
    // there and the window has to follow, or they are looking at an empty
    // region.
    const focus: BoardRef = { timeline: 80, turn: 9 };
    const tree = render(multiverse(90, 14), focus);
    layout(tree, VIEWPORT);
    scrollTo(tree, focusOffset(focus));
    expect(isDrawn(tree, focus)).toBe(true);
    // And the far corner it came from is no longer mounted.
    expect(isDrawn(tree, { timeline: 0, turn: 0 })).toBe(false);

    // Menu -> New game with the map still scrolled down there: the content
    // shrinks to one timeline under a scroll position deep in the old one.
    // Every platform clamps an over-scrolled offset and reports it, but the
    // one path that does not report it would leave a blank map that
    // scrolling could not fix.
    act(() => {
      tree.update(mapElement(multiverse(1, 3), { timeline: 0, turn: 0 }));
    });
    expect(isDrawn(tree, { timeline: 0, turn: 0 })).toBe(true);
    act(() => tree.unmount());
  });

  it('draws around the focus while nothing has been measured', () => {
    // A map that has not been laid out has had no scroll event either, so the
    // corner it holds is (0, 0) whatever the screen is pointing it at. It used
    // to draw that corner - and skip the scroll that would have moved it, for
    // want of a viewport to centre in - so a restored game focused deep in the
    // multiverse showed an empty region for as long as that layout lasted.
    const focus: BoardRef = { timeline: 80, turn: 9 };
    const tree = render(multiverse(90, 14), focus);
    expect(isDrawn(tree, focus)).toBe(true);
    // A layout that reports no width leaves it in the same place.
    layout(tree, { width: 0, height: 260 });
    expect(isDrawn(tree, focus)).toBe(true);
    act(() => tree.unmount());
  });
});

/**
 * Less motion. The setting has one behaviour on this screen and one on the
 * map - the flight a travelling disc makes across it, and whether the scroll
 * to the focused board is animated - and neither was tested at all: the prop,
 * the flight's guard and the `animated` flag could each be deleted with the
 * whole suite green, and the setting would have gone on saving and restoring
 * while doing nothing.
 */
describe('less motion', () => {
  const drop = (col: number): Action => ({ type: 'drop', timeline: 0, col });
  /** A state whose last action is a time travel: the one thing the map animates. */
  const travelled = (() => {
    const played = [drop(0), drop(1), drop(2), drop(3)].reduce((s, a) => applyAction(s, a), newGame());
    return applyAction(played, { type: 'travel', from: { timeline: 0, row: 0, col: 0 }, to: { timeline: 0, turn: 0 }, col: 6 });
  })();
  const focus: BoardRef = { timeline: 1, turn: 1 };

  let timing: jest.SpyInstance;
  let scrollSpy: jest.SpyInstance;
  beforeEach(() => {
    timing = jest.spyOn(Animated, 'timing');
    // The scroller is a host component with no native side under the test
    // renderer; what matters is what the map asks it for.
    scrollSpy = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {});
  });
  afterEach(() => {
    timing.mockRestore();
    scrollSpy.mockRestore();
  });

  it('flies the travelling disc across the map, and animates the scroll', () => {
    const tree = render(travelled, focus);
    layout(tree, VIEWPORT);
    expect(travelled.lastAction?.type).toBe('travel');
    expect(timing).toHaveBeenCalled();
    expect(scrollSpy.mock.calls.flat()).toContainEqual({ x: focusOffset(focus).x, animated: true });
    expect(scrollSpy.mock.calls.flat()).toContainEqual({ y: focusOffset(focus).y, animated: true });
    act(() => tree.unmount());
  });

  it('holds the flight still and jumps the scroll when less motion is asked for', () => {
    const tree = render(travelled, focus, true);
    layout(tree, VIEWPORT);
    // Not one animation started - the flight is the only thing the map moves.
    expect(timing).not.toHaveBeenCalled();
    // The board still ends up in view; it just gets there at once.
    expect(scrollSpy.mock.calls.flat()).toContainEqual({ x: focusOffset(focus).x, animated: false });
    expect(scrollSpy.mock.calls.flat()).toContainEqual({ y: focusOffset(focus).y, animated: false });
    expect(isDrawn(tree, focus)).toBe(true);
    act(() => tree.unmount());
  });

  it('is the setting the screen resolves, handed to the map', () => {
    // Declared locally because this project's tests read files this way.
    const src = source('GameScreen.tsx');
    expect(src).toMatch(/const reduceMotion = useReduceMotion\(settings\.reduceMotion\);/);
    expect(src).toMatch(/<MultiverseMap [^>]*reduceMotion=\{reduceMotion\}/);
  });
});

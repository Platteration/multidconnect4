import React, { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import { Animated, Easing, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  BoardRef,
  GameState,
  latestTurn,
  mandatoryTimelines,
  maxTurn,
  playerToMoveAt,
  sameRef,
  timelineLabel,
} from '../engine';
import { MINI_HEIGHT, MINI_WIDTH, MiniBoard } from './MiniBoard';
import { Theme, spacing } from './theme';
import { useTheme } from '../app/theme';

const SLOT = MINI_WIDTH + 10;
const ROW = MINI_HEIGHT + 16;
/** Height of the turn-number header above the first row. */
const HEADER = 18;
/** The gap between the top of a row and the thumbnail sitting in it. */
const SLOT_TOP = 8;
/** Rows and turns drawn past each edge of the viewport, so a scroll never tears. */
const OVERSCAN = 2;
/**
 * How many branch lines may be drawn at once. A line spans from the row it
 * branched off to its own, so unlike a thumbnail it is not tied to one row
 * and a state can put one across the window per timeline; this keeps that
 * bounded the way the rows themselves are.
 */
const MAX_LINKS = 120;
/**
 * Where the map puts things. Exported so a test can measure the map against
 * the arithmetic it claims, rather than against the arithmetic it uses: a row
 * is positioned by its timeline's id while the window is chosen by index, and
 * the two agree only because ids are dense (see the engine's own test).
 */
export const MAP_LAYOUT = { HEADER, ROW, SLOT, SLOT_TOP } as const;
/**
 * The viewport assumed for the very first render, before the map has been
 * laid out. Bigger than the map is on any phone, so nothing is missing from
 * that frame, and still a fixed size rather than the whole multiverse.
 */
const UNMEASURED = { width: 1024, height: 1024 };

interface Props {
  state: GameState;
  focus: BoardRef;
  /** Boards a picked-up disc may travel to. Empty when no disc is held. */
  targets: readonly BoardRef[];
  /** The board the held disc comes from, if any. */
  origin: BoardRef | null;
  onPressBoard: (ref: BoardRef) => void;
}

/**
 * The map of every timeline. Time runs left to right (one slot per turn) and
 * each timeline is a row, starting at the turn where it branched off.
 */
export function MultiverseMap({ state, focus, targets, origin, onPressBoard }: Props) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const lastTurn = maxTurn(state);
  const width = (lastTurn + 2) * SLOT;
  const holding = origin !== null;
  const mandatoryIds = useMemo(() => new Set(mandatoryTimelines(state).map((t) => t.id)), [state]);
  const horizontal = useRef<ScrollView>(null);
  const vertical = useRef<ScrollView>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  // Which row and which turn sit at the top-left corner. Kept as indices, not
  // as pixel offsets, so a scroll re-renders the map when it crosses into the
  // next board rather than on every frame.
  const [corner, setCorner] = useState({ row: 0, turn: 0 });

  // Only the boards near the corner are mounted. Every board that has ever
  // existed is a thumbnail of rows x cols views, and how many boards exist is
  // decided by the game code that built the state - so a map that drew them
  // all would mount as many native views as whoever sent the code chose.
  const viewWidth = viewport.width || UNMEASURED.width;
  const viewHeight = viewport.height || UNMEASURED.height;
  // An undo can take away the timeline or the turns being looked at, and the
  // scroller only tells us where it ended up afterwards, so the corner is
  // clamped here rather than trusted.
  const topRow = Math.min(corner.row, Math.max(0, state.timelines.length - 1));
  const leftTurn = Math.min(corner.turn, lastTurn + 1);
  const firstRow = Math.max(0, topRow - OVERSCAN);
  const rows = state.timelines.slice(firstRow, topRow + Math.ceil(viewHeight / ROW) + OVERSCAN + 1);
  const lastRow = firstRow + rows.length - 1;
  // A board for turn t is drawn at (t + 1) * SLOT, one slot in from the left.
  const firstTurn = Math.max(0, leftTurn - 1 - OVERSCAN);
  const finalTurn = Math.min(lastTurn, leftTurn + Math.ceil(viewWidth / SLOT) + OVERSCAN);
  const onScrollX = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const turn = Math.max(0, Math.floor(e.nativeEvent.contentOffset.x / SLOT));
    setCorner((c) => (c.turn === turn ? c : { ...c, turn }));
  };
  const onScrollY = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const row = Math.max(0, Math.floor(e.nativeEvent.contentOffset.y / ROW));
    setCorner((c) => (c.row === row ? c : { ...c, row }));
  };

  // A branch line runs from the row it came from down to its own, so it can
  // cross the window with neither end inside it - which windowing the lines
  // by row membership, the way the thumbnails are windowed, drops. They are
  // selected by whether the line itself crosses the window instead, and kept
  // bounded by drawing the ones that end inside it first.
  const links = useMemo(() => {
    const crossing = state.timelines.filter(
      (tl) => tl.branchedFrom && tl.id >= firstRow && tl.branchedFrom.timeline <= lastRow,
    );
    if (crossing.length <= MAX_LINKS) return crossing;
    const ending = crossing.filter((tl) => tl.id <= lastRow);
    return [...ending, ...crossing.filter((tl) => tl.id > lastRow)].slice(0, MAX_LINKS);
  }, [state.timelines, firstRow, lastRow]);

  // One press callback for every thumbnail, for the life of the map. The map
  // re-renders on every focus, selection, animation and layout change; handing
  // each MiniBoard a fresh closure defeated its React.memo and rebuilt every
  // cell view of every board that has ever existed on each of those renders.
  const latestPress = useRef(onPressBoard);
  latestPress.current = onPressBoard;
  const press = useCallback((ref: BoardRef) => latestPress.current(ref), []);

  // A time travel: fly a token from the board the piece left to the board it created.
  const flight = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const flightOpacity = useRef(new Animated.Value(0)).current;
  const travel = state.lastAction?.type === 'travel' && state.lastCreated.length === 2 ? state.lastAction : null;
  const flightKey = travel ? `${state.timelines.length}-${state.lastCreated[1].timeline}-${state.lastCreated[1].turn}` : null;
  useEffect(() => {
    if (!travel) return;
    const from = travel.from.timeline;
    const fromTurn = state.lastCreated[0].turn - 1;
    const to = state.lastCreated[1];
    const start = { x: (fromTurn + 1) * SLOT + MINI_WIDTH / 2, y: HEADER + from * ROW + SLOT_TOP + MINI_HEIGHT / 2 };
    const end = { x: (to.turn + 1) * SLOT + MINI_WIDTH / 2, y: HEADER + to.timeline * ROW + SLOT_TOP + MINI_HEIGHT / 2 };
    flight.setValue(start);
    flightOpacity.setValue(1);
    Animated.sequence([
      Animated.timing(flight, { toValue: end, duration: 650, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      Animated.timing(flightOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flightKey]);
  const travellerColor = travel ? colors.players[playerToMoveAt(state.lastCreated[0].turn - 1)] : colors.travel;

  // Keep the focused board in view as the player jumps around the multiverse.
  useEffect(() => {
    if (!viewport.width) return;
    const x = (focus.turn + 1) * SLOT + SLOT / 2 - viewport.width / 2;
    horizontal.current?.scrollTo({ x: Math.max(0, x), animated: true });
    const y = focus.timeline * ROW + ROW / 2 - viewport.height / 2;
    vertical.current?.scrollTo({ y: Math.max(0, y), animated: true });
  }, [focus.timeline, focus.turn, viewport]);

  return (
    <ScrollView
      ref={horizontal}
      horizontal
      showsHorizontalScrollIndicator
      style={styles.outer}
      contentContainerStyle={{ minWidth: '100%' }}
      onScroll={onScrollX}
      scrollEventThrottle={32}
      onLayout={(e) => setViewport({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      <ScrollView
        ref={vertical}
        nestedScrollEnabled
        showsVerticalScrollIndicator
        onScroll={onScrollY}
        scrollEventThrottle={32}
        contentContainerStyle={{ width, paddingBottom: spacing.md }}
      >
        {/* The rows are placed rather than stacked, so the ones outside the
            window can be left out without moving the ones that are drawn. */}
        <View style={{ width, height: HEADER + state.timelines.length * ROW, position: 'relative' }}>
        <View style={[styles.turnRow, { width }]}>
          {Array.from({ length: Math.max(0, finalTurn - firstTurn + 1) }, (_, i) => {
            const turn = firstTurn + i;
            return (
              <Text
                key={turn}
                style={[
                  styles.turnLabel,
                  { left: (turn + 1) * SLOT, width: SLOT, color: colors.players[playerToMoveAt(turn)] },
                ]}
              >
                t{turn}
              </Text>
            );
          })}
        </View>
        {links.map((tl) => {
          if (!tl.branchedFrom) return null;
          // A line from the bottom of the board this timeline branched from down to its label.
          const x = (tl.branchedFrom.turn + 1) * SLOT + MINI_WIDTH / 2;
          const top = HEADER + tl.branchedFrom.timeline * ROW + SLOT_TOP + MINI_HEIGHT;
          const bottom = HEADER + tl.id * ROW + SLOT_TOP;
          const color = tl.createdBy === null ? colors.textMuted : colors.players[tl.createdBy];
          return (
            <View key={`link-${tl.id}`} pointerEvents="none" style={[styles.link, { left: x - 1, top, height: Math.max(0, bottom - top), backgroundColor: color }]} />
          );
        })}
        {rows.map((tl) => {
          const labelColor = tl.createdBy === null ? colors.textMuted : colors.players[tl.createdBy];
          // The boards of this row that fall inside the window of turns.
          const from = Math.max(0, firstTurn - tl.startTurn);
          const until = Math.max(from, Math.min(tl.boards.length, finalTurn - tl.startTurn + 1));
          return (
            <View key={tl.id} style={[styles.timelineRow, { width, top: HEADER + tl.id * ROW }]}>
              <View style={[styles.label, { left: tl.startTurn * SLOT, borderColor: labelColor }]}>
                <Text style={[styles.labelText, { color: labelColor }]}>T{tl.id + 1}</Text>
                {tl.branchedFrom ? (
                  <Text style={styles.labelSub}>
                    ↰ T{tl.branchedFrom.timeline + 1} t{tl.branchedFrom.turn}
                  </Text>
                ) : (
                  <Text style={styles.labelSub}>start</Text>
                )}
              </View>
              {tl.boards.slice(from, until).map((board, i) => {
                const turn = tl.startTurn + from + i;
                const ref: BoardRef = { timeline: tl.id, turn };
                const isLatest = turn === latestTurn(tl);
                const isPending =
                  state.status === 'playing' && isLatest && playerToMoveAt(turn) === state.toMove && !boardIsFull(board.cells);
                const isTarget = targets.some((t) => sameRef(t, ref));
                const isFocus = sameRef(focus, ref);
                const isWin = !!state.win && sameRef(state.win.board, ref);
                const isNew = !holding && state.lastCreated.some((r) => sameRef(r, ref));
                const isOrigin = sameRef(origin, ref);

                let ring: string | null = null;
                let badge: string | null = null;
                if (isWin) {
                  ring = colors.success;
                  badge = 'WIN';
                } else if (isTarget) {
                  ring = colors.travel;
                  badge = 'GO';
                } else if (isPending) {
                  ring = colors.players[state.toMove];
                  badge = holding ? null : mandatoryIds.has(tl.id) ? 'play' : 'later';
                } else if (isNew) {
                  badge = 'new';
                }
                if (isFocus) ring = colors.focus;
                const dim = holding && !isTarget && !isOrigin && !isFocus;

                return (
                  <View key={turn} style={[styles.slot, { left: (turn + 1) * SLOT }]}>
                    <MiniBoard
                      board={board}
                      ring={ring}
                      badge={badge}
                      dim={dim}
                      timeline={tl.id}
                      turn={turn}
                      onPress={press}
                      accessibilityLabel={`${timelineLabel(tl.id)} turn ${turn}, ${colors.playerNames[playerToMoveAt(turn)]} to move${isPending ? ', waiting' : ''}${isTarget ? ', travel target' : ''}`}
                    />
                  </View>
                );
              })}
            </View>
          );
        })}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.flyer,
            { backgroundColor: travellerColor, opacity: flightOpacity, transform: [{ translateX: flight.x }, { translateY: flight.y }] },
          ]}
        />
        </View>
      </ScrollView>
    </ScrollView>
  );
}

function boardIsFull(cells: readonly (0 | 1 | null)[]): boolean {
  return cells.every((c) => c !== null);
}

const makeStyles = (colors: Theme) =>
  StyleSheet.create({
  outer: { flex: 1 },
  turnRow: { height: 18, position: 'relative' },
  turnLabel: {
    position: 'absolute',
    top: 2,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    opacity: 0.85,
  },
  timelineRow: { position: 'absolute', left: 0, height: ROW },
  label: {
    position: 'absolute',
    top: SLOT_TOP,
    width: SLOT - 10,
    height: MINI_HEIGHT,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.panel,
  },
  labelText: { fontSize: 13, fontWeight: '800' },
  labelSub: { fontSize: 8, color: colors.textMuted, marginTop: 2 },
  slot: { position: 'absolute', top: SLOT_TOP },
  link: { position: 'absolute', width: 2, opacity: 0.55, borderRadius: 1 },
  flyer: {
    position: 'absolute',
    left: -9,
    top: -9,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#ffffff',
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
});

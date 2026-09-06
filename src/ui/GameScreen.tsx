import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  MAX_SIDE,
  PLAYER_NAMES,
  Spin,
  getBoard,
  getTimeline,
  isPending,
  latestRef,
  otherPlayer,
  pendingTimelines,
  playerToMoveAt,
  timelineLabel,
} from '../engine';
import { DiscBoard } from './DiscBoard';
import { Button, GameOverModal, RulesModal } from './Modals';
import { MultiverseMap } from './MultiverseMap';
import { colors, playerColor, radius, spacing } from './theme';
import { useGame } from './useGame';

export function GameScreen() {
  const game = useGame();
  const { state, focus, selection, targets } = game;
  const { width, height } = useWindowDimensions();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [gameOverDismissed, setGameOverDismissed] = useState(false);

  useEffect(() => {
    if (state.status === 'playing') setGameOverDismissed(false);
  }, [state.status]);

  // Size cells so the board fits in either orientation (7 wide or 7 tall).
  const cellSize = useMemo(() => {
    const byWidth = Math.floor((width - spacing.lg * 2) / MAX_SIDE);
    const byHeight = Math.floor((height * 0.36) / MAX_SIDE);
    return Math.max(26, Math.min(56, byWidth, byHeight));
  }, [width, height]);

  // Spinning: turn the board view a quarter turn, then swap in the spun board.
  const spinAnim = useRef(new Animated.Value(0)).current;
  const [spinning, setSpinning] = useState(false);
  const rotation = spinAnim.interpolate({ inputRange: [-1, 1], outputRange: ['-90deg', '90deg'] });
  // Shrink a little mid-turn so the board's corners stay clear of the text around it.
  const shrink = spinAnim.interpolate({ inputRange: [-1, -0.5, 0, 0.5, 1], outputRange: [1, 0.8, 1, 0.8, 1] });
  const startSpin = (direction: Spin) => {
    if (spinning || !game.canSpin) return;
    setSpinning(true);
    Animated.timing(spinAnim, {
      toValue: direction === 'cw' ? 1 : -1,
      duration: 380,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      game.spin(direction);
      spinAnim.setValue(0);
      setSpinning(false);
    });
  };

  const board = getBoard(state, focus) ?? state.timelines[0].boards[0];
  const timeline = getTimeline(state, focus.timeline);
  const focusIsPending = isPending(state, focus);
  const pending = pendingTimelines(state);
  const totalWaiting = pending.length;
  const mover = state.toMove;

  const origin = selection.kind === 'none' ? null : latestRef(getTimeline(state, selection.from.timeline));
  const landingHere = selection.kind === 'target' && selection.to.timeline === focus.timeline && selection.to.turn === focus.turn;
  const selectedDisc =
    selection.kind !== 'none' && selection.from.timeline === focus.timeline && focusIsPending
      ? { row: selection.from.row, col: selection.from.col }
      : null;

  const status =
    state.status === 'won' && state.win
      ? `${PLAYER_NAMES[state.win.player]} wins!`
      : state.status === 'draw'
        ? 'Draw - every board is full'
        : `${PLAYER_NAMES[mover]} to move · ${totalWaiting} board${totalWaiting === 1 ? '' : 's'} waiting`;

  let boardTitle = `${timelineLabel(focus.timeline)} · turn ${focus.turn}`;
  if (focusIsPending) boardTitle += ' · now';
  else if (focus.turn === latestRef(timeline).turn) boardTitle += ' · finished';
  else boardTitle += ` · past (${PLAYER_NAMES[playerToMoveAt(focus.turn)]} was to move)`;

  let hint: string;
  if (state.status !== 'playing') {
    hint = 'Game over. Tap any board on the map to look around, or start a new game.';
  } else if (selection.kind === 'target') {
    hint = landingHere
      ? 'Tap a column on this past board. A new timeline will branch off from here.'
      : 'Go back to the highlighted board to drop the disc, or cancel.';
  } else if (selection.kind === 'disc') {
    hint =
      targets.length > 0
        ? 'Disc picked up. Tap a glowing board on the map to send it there.'
        : 'No past board can take this disc yet. Play a few more turns first.';
  } else if (focusIsPending) {
    hint = board.spun
      ? 'Freshly spun. Tap a column to drop a disc, or tap one of your discs to send it into the past.'
      : 'Tap a column to drop a disc, spin the board, or tap one of your discs to send it into the past.';
  } else {
    hint = 'This board is history. Only time travel can change it.';
  }

  const winCells = state.win && state.win.board.timeline === focus.timeline && state.win.board.turn === focus.turn ? state.win.cells : undefined;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>
            5D Connect Four
          </Text>
          <Text style={styles.subtitle}>with multiverse time travel</Text>
        </View>
        <Button label="Undo" small onPress={game.undo} disabled={!game.canUndo} />
        <View style={{ width: spacing.xs }} />
        <Button label="Rules" small onPress={() => setRulesOpen(true)} />
        <View style={{ width: spacing.xs }} />
        <Button label="New" small tone="danger" onPress={game.restart} />
      </View>

      <View style={[styles.statusPill, { borderColor: state.win ? playerColor(state.win.player) : playerColor(mover) }]}>
        <View style={[styles.dot, { backgroundColor: state.win ? playerColor(state.win.player) : playerColor(mover) }]} />
        <Text style={styles.statusText}>{status}</Text>
      </View>

      <Text style={styles.boardTitle}>{boardTitle}</Text>
      <View style={{ height: cellSize * MAX_SIDE + 8, justifyContent: 'center' }}>
        <Animated.View style={{ transform: [{ rotate: rotation }, { scale: shrink }] }}>
          <DiscBoard
            board={board}
            cellSize={cellSize}
            interactive={!spinning && state.status === 'playing' && (focusIsPending || landingHere)}
            selected={selectedDisc}
            highlight={winCells}
            ghostPlayer={state.status === 'playing' && (focusIsPending || landingHere) && selection.kind !== 'disc' ? mover : null}
            onPressCell={game.pressCell}
          />
        </Animated.View>
      </View>
      {state.status === 'playing' && focusIsPending && selection.kind === 'none' ? (
        <View style={styles.spinRow}>
          <Button label="↺  Spin left" small onPress={() => startSpin('ccw')} disabled={!game.canSpin || spinning} />
          <View style={{ width: spacing.md }} />
          <Button label="Spin right  ↻" small onPress={() => startSpin('cw')} disabled={!game.canSpin || spinning} />
        </View>
      ) : null}

      <View style={styles.hintRow}>
        <Text style={[styles.hint, game.error ? { color: colors.danger } : null]} numberOfLines={3}>
          {game.error ?? hint}
        </Text>
        {selection.kind !== 'none' ? (
          <Button label="Cancel" small onPress={game.cancel} />
        ) : !focusIsPending && state.status === 'playing' ? (
          <Button label="Go play" small tone="primary" onPress={game.goToWaitingBoard} />
        ) : null}
      </View>

      <View style={styles.mapHeader}>
        <Text style={styles.mapTitle}>Multiverse</Text>
        <Text style={styles.mapLegend}>
          {state.status !== 'playing' ? null : selection.kind === 'none' ? (
            <>
              <Text style={{ color: playerColor(mover) }}>■</Text> waiting for {PLAYER_NAMES[mover]}
              {'   '}
              <Text style={{ color: playerColor(otherPlayer(mover)) }}>t</Text> = {PLAYER_NAMES[otherPlayer(mover)]}'s turns
            </>
          ) : (
            <>
              <Text style={{ color: colors.travel }}>■</Text> can travel here
            </>
          )}
        </Text>
      </View>
      <View style={styles.map}>
        <MultiverseMap state={state} focus={focus} targets={targets} origin={origin} onPressBoard={game.focusBoard} />
      </View>

      <RulesModal visible={rulesOpen} onClose={() => setRulesOpen(false)} />
      <GameOverModal
        state={state}
        visible={state.status !== 'playing' && !gameOverDismissed}
        onRestart={game.restart}
        onDismiss={() => setGameOverDismissed(true)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '900', letterSpacing: 0.3 },
  subtitle: { color: colors.textMuted, fontSize: 11 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginVertical: spacing.xs,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    backgroundColor: colors.panel,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  statusText: { color: colors.text, fontWeight: '700', fontSize: 14 },
  boardTitle: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginBottom: spacing.xs },
  spinRow: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.sm },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 52,
  },
  hint: { flex: 1, color: colors.textMuted, fontSize: 13, lineHeight: 18, marginRight: spacing.sm },
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  mapTitle: { color: colors.text, fontWeight: '800', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 },
  mapLegend: { color: colors.textMuted, fontSize: 11 },
  map: {
    flex: 1,
    marginHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    overflow: 'hidden',
  },
});

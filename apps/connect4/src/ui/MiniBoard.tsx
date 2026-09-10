import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Board, MAX_SIDE, index } from '../engine';
import { Theme } from './theme';
import { useTheme } from '../app/theme';

export const MINI_CELL = 7;
/** Thumbnails are square so a spun board takes the same slot as an upright one. */
export const MINI_WIDTH = MAX_SIDE * MINI_CELL + 8;
export const MINI_HEIGHT = MAX_SIDE * MINI_CELL + 8;

interface Props {
  board: Board;
  /** Border colour to signal state: pending, travel target, focused, etc. */
  ring?: string | null;
  dim?: boolean;
  badge?: string | null;
  onPress?: () => void;
  accessibilityLabel?: string;
}

/** A thumbnail of one board, used in the multiverse map. */
export const MiniBoard = React.memo(function MiniBoard({ board, ring, dim, badge, onPress, accessibilityLabel }: Props) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const rows: React.ReactNode[] = [];
  for (let r = board.rows - 1; r >= 0; r--) {
    const cells: React.ReactNode[] = [];
    for (let c = 0; c < board.cols; c++) {
      const v = board.cells[index(board, r, c)];
      cells.push(
        <View
          key={c}
          style={[styles.cell, v !== null && { backgroundColor: colors.players[v] }]}
        />,
      );
    }
    rows.push(
      <View key={r} style={styles.row}>
        {cells}
      </View>,
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
      style={({ pressed }) => [
        styles.board,
        ring ? { borderColor: ring } : null,
        dim ? { opacity: 0.45 } : null,
        pressed ? { transform: [{ scale: 0.94 }] } : null,
      ]}
    >
      <View style={styles.grid}>{rows}</View>
      {badge ? (
        <View style={[styles.badge, ring ? { backgroundColor: ring } : null]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
});

const makeStyles = (colors: Theme) =>
  StyleSheet.create({
  board: {
    width: MINI_WIDTH,
    height: MINI_HEIGHT,
    padding: 2,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.boardDark,
    backgroundColor: colors.board,
  },
  grid: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row' },
  cell: {
    width: MINI_CELL,
    height: MINI_CELL,
    borderRadius: MINI_CELL / 2,
    backgroundColor: colors.hole,
    margin: 0,
    transform: [{ scale: 0.8 }],
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -6,
    paddingHorizontal: 4,
    borderRadius: 6,
    backgroundColor: colors.panelRaised,
  },
  badgeText: { color: colors.background, fontSize: 8, fontWeight: '800' },
});

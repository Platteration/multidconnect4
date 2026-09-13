import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Board, SIZE, index } from '../engine';
import { Mark } from './Mark';
import { Theme, useTheme } from './theme';

export const MINI_CELL = 14;
export const MINI_WIDTH = SIZE * MINI_CELL + 8;
export const MINI_HEIGHT = SIZE * MINI_CELL + 8;

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
  for (let r = 0; r < SIZE; r++) {
    const cells: React.ReactNode[] = [];
    for (let c = 0; c < SIZE; c++) {
      const v = board.cells[index(r, c)];
      cells.push(
        <View
          key={c}
          style={[
            styles.cell,
            c < SIZE - 1 && { borderRightWidth: 1, borderRightColor: colors.grid },
            r < SIZE - 1 && { borderBottomWidth: 1, borderBottomColor: colors.grid },
          ]}
        >
          {v !== null ? <Mark player={v} size={MINI_CELL - 6} color={colors.players[v]} /> : null}
        </View>,
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
      {rows}
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
      borderColor: colors.border,
      backgroundColor: colors.paper,
    },
    row: { flexDirection: 'row' },
    cell: { width: MINI_CELL, height: MINI_CELL, alignItems: 'center', justifyContent: 'center' },
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

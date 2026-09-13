import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Board, Player, SIZE, cellName, index } from '../engine';
import { Mark } from './Mark';
import { radius, Theme, useTheme } from './theme';

interface Props {
  board: Board;
  cellSize: number;
  /** False while the board is only being looked at. */
  interactive: boolean;
  /** The player's own mark that is picked up, waiting to be sent into the past. */
  selected: number | null;
  /** Cells of the line that won the game. */
  highlight?: readonly number[];
  /** The cell the last action touched on this board. */
  landed?: number | null;
  /** Whose mark a tap would leave, drawn faintly on the empty cells. */
  ghostPlayer: Player | null;
  onPressCell: (cell: number) => void;
}

/** The 3×3 board itself: a grid of cells, each empty or carrying a mark. */
export function MarkBoard({
  board,
  cellSize,
  interactive,
  selected,
  highlight,
  landed,
  ghostPlayer,
  onPressCell,
}: Props) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const rows: React.ReactNode[] = [];
  for (let r = 0; r < SIZE; r++) {
    const cells: React.ReactNode[] = [];
    for (let c = 0; c < SIZE; c++) {
      const cell = index(r, c);
      const v = board.cells[cell];
      const isSelected = selected === cell;
      const won = highlight?.includes(cell);
      cells.push(
        <Pressable
          key={c}
          disabled={!interactive}
          onPress={() => onPressCell(cell)}
          accessibilityRole="button"
          accessibilityLabel={`${cellName(cell)} ${v === null ? 'empty' : colors.playerNames[v]}${isSelected ? ', picked up' : ''}`}
          style={({ pressed }) => [
            styles.cell,
            {
              width: cellSize,
              height: cellSize,
              borderRightWidth: c < SIZE - 1 ? 2 : 0,
              borderBottomWidth: r < SIZE - 1 ? 2 : 0,
            },
            won ? { backgroundColor: colors.success + '33' } : null,
            landed === cell ? { backgroundColor: colors.travel + '22' } : null,
            isSelected ? { backgroundColor: colors.travel + '44' } : null,
            pressed && interactive ? { opacity: 0.7 } : null,
          ]}
        >
          {v !== null ? (
            <Mark player={v} size={cellSize * 0.56} color={colors.players[v]} faded={isSelected} />
          ) : ghostPlayer !== null && interactive ? (
            <Mark player={ghostPlayer} size={cellSize * 0.56} color={colors.players[ghostPlayer]} faded />
          ) : null}
        </Pressable>,
      );
    }
    rows.push(
      <View key={r} style={{ flexDirection: 'row' }}>
        {cells}
      </View>,
    );
  }
  return <View style={styles.board}>{rows}</View>;
}

const makeStyles = (colors: Theme) =>
  StyleSheet.create({
    board: {
      alignSelf: 'center',
      padding: 6,
      borderRadius: radius.lg,
      backgroundColor: colors.paper,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cell: {
      alignItems: 'center',
      justifyContent: 'center',
      borderColor: colors.grid,
    },
  });

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Board, index, type Player } from '../engine';
import { colors, playerColor, radius } from './theme';

interface Props {
  board: Board;
  cellSize: number;
  /** Cells to draw with a highlight ring, e.g. the winning four. */
  highlight?: readonly number[];
  /** A single selected (picked up) disc. */
  selected?: { row: number; col: number } | null;
  /** Player whose discs can be tapped, or null when nothing is tappable. */
  interactive: boolean;
  /** When set, columns show a faint ghost disc in this colour at the landing row. */
  ghostPlayer?: Player | null;
  onPressCell?: (row: number, col: number) => void;
}

/** The big playable board. Its width and height follow the board, which may have been spun. */
export function DiscBoard({ board, cellSize, highlight, selected, interactive, ghostPlayer, onPressCell }: Props) {
  const gap = Math.max(2, Math.round(cellSize * 0.08));
  const disc = cellSize - gap * 2;
  const rows: React.ReactNode[] = [];
  for (let r = board.rows - 1; r >= 0; r--) {
    const cells: React.ReactNode[] = [];
    for (let c = 0; c < board.cols; c++) {
      const value = board.cells[index(board, r, c)];
      const isSelected = !!selected && selected.row === r && selected.col === c;
      const isHighlighted = highlight?.includes(index(board, r, c)) ?? false;
      const isGhost =
        ghostPlayer != null && value === null && (r === 0 || board.cells[index(board, r - 1, c)] !== null);
      cells.push(
        <Pressable
          key={c}
          onPress={onPressCell ? () => onPressCell(r, c) : undefined}
          disabled={!interactive}
          style={{ width: cellSize, height: cellSize, padding: gap }}
          accessibilityRole="button"
          accessibilityLabel={`row ${r + 1} column ${c + 1}${value === null ? ' empty' : value === 0 ? ' red' : ' yellow'}`}
        >
          <View
            style={[
              styles.hole,
              { width: disc, height: disc, borderRadius: disc / 2 },
              value !== null && { backgroundColor: playerColor(value), borderColor: colors.playersDark[value] },
              isGhost && { backgroundColor: playerColor(ghostPlayer!), opacity: 0.14, borderColor: 'transparent' },
              isSelected && styles.selected,
              isHighlighted && styles.highlighted,
            ]}
          />
        </Pressable>,
      );
    }
    rows.push(
      <View key={r} style={styles.row}>
        {cells}
      </View>,
    );
  }
  return <View style={[styles.board, { padding: gap }]}>{rows}</View>;
}

const styles = StyleSheet.create({
  board: {
    backgroundColor: colors.board,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.boardDark,
    alignSelf: 'center',
  },
  row: { flexDirection: 'row' },
  hole: {
    backgroundColor: colors.hole,
    borderWidth: 2,
    borderColor: colors.boardDark,
  },
  selected: {
    borderColor: colors.focus,
    borderWidth: 4,
  },
  highlighted: {
    borderColor: colors.success,
    borderWidth: 4,
  },
});

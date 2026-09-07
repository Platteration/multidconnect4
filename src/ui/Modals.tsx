import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GameState, PLAYER_NAMES, timelineLabel } from '../engine';
import { colors, playerColor, radius, spacing } from './theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  small?: boolean;
}

export function Button({ label, onPress, tone = 'ghost', disabled, small }: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        tone === 'primary' && styles.buttonPrimary,
        tone === 'danger' && styles.buttonDanger,
        disabled && { opacity: 0.35 },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.buttonText, tone === 'primary' && { color: colors.background }]}>{label}</Text>
    </Pressable>
  );
}

interface RulesProps {
  visible: boolean;
  onClose: () => void;
}

export function RulesModal({ visible, onClose }: RulesProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>How to play 5D Connect Four</Text>
          <ScrollView style={{ maxHeight: 420 }}>
            <Rule head="It's Connect Four.">
              Drop discs, get four in a row. Red goes first. Four in a row on any board, in any
              timeline, wins the whole game on the spot.
            </Rule>
            <Rule head="Every move is remembered.">
              Each turn creates a new board. The map at the bottom shows every board that has ever
              existed, left to right through time. Each row is a timeline.
            </Rule>
            <Rule head="You can send a disc into the past.">
              Tap one of your discs on the newest board to pick it up. The map lights up the past
              boards it can travel to: boards where it was also your move. Tap one, then tap a column
              to drop the disc there.
            </Rule>
            <Rule head="That creates a new timeline.">
              The past board doesn't change; instead history branches. A fresh timeline starts from
              that moment with your extra disc in it, and your opponent has to answer there too.
            </Rule>
            <Rule head="Or spin the whole board.">
              Instead of dropping a disc, turn the board a quarter turn. Every disc falls to the
              new bottom, and a board that was tall is now wide. Lines that were blocked open up,
              and stacks turn into rows. A board that was just spun has to see a disc before it can
              be spun again.
            </Rule>
            <Rule head="Pulling a disc out has consequences.">
              Everything stacked above the disc you took falls down one row in the present. Sometimes
              that helps you. Sometimes it hands your opponent four in a row.
            </Rule>
            <Rule head="Play every waiting board.">
              On your turn you must make one move on every board marked "play". Only then does the
              turn pass. More timelines means more to keep track of, for both of you.
            </Rule>
            <Rule head="Variants.">
              In Settings you can turn on "pop out" (pull one of your own discs out of the bottom
              row as a move) and "flip" (turn the board upside down). They apply to the next new game.
            </Rule>
            <Rule head="Full boards are finished.">
              A board with no empty slots just sits there. If every board is full with no winner, the
              game is a draw.
            </Rule>
          </ScrollView>
          <Button label="Got it" tone="primary" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function Rule({ head, children }: { head: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.ruleHead}>{head}</Text>
      <Text style={styles.ruleBody}>{children}</Text>
    </View>
  );
}

interface GameOverProps {
  state: GameState;
  visible: boolean;
  onRestart: () => void;
  onDismiss: () => void;
}

export function GameOverModal({ state, visible, onRestart, onDismiss }: GameOverProps) {
  const win = state.win;
  const headline = win ? `${PLAYER_NAMES[win.player]} wins!` : "It's a draw";
  const detail = win
    ? `Four in a row on ${timelineLabel(win.board.timeline)}, turn ${win.board.turn}.`
    : 'Every board across every timeline is full.';
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={[styles.title, win ? { color: playerColor(win.player) } : null]}>{headline}</Text>
          <Text style={styles.ruleBody}>{detail}</Text>
          <View style={{ height: spacing.lg }} />
          <Button label="New game" tone="primary" onPress={onRestart} />
          <View style={{ height: spacing.sm }} />
          <Button label="Look at the boards" onPress={onDismiss} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelRaised,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  buttonSmall: { paddingVertical: 8, paddingHorizontal: 12, minHeight: 36 },
  buttonPrimary: { backgroundColor: colors.travel, borderColor: colors.travel },
  buttonDanger: { borderColor: colors.danger },
  buttonText: { color: colors.text, fontWeight: '700', fontSize: 14 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5,6,20,0.85)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', marginBottom: spacing.md },
  ruleHead: { color: colors.text, fontWeight: '700', fontSize: 15, marginBottom: 2 },
  ruleBody: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
});

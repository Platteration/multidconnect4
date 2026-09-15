import React, { useMemo } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { achievementById } from '@5d/core';
import { Button } from '@5d/core/ui';
import { GameState, timelineLabel } from '../engine';
import { radius, spacing, Theme, useTheme } from './theme';

interface RulesProps {
  visible: boolean;
  onClose: () => void;
}

export function RulesModal({ visible, onClose }: RulesProps) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>How to play 5D Tic-Tac-Toe</Text>
          <ScrollView style={{ maxHeight: 420 }}>
            <Rule head="It's noughts and crosses.">
              Take turns marking an empty cell. Three in a row wins. X goes first.
            </Rule>
            <Rule head="Every move is remembered.">
              Each turn creates a new board. The map at the bottom shows every board that has ever
              existed, left to right through time. Each row is a timeline.
            </Rule>
            <Rule head="You can send a mark into the past.">
              Tap one of your own marks on the newest board to pick it up. The past boards it can
              travel to light up: boards where it was also your move and its cell was still empty.
              Tap a glowing board to send it there.
            </Rule>
            <Rule head="That creates a new timeline.">
              The past board doesn't change; instead history branches. A fresh timeline starts from
              that moment with your extra mark in it, and your opponent has to answer there too.
            </Rule>
            <Rule head="Leaving has a cost.">
              The mark is gone from the present board, so a travel can undo your own three in a row
              as easily as it can make one somewhere else.
            </Rule>
            <Rule head="Play every waiting board.">
              On your turn you must play every board marked "play". Only then does the turn pass.
              More timelines means more to keep track of, for both of you.
            </Rule>
            <Rule head="Variants.">
              In Settings you can turn on "strict present", the real 5D Chess rule: only boards at
              the present, the earliest "now" anywhere, must be played; boards ahead of it are
              optional, and you end your turn yourself. It applies to the next new game.
            </Rule>
            <Rule head="Winning.">
              Three in a row on any board, in any timeline, wins the whole game at once. If every
              board fills up, or thirty moves each go by with no line, it's a draw.
            </Rule>
          </ScrollView>
          <Button label="Got it" tone="primary" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function Rule({ head, children }: { head: string; children: React.ReactNode }) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.ruleHead}>{head}</Text>
      <Text style={styles.ruleBody}>{children}</Text>
    </View>
  );
}

interface GameOverProps {
  state: GameState;
  /** Badges this game earned, named so they are not silently filed away. */
  newBadges?: readonly string[];
  visible: boolean;
  onRestart: () => void;
  onDismiss: () => void;
  onReplay?: () => void;
}

export function GameOverModal({ state, newBadges, visible, onRestart, onDismiss, onReplay }: GameOverProps) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const win = state.win;
  const headline = win ? `${colors.playerNames[win.player]} wins!` : "It's a draw";
  const detail = win
    ? `Three in a row on ${timelineLabel(win.board.timeline)}, turn ${win.board.turn}.`
    : 'Nobody could make three in a row.';
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={[styles.title, win ? { color: colors.playerAccent[win.player] } : null]}>{headline}</Text>
          <Text style={styles.ruleBody}>{detail}</Text>
          {newBadges && newBadges.length > 0 ? (
            <Text style={[styles.ruleBody, { color: colors.success, marginTop: spacing.sm }]}>
              ✦ {newBadges.map((id) => achievementById(id)?.name ?? id).join(', ')}
            </Text>
          ) : null}
          <View style={{ height: spacing.lg }} />
          <Button label="New game" tone="primary" onPress={onRestart} />
          <View style={{ height: spacing.sm }} />
          {onReplay ? (
            <>
              <Button label="Watch the replay" onPress={onReplay} />
              <View style={{ height: spacing.sm }} />
            </>
          ) : null}
          <Button label="Look at the boards" onPress={onDismiss} />
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Theme) =>
  StyleSheet.create({
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

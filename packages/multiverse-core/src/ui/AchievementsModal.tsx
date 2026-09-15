import React, { useMemo } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ACHIEVEMENTS } from '../achievements';
import { useProgress } from '../app/progress';
import { Button } from './Button';
import { CoreTheme, radius, spacing } from './theme';
import { useTheme } from './ThemeProvider';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/** Everything there is to earn, with what you have earned marked off. */
export function AchievementsModal({ visible, onClose }: Props) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { badges } = useProgress();
  const earned = ACHIEVEMENTS.filter((a) => badges.has(a.id));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Badges</Text>
          <Text style={styles.count}>
            {earned.length} of {ACHIEVEMENTS.length}
          </Text>
          <ScrollView style={{ maxHeight: 420 }}>
            {ACHIEVEMENTS.map((a) => {
              const has = badges.has(a.id);
              return (
                <View key={a.id} style={styles.row} accessibilityLabel={`${a.name}, ${has ? 'earned' : 'not yet'}`}>
                  <Text style={[styles.tick, { color: has ? colors.success : colors.border }]}>{has ? '✦' : '·'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, !has && { color: colors.textMuted }]}>{a.name}</Text>
                    <Text style={styles.blurb}>{a.blurb}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
          <View style={{ height: spacing.md }} />
          <Button label="Close" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: CoreTheme) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(5,6,20,0.85)', justifyContent: 'center', padding: spacing.lg },
    sheet: { backgroundColor: colors.panel, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
    title: { color: colors.text, fontSize: 22, fontWeight: '800' },
    count: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.md },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    tick: { width: 22, fontSize: 16, fontWeight: '800' },
    name: { color: colors.text, fontSize: 15, fontWeight: '700' },
    blurb: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  });

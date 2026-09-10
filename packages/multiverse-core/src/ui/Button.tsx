import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { CoreTheme, radius } from './theme';
import { useTheme } from './ThemeProvider';

interface ButtonProps {
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  small?: boolean;
}

export function Button({ label, onPress, tone = 'ghost', disabled, small }: ButtonProps) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

const makeStyles = (colors: CoreTheme) =>
  StyleSheet.create({
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
  });

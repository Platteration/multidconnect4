import React from 'react';
import { View } from 'react-native';
import { Player } from '../engine';

interface Props {
  player: Player;
  /** The width the mark is drawn into. */
  size: number;
  color: string;
  faded?: boolean;
}

/**
 * One mark, drawn rather than typed so it scales cleanly: X is two bars
 * crossed, O is a ring. Player 0 is always the cross.
 */
export function Mark({ player, size, color, faded }: Props) {
  const bar = Math.max(2, Math.round(size * 0.16));
  const opacity = faded ? 0.35 : 1;
  if (player === 1) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: bar,
          borderColor: color,
          opacity,
        }}
      />
    );
  }
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', opacity }}>
      <View
        style={{
          position: 'absolute',
          width: size,
          height: bar,
          borderRadius: bar / 2,
          backgroundColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: size,
          height: bar,
          borderRadius: bar / 2,
          backgroundColor: color,
          transform: [{ rotate: '-45deg' }],
        }}
      />
    </View>
  );
}

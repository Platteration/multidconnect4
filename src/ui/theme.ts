import type { Player } from '../engine';

export const colors = {
  background: '#0d0f1f',
  panel: '#171a33',
  panelRaised: '#22264a',
  border: '#2f3466',
  text: '#f1f2ff',
  textMuted: '#9a9fce',
  board: '#2a55c8',
  boardDark: '#1d3d95',
  hole: '#0d0f1f',
  travel: '#4de1ff',
  focus: '#ffffff',
  success: '#5cf08c',
  danger: '#ff5c7a',
  players: ['#ff4d5a', '#ffd23f'] as const,
  playersDark: ['#a5202b', '#a8841a'] as const,
};

export function playerColor(p: Player): string {
  return colors.players[p];
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 };

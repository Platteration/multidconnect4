/**
 * Colours and cosmetics. A Theme is the fully resolved palette a screen
 * draws with: the light/dark base, plus the chosen board skin and piece set.
 * Use `useTheme()` from app/theme to get the current one.
 */
import type { Player } from '../engine';

export type Scheme = 'dark' | 'light';

/** The colours every screen draws with. */
export interface Theme {
  scheme: Scheme;
  background: string;
  panel: string;
  panelRaised: string;
  border: string;
  text: string;
  textMuted: string;
  travel: string;
  focus: string;
  success: string;
  warning: string;
  danger: string;
  /** Board skin. */
  board: string;
  boardDark: string;
  hole: string;
  /** Piece set. */
  players: readonly [string, string];
  playersEdge: readonly [string, string];
  /** A readable colour for text that refers to each player. */
  playerAccent: readonly [string, string];
  /** What each side is called, e.g. "Red" and "Yellow" for the classic set. */
  playerNames: readonly [string, string];
}

type Base = Omit<Theme, 'board' | 'boardDark' | 'hole' | 'players' | 'playersEdge' | 'playerAccent' | 'playerNames'>;

const DARK: Base = {
  scheme: 'dark',
  background: '#0d0f1f',
  panel: '#171a33',
  panelRaised: '#22264a',
  border: '#2f3466',
  text: '#f1f2ff',
  textMuted: '#9a9fce',
  travel: '#4de1ff',
  focus: '#ffffff',
  success: '#5cf08c',
  warning: '#ffb547',
  danger: '#ff5c7a',
};

const LIGHT: Base = {
  scheme: 'light',
  background: '#f3f4fb',
  panel: '#ffffff',
  panelRaised: '#e9ebf8',
  border: '#cfd3ea',
  text: '#15172b',
  textMuted: '#5b6084',
  travel: '#0a9fc6',
  focus: '#15172b',
  success: '#1e9a54',
  warning: '#b86e00',
  danger: '#d63b57',
};

export interface Skin {
  id: string;
  name: string;
  board: string;
  boardDark: string;
  hole: string;
  /** Cosmetic packs may later be sold; free ones are always available. */
  premium: boolean;
}

export const SKINS: readonly Skin[] = [
  { id: 'classic', name: 'Classic blue', board: '#2a55c8', boardDark: '#1d3d95', hole: '#0d0f1f', premium: false },
  { id: 'wood', name: 'Walnut', board: '#8a5a3c', boardDark: '#5a3a26', hole: '#1c1410', premium: false },
  { id: 'neon', name: 'Neon grid', board: '#12142a', boardDark: '#6d2bff', hole: '#05060f', premium: true },
  { id: 'paper', name: 'Paper', board: '#f2ead7', boardDark: '#c9b98f', hole: '#ffffff', premium: true },
  { id: 'slate', name: 'Slate', board: '#3a3f4b', boardDark: '#22252e', hole: '#0e1014', premium: true },
];

export interface PieceSet {
  id: string;
  name: string;
  /** What each side is called while this set is in use. */
  names: readonly [string, string];
  colors: readonly [string, string];
  edge: readonly [string, string];
  accent: { dark: readonly [string, string]; light: readonly [string, string] };
  premium: boolean;
}

export const PIECE_SETS: readonly PieceSet[] = [
  {
    id: 'classic',
    names: ['Red', 'Yellow'],
    name: 'Red & yellow',
    colors: ['#ff4d5a', '#ffd23f'],
    edge: ['#a5202b', '#a8841a'],
    accent: { dark: ['#ff4d5a', '#ffd23f'], light: ['#d42a38', '#b58a00'] },
    premium: false,
  },
  {
    id: 'ocean',
    names: ['Teal', 'Coral'],
    name: 'Teal & coral',
    colors: ['#2dd4bf', '#fb7185'],
    edge: ['#0f766e', '#be123c'],
    accent: { dark: ['#2dd4bf', '#fb7185'], light: ['#0f766e', '#be123c'] },
    premium: false,
  },
  {
    id: 'mono',
    names: ['Ink', 'Chalk'],
    name: 'Ink & chalk',
    colors: ['#1b1b24', '#f4f4f8'],
    edge: ['#5b5b70', '#9a9aae'],
    accent: { dark: ['#c8c8d8', '#f4f4f8'], light: ['#1b1b24', '#6c6c80'] },
    premium: true,
  },
  {
    id: 'candy',
    names: ['Bubblegum', 'Lime'],
    name: 'Bubblegum & lime',
    colors: ['#ff6fb5', '#b6f24a'],
    edge: ['#b0306f', '#6b9a12'],
    accent: { dark: ['#ff6fb5', '#b6f24a'], light: ['#c22d7f', '#5f8a0a'] },
    premium: true,
  },
];

export function buildTheme(scheme: Scheme, skinId: string, piecesId: string): Theme {
  const base = scheme === 'dark' ? DARK : LIGHT;
  const skin = SKINS.find((s) => s.id === skinId) ?? SKINS[0];
  const set = PIECE_SETS.find((p) => p.id === piecesId) ?? PIECE_SETS[0];
  return {
    ...base,
    board: skin.board,
    boardDark: skin.boardDark,
    hole: skin.hole,
    players: set.colors,
    playersEdge: set.edge,
    playerAccent: set.accent[scheme],
    playerNames: set.names,
  };
}

/** The default theme, for code that runs before a provider exists. */
export const DEFAULT_THEME: Theme = buildTheme('dark', 'classic', 'classic');

export function playerColor(theme: Theme, p: Player): string {
  return theme.players[p];
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 };

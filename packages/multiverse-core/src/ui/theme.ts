/**
 * The palette every game shares. A game extends `CoreTheme` with the few
 * colours that describe its own board surface — holes and a frame for Connect
 * Four, light and dark squares for Checkers — and supplies its own skins and
 * piece sets. Everything else, including all the chrome, lives here.
 */
import type { Player } from '../types';

export type Scheme = 'dark' | 'light';

/** The colours every screen draws with, whatever the game. */
export interface CoreTheme {
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
  /** Piece set. */
  players: readonly [string, string];
  playersEdge: readonly [string, string];
  /** A readable colour for text that refers to each player. */
  playerAccent: readonly [string, string];
  /** What each side is called, e.g. "Red" and "Yellow" for the classic set. */
  playerNames: readonly [string, string];
}

/** The neutral chrome, before a skin or a piece set is applied. */
export type ThemeBase = Omit<CoreTheme, 'players' | 'playersEdge' | 'playerAccent' | 'playerNames'>;

export const DARK_BASE: ThemeBase = {
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

export const LIGHT_BASE: ThemeBase = {
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

/** What a skin carries in every game; each game adds its own surface colours. */
export interface SkinBase {
  id: string;
  name: string;
  /** Cosmetic packs may later be sold; free ones are always available. */
  premium: boolean;
}

export interface PieceSetBase {
  id: string;
  name: string;
  /** What each side is called while this set is in use. */
  names: readonly [string, string];
  colors: readonly [string, string];
  edge: readonly [string, string];
  accent: { dark: readonly [string, string]; light: readonly [string, string] };
  premium: boolean;
}

/** The player-facing half of a theme, resolved from a piece set. */
export function pieceSetTheme(
  set: PieceSetBase,
  scheme: Scheme,
): Pick<CoreTheme, 'players' | 'playersEdge' | 'playerAccent' | 'playerNames'> {
  return {
    players: set.colors,
    playersEdge: set.edge,
    playerAccent: set.accent[scheme],
    playerNames: set.names,
  };
}

export function playerColor(theme: CoreTheme, p: Player): string {
  return theme.players[p];
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 };

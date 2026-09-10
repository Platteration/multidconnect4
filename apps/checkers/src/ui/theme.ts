/**
 * Checkers' palette: the shared chrome from the core, plus the colours that
 * describe this game's board surface, and the skins and piece sets that fill
 * them in.
 */
import {
  CoreTheme,
  DARK_BASE,
  LIGHT_BASE,
  PieceSetBase,
  Scheme,
  SkinBase,
  pieceSetTheme,
  useTheme as useCoreTheme,
} from '@5d/core/ui';

export { playerColor, radius, spacing } from '@5d/core/ui';
export type { Scheme } from '@5d/core/ui';

/** The board surface: the two square colours and the frame around them. */
interface Surface {
  squareLight: string;
  squareDark: string;
  boardEdge: string;
}

/** Checkers also inks a crown and colour-blind markings onto each piece. */
interface Ink {
  playersInk: readonly [string, string];
}

export type Theme = CoreTheme & Surface & Ink;
export type Skin = SkinBase & Surface;
export type PieceSet = PieceSetBase & { ink: readonly [string, string] };

export const SKINS: readonly Skin[] = [
  { id: 'classic', name: 'Walnut', squareLight: '#e7d3ad', squareDark: '#8a5a3c', boardEdge: '#5a3a26', premium: false },
  { id: 'marble', name: 'Marble', squareLight: '#f1f1f4', squareDark: '#7c8290', boardEdge: '#4d515c', premium: false },
  { id: 'forest', name: 'Forest', squareLight: '#eae5c8', squareDark: '#4f7a4a', boardEdge: '#2f4a2c', premium: true },
  { id: 'midnight', name: 'Midnight', squareLight: '#3a4062', squareDark: '#1b1f3a', boardEdge: '#12142a', premium: true },
  { id: 'cherry', name: 'Cherry', squareLight: '#f3d9c4', squareDark: '#a8413a', boardEdge: '#6b2620', premium: true },
];

export const PIECE_SETS: readonly PieceSet[] = [
  {
    id: 'classic',
    name: 'Red & black',
    names: ['Red', 'Black'],
    colors: ['#e8333f', '#262633'],
    edge: ['#8f1620', '#c9cbe6'],
    ink: ['#ffe2e4', '#ffd66b'],
    accent: { dark: ['#e8333f', '#c9cbe6'], light: ['#c4202c', '#262633'] },
    premium: false,
  },
  {
    id: 'ivory',
    name: 'Ivory & ebony',
    names: ['Ivory', 'Ebony'],
    colors: ['#f4ead2', '#1f1a17'],
    edge: ['#b7a77c', '#7d6a58'],
    ink: ['#8a6d2b', '#e8c877'],
    accent: { dark: ['#f4ead2', '#c9b79a'], light: ['#8a6d2b', '#1f1a17'] },
    premium: false,
  },
  {
    id: 'sunset',
    name: 'Amber & violet',
    names: ['Amber', 'Violet'],
    colors: ['#ff9f2e', '#6d3bd9'],
    edge: ['#b0611a', '#3c1f86'],
    ink: ['#4a2a00', '#ffe9b0'],
    accent: { dark: ['#ff9f2e', '#b18cff'], light: ['#b0611a', '#4c25a8'] },
    premium: true,
  },
  {
    id: 'sea',
    name: 'Sea glass',
    names: ['Aqua', 'Navy'],
    colors: ['#6fe3d1', '#1d3557'],
    edge: ['#2a8f80', '#0e1b2f'],
    ink: ['#0e4a42', '#bfe4ff'],
    accent: { dark: ['#6fe3d1', '#9ec5ff'], light: ['#1f7f72', '#1d3557'] },
    premium: true,
  },
];

export function buildTheme(scheme: Scheme, skinId: string, piecesId: string): Theme {
  const base = scheme === 'dark' ? DARK_BASE : LIGHT_BASE;
  const skin = SKINS.find((s) => s.id === skinId) ?? SKINS[0];
  const set = PIECE_SETS.find((p) => p.id === piecesId) ?? PIECE_SETS[0];
  return {
    ...base,
    squareLight: skin.squareLight,
    squareDark: skin.squareDark,
    boardEdge: skin.boardEdge,
    playersInk: set.ink,
    ...pieceSetTheme(set, scheme),
  };
}

/** The default theme, for code that runs before a provider exists. */
export const DEFAULT_THEME: Theme = buildTheme('dark', 'classic', 'classic');

/** The current palette, typed with this game's board colours. */
export function useTheme(): Theme {
  return useCoreTheme<Theme>();
}

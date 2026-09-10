/**
 * Connect Four's palette: the shared chrome from the core, plus the three
 * colours that describe this game's board surface, and the skins and piece
 * sets that fill them in.
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

/** The board surface: the frame, its shadowed edge, and an empty hole. */
interface Surface {
  board: string;
  boardDark: string;
  hole: string;
}

export type Theme = CoreTheme & Surface;
export type Skin = SkinBase & Surface;
export type PieceSet = PieceSetBase;

export const SKINS: readonly Skin[] = [
  { id: 'classic', name: 'Classic blue', board: '#2a55c8', boardDark: '#1d3d95', hole: '#0d0f1f', premium: false },
  { id: 'wood', name: 'Walnut', board: '#8a5a3c', boardDark: '#5a3a26', hole: '#1c1410', premium: false },
  { id: 'neon', name: 'Neon grid', board: '#12142a', boardDark: '#6d2bff', hole: '#05060f', premium: true },
  { id: 'paper', name: 'Paper', board: '#f2ead7', boardDark: '#c9b98f', hole: '#ffffff', premium: true },
  { id: 'slate', name: 'Slate', board: '#3a3f4b', boardDark: '#22252e', hole: '#0e1014', premium: true },
];

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
  const base = scheme === 'dark' ? DARK_BASE : LIGHT_BASE;
  const skin = SKINS.find((s) => s.id === skinId) ?? SKINS[0];
  const set = PIECE_SETS.find((p) => p.id === piecesId) ?? PIECE_SETS[0];
  return {
    ...base,
    board: skin.board,
    boardDark: skin.boardDark,
    hole: skin.hole,
    ...pieceSetTheme(set, scheme),
  };
}

/** The default theme, for code that runs before a provider exists. */
export const DEFAULT_THEME: Theme = buildTheme('dark', 'classic', 'classic');

/** The current palette, typed with this game's board colours. */
export function useTheme(): Theme {
  return useCoreTheme<Theme>();
}

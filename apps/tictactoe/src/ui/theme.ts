/**
 * Tic-tac-toe's palette: the shared chrome from the core, plus the two
 * colours that describe this game's board surface, and the skins and mark
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

/** The board surface: the paper behind the marks and the grid drawn on it. */
interface Surface {
  paper: string;
  grid: string;
}

export type Theme = CoreTheme & Surface;
export type Skin = SkinBase & Surface;
export type PieceSet = PieceSetBase;

export const SKINS: readonly Skin[] = [
  { id: 'classic', name: 'Graph paper', paper: '#171a33', grid: '#4de1ff', premium: false },
  { id: 'chalk', name: 'Chalkboard', paper: '#1d2a24', grid: '#cfe8d8', premium: false },
  { id: 'notebook', name: 'Notebook', paper: '#f6f3e7', grid: '#8aa0c8', premium: true },
  { id: 'neon', name: 'Neon', paper: '#150e24', grid: '#ff5cf0', premium: true },
  { id: 'sand', name: 'Sand', paper: '#e9d8b4', grid: '#9a6b3f', premium: true },
];

export const PIECE_SETS: readonly PieceSet[] = [
  {
    id: 'classic',
    name: 'X & O',
    names: ['X', 'O'],
    colors: ['#ff4d5a', '#ffd23f'],
    edge: ['#8f1620', '#a8791a'],
    accent: { dark: ['#ff6b76', '#ffd23f'], light: ['#c4202c', '#a8791a'] },
    premium: false,
  },
  {
    id: 'sea',
    name: 'Aqua & navy',
    names: ['Aqua', 'Navy'],
    colors: ['#6fe3d1', '#5b8dff'],
    edge: ['#2a8f80', '#2a4a9c'],
    accent: { dark: ['#6fe3d1', '#9ec5ff'], light: ['#1f7f72', '#2a4a9c'] },
    premium: false,
  },
  {
    id: 'sunset',
    name: 'Amber & violet',
    names: ['Amber', 'Violet'],
    colors: ['#ff9f2e', '#b18cff'],
    edge: ['#b0611a', '#5a35b0'],
    accent: { dark: ['#ff9f2e', '#b18cff'], light: ['#b0611a', '#4c25a8'] },
    premium: true,
  },
  {
    id: 'ink',
    name: 'Ink & pencil',
    names: ['Ink', 'Pencil'],
    colors: ['#f4ead2', '#8b93b8'],
    edge: ['#b7a77c', '#555c7a'],
    accent: { dark: ['#f4ead2', '#aeb5d6'], light: ['#6b5a2b', '#454b66'] },
    premium: true,
  },
];

export function buildTheme(scheme: Scheme, skinId: string, piecesId: string): Theme {
  const base = scheme === 'dark' ? DARK_BASE : LIGHT_BASE;
  const skin = SKINS.find((s) => s.id === skinId) ?? SKINS[0];
  const set = PIECE_SETS.find((p) => p.id === piecesId) ?? PIECE_SETS[0];
  return { ...base, paper: skin.paper, grid: skin.grid, ...pieceSetTheme(set, scheme) };
}

/** The default theme, for code that runs before a provider exists. */
export const DEFAULT_THEME: Theme = buildTheme('dark', 'classic', 'classic');

/** The current palette, typed with this game's board colours. */
export function useTheme(): Theme {
  return useCoreTheme<Theme>();
}

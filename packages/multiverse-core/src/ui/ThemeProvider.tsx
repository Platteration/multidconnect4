import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useSettings } from '../app/settings';
import { CoreTheme, Scheme } from './theme';

export type BuildTheme<T extends CoreTheme> = (scheme: Scheme, skinId: string, piecesId: string) => T;

const Ctx = createContext<CoreTheme | null>(null);

interface Props<T extends CoreTheme> {
  /** The game's own palette builder, given the resolved scheme and the chosen cosmetics. */
  build: BuildTheme<T>;
  children: React.ReactNode;
}

/** Resolves the user's theme choice, skin and piece set into one palette. */
export function ThemeProvider<T extends CoreTheme>({ build, children }: Props<T>) {
  const { settings } = useSettings();
  const system = useColorScheme();
  const scheme: Scheme = settings.theme === 'system' ? (system === 'light' ? 'light' : 'dark') : settings.theme;
  const theme = useMemo(
    () => build(scheme, settings.skin, settings.pieces),
    [build, scheme, settings.skin, settings.pieces],
  );
  return <Ctx.Provider value={theme}>{children}</Ctx.Provider>;
}

/**
 * The current palette. Core components get `CoreTheme`; a game passes its own
 * theme type so its board colours stay typed, e.g. `useTheme<Theme>()`.
 */
export function useTheme<T extends CoreTheme = CoreTheme>(): T {
  const theme = useContext(Ctx);
  if (!theme) throw new Error('useTheme was called outside a ThemeProvider');
  return theme as T;
}

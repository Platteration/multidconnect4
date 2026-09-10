import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { EntitlementsProvider, keys, loadJson, ProgressProvider, SettingsProvider, useSettings } from '@5d/core/app';
import { StatsProvider } from './src/app/stats';
import { GameSetup, looksLikeSavedGame, normaliseSaved } from './src/app/setup';
import { ThemeProvider } from '@5d/core/ui';
import { buildTheme, useTheme } from './src/ui/theme';
import type { GameState } from './src/engine';
import { GameScreen } from './src/ui/GameScreen';

type Saved = { history: GameState[]; setup: GameSetup };

function Root() {
  const { ready } = useSettings();
  const colors = useTheme();
  const [saved, setSaved] = useState<Saved | null | undefined>(undefined);

  useEffect(() => {
    loadJson<unknown>(keys.game).then((v) => setSaved(looksLikeSavedGame(v) ? normaliseSaved(v) : null));
  }, []);

  if (!ready || saved === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.travel} />
      </View>
    );
  }
  return (
    <>
      <StatusBar style={colors.scheme === 'dark' ? 'light' : 'dark'} />
      <GameScreen initialHistory={saved?.history} initialSetup={saved?.setup} />
    </>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <ThemeProvider build={buildTheme}>
        <ProgressProvider>
          <EntitlementsProvider>
            <StatsProvider>
              <SafeAreaProvider>
                <Root />
              </SafeAreaProvider>
            </StatsProvider>
          </EntitlementsProvider>
        </ProgressProvider>
      </ThemeProvider>
    </SettingsProvider>
  );
}

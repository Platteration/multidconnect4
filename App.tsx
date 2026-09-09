import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { EntitlementsProvider } from './src/app/entitlements';
import { keys, loadJson, removeKey } from './src/app/persist';
import { ProgressProvider } from './src/app/progress';
import { StatsProvider } from './src/app/stats';
import { SettingsProvider, useSettings } from './src/app/settings';
import { restoreSavedGame } from './src/app/savedGame';
import { GameSetup } from './src/app/setup';
import { ThemeProvider, useTheme } from './src/app/theme';
import type { GameState } from './src/engine';
import { ErrorBoundary } from './src/ui/ErrorBoundary';
import { GameScreen } from './src/ui/GameScreen';

type Saved = { history: GameState[]; setup: GameSetup };

function Root() {
  const { ready } = useSettings();
  const colors = useTheme();
  const [saved, setSaved] = useState<Saved | null | undefined>(undefined);

  useEffect(() => {
    loadJson<unknown>(keys.game).then((v) => {
      const restored = v ? restoreSavedGame(v) : null;
      // A stored game that cannot be replayed is not one this app can draw.
      if (v && !restored) void removeKey(keys.game);
      setSaved(restored);
    });
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
  // Bumping the key remounts everything below it, which is how the error
  // boundary's "start a new game" gets a clean tree after clearing the save.
  const [generation, setGeneration] = useState(0);
  return (
    <SettingsProvider>
      <ThemeProvider>
        <ProgressProvider>
          <EntitlementsProvider>
            <StatsProvider>
              <SafeAreaProvider>
                <ErrorBoundary
                  key={generation}
                  onReset={() => {
                    void removeKey(keys.game);
                    setGeneration((g) => g + 1);
                  }}
                >
                  <Root />
                </ErrorBoundary>
              </SafeAreaProvider>
            </StatsProvider>
          </EntitlementsProvider>
        </ProgressProvider>
      </ThemeProvider>
    </SettingsProvider>
  );
}

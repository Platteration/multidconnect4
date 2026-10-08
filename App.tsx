import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { EntitlementsProvider } from './src/app/entitlements';
import { launchLink, LaunchLink } from './src/app/links';
import { KEYS, loadJson, removeKey } from './src/app/persist';
import { ProgressProvider } from './src/app/progress';
import { StatsProvider } from './src/app/stats';
import { SettingsProvider, useSettings } from './src/app/settings';
import { MAX_SAVED_ACTIONS, restoreSavedGame } from './src/app/savedGame';
import { GameSetup } from './src/app/setup';
import { ThemeProvider, useTheme } from './src/app/theme';
import type { GameState } from './src/engine';
import { ErrorBoundary } from './src/ui/ErrorBoundary';
import { GameScreen } from './src/ui/GameScreen';

type Saved = { history: GameState[]; setup: GameSetup; truncated: boolean };

function Root({ launch }: { launch: LaunchLink }) {
  const { ready } = useSettings();
  const colors = useTheme();
  const [saved, setSaved] = useState<Saved | null | undefined>(undefined);
  // Something was stored and the player is not getting all of it back. Losing
  // a game in silence is the one outcome the save path must not have, so
  // whatever is lost is said out loud on the screen that replaces it.
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    loadJson<unknown>(KEYS.game).then((v) => {
      const restored = v ? restoreSavedGame(v) : null;
      if (v && !restored) {
        // A stored game that cannot be replayed is not one this app can draw.
        void removeKey(KEYS.game);
        setNotice('The game that was saved could not be read, so this is a new one.');
      } else if (restored?.truncated) {
        setNotice(`That game was longer than this app can load, so it has come back at move ${MAX_SAVED_ACTIONS}.`);
      }
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
      <GameScreen initialHistory={saved?.history} initialSetup={saved?.setup} initialNotice={notice} launch={launch} />
    </>
  );
}

export default function App() {
  // Bumping the key remounts everything below it, which is how the error
  // boundary's "start a new game" gets a clean tree after clearing the save.
  const [generation, setGeneration] = useState(0);
  // The link this launch was started with, answered once: held here, above the
  // boundary, because the boundary draws the screen again ("Try again", and the
  // reset) and the platform reports the same link to every screen that asks.
  const [launch] = useState(launchLink);
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
                    void removeKey(KEYS.game);
                    setGeneration((g) => g + 1);
                  }}
                >
                  <Root launch={launch} />
                </ErrorBoundary>
              </SafeAreaProvider>
            </StatsProvider>
          </EntitlementsProvider>
        </ProgressProvider>
      </ThemeProvider>
    </SettingsProvider>
  );
}

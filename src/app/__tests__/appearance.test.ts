/**
 * The app ships a "System" theme setting and a complete light palette. Both
 * are worth nothing if the manifest declares the app as one appearance only:
 * on iOS that becomes UIUserInterfaceStyle in Info.plist, and React Native's
 * useColorScheme() reads the app's own trait collection, so it can then only
 * ever answer "dark". The light palette was unreachable for anyone who left
 * the default setting alone.
 */
// Settings reach native storage on import; nothing here uses stored values.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));

import manifest from '../../../app.json';
import { DEFAULT_SETTINGS } from '../settings';
import { buildTheme } from '../../ui/theme';

describe('what appearance the app declares', () => {
  it('follows the system, because that is what it says it does', () => {
    expect(DEFAULT_SETTINGS.theme).toBe('system');
    expect(manifest.expo.userInterfaceStyle).toBe('automatic');
  });

  it('has a light palette that is really different, so locking it dark loses something', () => {
    const dark = buildTheme('dark', DEFAULT_SETTINGS.skin, DEFAULT_SETTINGS.pieces);
    const light = buildTheme('light', DEFAULT_SETTINGS.skin, DEFAULT_SETTINGS.pieces);
    expect(light.scheme).toBe('light');
    expect(light.background).not.toBe(dark.background);
    expect(light.text).not.toBe(dark.text);
  });
});

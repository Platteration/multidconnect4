/**
 * What the app config asks the operating systems for, and what it says about
 * itself. The config plugins fill in their own defaults for anything left
 * out, so an omission here becomes a permission in the shipped build that
 * nothing in the app ever uses, or a key whose reader the SDK quietly dropped
 * — and the only place either shows up is a prebuild, which no other suite
 * runs. So app.json states every key this file pins, even at its default,
 * and the file and the test say the same thing.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Settings reach native storage on import; nothing here uses stored values.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));

import debugInternetPlugin from '../../../plugins/withDebugInternet';
import { KEYS } from '../persist';
import { DEFAULT_SETTINGS } from '../settings';
import { buildTheme } from '../../ui/theme';

/**
 * The plugin is plain CommonJS with its helpers hung off the exported
 * function, which is more than TypeScript reads off a JS module. This is the
 * surface the test drives.
 */
const withDebugInternet = debugInternetPlugin as unknown as {
  (config: { name: string; slug: string }): {
    mods?: { android?: { dangerous?: (config: unknown) => Promise<unknown> } };
  };
  addInternetPermission(xml: string): string;
  writeDebugManifest(platformProjectRoot: string): string;
  DEBUG_MANIFEST: string;
};

const root = path.join(__dirname, '..', '..', '..');
const readJson = (file: string) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const appConfig = readJson('app.json').expo;
const pkg = readJson('package.json');
const eas = readJson('eas.json');
/** The version of each of its own packages that the installed SDK pairs with. */
const bundled = readJson('node_modules/expo/bundledNativeModules.json');

/**
 * What a prebuild would generate: `expo config --type introspect` runs the
 * same plugin chain, so these are the merged results rather than the app.json
 * that feeds them. The template's own permissions only exist here — app.json
 * never mentions them.
 */
const introspected = JSON.parse(
  execFileSync('node', [require.resolve('expo/bin/cli'), 'config', '--type', 'introspect', '--json'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1' },
  })
);
const android = introspected._internal.modResults.android;
const ios = introspected._internal.modResults.ios;
const manifest = android.manifest.manifest;

type Named = { $: Record<string, string>; _?: string };
const permission = (name: string): Named | undefined =>
  manifest['uses-permission'].find((p: Named) => p.$['android:name'] === name);

/** The value of a generated Android resource, as res/values/<file>.xml would hold it. */
const resource = (file: 'strings' | 'colors', name: string): string | undefined => {
  const kind = file === 'strings' ? 'string' : 'color';
  return android[file].resources[kind].find((r: Named) => r.$.name === name)?._;
};

const pluginOptions = (name: string) => {
  const entry = appConfig.plugins.find((p: unknown) => (Array.isArray(p) ? p[0] : p) === name);
  expect(entry).toBeDefined();
  return Array.isArray(entry) ? entry[1] || {} : {};
};

/** Every source file the app ships, outside the tests: its path from the root, and its text. */
const sourceFiles = (): [string, string][] => {
  const out: [string, string][] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        out.push([path.relative(root, full), fs.readFileSync(full, 'utf8')]);
      }
    }
  };
  walk(path.join(root, 'src'));
  for (const file of ['App.tsx', 'index.ts']) out.push([file, fs.readFileSync(path.join(root, file), 'utf8')]);
  return out;
};
const sourceText = () => sourceFiles().map(([, text]) => text).join('\n');

/**
 * Every AndroidManifest.xml under `dir`. `isDirectory()` is false for a
 * symlink, so a linked package — and any cycle through one — is left alone.
 */
const manifestsUnder = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...manifestsUnder(full));
    else if (entry.isFile() && entry.name === 'AndroidManifest.xml') out.push(full);
  }
  return out;
};

/**
 * The only Android permissions this app has a use for. Everything else that
 * the template or a module manifest declares is taken back out with
 * `tools:node="remove"` by `android.blockedPermissions`.
 */
const USED = [
  'android.permission.MODIFY_AUDIO_SETTINGS', // expo-audio, which plays the sounds
  'android.permission.VIBRATE', // expo-haptics
];
// Not in USED: INTERNET. A development build needs it to load its bundle and
// nothing else here ever opens a socket, so it is blocked in the config and
// added back to the debug source set alone — see plugins/withDebugInternet.js
// and the test at the bottom of this file.
const INTERNET = 'android.permission.INTERNET';
/**
 * What the template grants every app and this one refuses: the network, the
 * storage and media reads that nothing here ever asks for, and the
 * development overlay's 'display over other apps', which the template writes
 * into its main manifest as well as its debug one.
 */
const BLOCKED = [
  INTERNET,
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_AUDIO',
  'android.permission.SYSTEM_ALERT_WINDOW',
];

describe('what appearance the app declares', () => {
  // The app ships a "System" theme setting and a complete light palette. Both
  // are worth nothing if the manifest declares the app as one appearance
  // only: on iOS that becomes UIUserInterfaceStyle in Info.plist, and React
  // Native's useColorScheme() reads the app's own trait collection, so it can
  // then only ever answer "dark". The light palette was unreachable for
  // anyone who left the default setting alone.
  it('follows the system, because that is what it says it does', () => {
    expect(DEFAULT_SETTINGS.theme).toBe('system');
    expect(appConfig.userInterfaceStyle).toBe('automatic');
    expect(ios.infoPlist.UIUserInterfaceStyle).toBe('Automatic');
  });

  it('has a light palette that is really different, so locking it dark loses something', () => {
    const dark = buildTheme('dark', DEFAULT_SETTINGS.skin, DEFAULT_SETTINGS.pieces);
    const light = buildTheme('light', DEFAULT_SETTINGS.skin, DEFAULT_SETTINGS.pieces);
    expect(light.scheme).toBe('light');
    expect(light.background).not.toBe(dark.background);
    expect(light.text).not.toBe(dark.text);
  });

  it('ships expo-system-ui, which is what follows the style on Android', () => {
    // On iOS the style is an Info.plist key the system honours by itself. On
    // Android both halves are expo-system-ui's: its config plugin writes the
    // style into a string resource, and its activity listener reads that at
    // launch to set the night mode. Nothing else in the SDK writes that
    // resource, so its presence is the package being installed, not merely
    // listed. The version is the SDK's own pairing, not a number typed here.
    expect(resource('strings', 'expo_system_ui_user_interface_style')).toBe('automatic');
    expect(pkg.dependencies['expo-system-ui']).toBe(bundled['expo-system-ui']);
    expect(fs.existsSync(path.join(root, 'node_modules', 'expo-system-ui', 'package.json'))).toBe(true);
  });
});

describe('splash screen', () => {
  it('is configured through the plugin, the only thing on SDK 57 that reads one', () => {
    // SDK 57 dropped the top-level `splash` block: expo-splash-screen's plugin
    // reads its own props and nothing else, so a top-level block is not a
    // splash screen, it is a key nothing reads. The colour is the app's own
    // background, so the first frame and the launch screen match.
    expect(appConfig.splash).toBeUndefined();
    expect(pluginOptions('expo-splash-screen')).toEqual({
      image: './assets/splash-icon.png',
      imageWidth: 200,
      resizeMode: 'contain',
      backgroundColor: appConfig.backgroundColor,
    });
    expect(fs.existsSync(path.join(root, 'assets', 'splash-icon.png'))).toBe(true);
  });

  it('reaches the generated native projects', () => {
    // The plugin no-ops without props, so props in app.json are not the same
    // as a splash screen being built. These are what it writes when it runs.
    expect(resource('colors', 'splashscreen_background')).toBe(appConfig.backgroundColor);
    expect(resource('strings', 'expo_splash_screen_resize_mode')).toBe('contain');
    const styles = android.styles.resources.style.map((s: Named) => s.$.name);
    expect(styles).toContain('Theme.App.SplashScreen');
    expect(ios.infoPlist.UILaunchStoryboardName).toBe('SplashScreen');
  });

  it('is installed at the version the SDK pairs with', () => {
    expect(pkg.dependencies['expo-splash-screen']).toBe(bundled['expo-splash-screen']);
  });
});

describe('keys the SDK no longer reads', () => {
  it('does not carry newArchEnabled', () => {
    // SDK 57 has no reader for it in the CLI, the config plugins or
    // prebuild-config: the new architecture is simply on. Left in, the key
    // reads as a switch someone could flip.
    expect(appConfig).not.toHaveProperty('newArchEnabled');
  });

  it('does not carry android.edgeToEdgeEnabled', () => {
    // Android 16 makes edge-to-edge mandatory and prebuild warns on the key.
    // What it used to be turned off for — nothing supplying insets — does
    // not apply here: the safe-area context does.
    expect(appConfig.android).not.toHaveProperty('edgeToEdgeEnabled');
    expect(Object.keys(pkg.dependencies).some((d) => /safe-area/.test(d))).toBe(true);
  });
});

describe('what app.json states rather than leaves to a default', () => {
  it('keeps predictive back off', () => {
    // The default, stated so the file says what the build does: predictive
    // back previews the previous screen during the gesture, and nothing here
    // has opted into taking part in that animation.
    expect(appConfig.android.predictiveBackGestureEnabled).toBe(false);
  });

  it('is portrait, on tablets too', () => {
    expect(appConfig.orientation).toBe('portrait');
    expect(appConfig.ios.supportsTablet).toBe(true);
  });

  it('builds the web target with Metro', () => {
    expect(appConfig.web.bundler).toBe('metro');
  });

  it('keeps its URL scheme, because it handles a URL', () => {
    // A scheme registers the app as a handler and belongs only where the app
    // reads what arrives. GameScreen reads game codes out of deep links.
    expect(appConfig.scheme).toBe(appConfig.slug);
    expect(sourceText()).toMatch(/Linking\.addEventListener\('url'/);
  });

  it('ships the three adaptive-icon layers', () => {
    // A foreground alone leaves the launcher to invent a background and the
    // themed-icon setting with nothing to show.
    const icon = appConfig.android.adaptiveIcon;
    for (const layer of ['foregroundImage', 'backgroundImage', 'monochromeImage']) {
      expect(typeof icon[layer]).toBe('string');
      expect(fs.existsSync(path.join(root, icon[layer]))).toBe(true);
    }
  });
});

describe('what leaves the device', () => {
  it('has no network code, checked against the source rather than assumed', () => {
    // The reason INTERNET can go. Deep links come in through Linking, a game
    // code goes out through Share.share and the clipboard; none of those
    // opens a socket. A URL in a doc comment is not a request, so block
    // comments are set aside before looking for one.
    //
    // The one URL the app carries is the About card's source link, which
    // Linking hands to the browser: no socket of the app's own. It is pinned
    // by file and by value, so a second URL, or that one anywhere else, or
    // anything but openURL reaching it, is still a finding.
    //
    // What is looked for is the primitives AND the modules that are a socket
    // by themselves: a WebView loads a URL of its own, expo-network reports
    // what the socket is attached to, and expo-file-system - already here
    // transitively, with its own INTERNET declaration already blocked and
    // accounted for, so the manifest walk below would not notice it either -
    // downloads over HTTP. This catches a call or an import written plainly,
    // which is how one gets written; it cannot catch a name assembled at
    // runtime, and does not claim to.
    const network =
      /fetch\(|axios|XMLHttpRequest|WebSocket|EventSource|new Request\(|sendBeacon|downloadAsync|uploadAsync|createDownloadResumable|openURL|openBrowserAsync|expo-updates|expo-network|expo-asset|expo-file-system|react-native-webview|netinfo|https?:\/\//i;
    const stripped = sourceFiles().map(([file, text]) => [file, text.replace(/\/\*[\s\S]*?\*\//g, '')] as const);
    expect(stripped.length).toBeGreaterThan(10);
    const hits = stripped.filter(([, code]) => network.test(code)).map(([file]) => file);
    const about = path.join('src', 'ui', 'SettingsModal.tsx');
    expect(hits).toEqual([about]);
    const source = stripped.find(([file]) => file === about)?.[1] ?? '';
    expect(source.match(/['"`]https?:[^'"`]*['"`]/g)).toEqual(["'https://github.com/Platteration/multidconnect4'"]);
    expect(source.match(/openURL\([^)]*\)/g)).toEqual(['openURL(SOURCE_URL)']);
    expect(/fetch\(|axios|XMLHttpRequest|WebSocket|openBrowserAsync|expo-updates/.test(source)).toBe(false);
    // And none of those modules is a dependency to reach for in the first
    // place: the scan reads the app's own source, so a module that is not
    // installed is one nobody can import by accident.
    for (const module of ['expo-updates', 'expo-network', 'expo-asset', 'expo-file-system', 'react-native-webview', '@react-native-community/netinfo']) {
      expect(pkg.dependencies).not.toHaveProperty(module);
    }
  });

  it('does not ship network access', () => {
    // INTERNET in the shipped manifest is what turns a malicious dependency
    // or in-process code execution from 'reads the saved game' into 'sends
    // it somewhere'. The template grants it to every app and expo-file-system
    // declares it in its own manifest, so it has to be blocked rather than
    // merely not asked for.
    expect(appConfig.android.blockedPermissions).toContain(INTERNET);
    const internet = permission(INTERNET);
    expect(internet).toBeDefined(); // it is in the merge, and being removed
    expect(internet?.$['tools:node']).toBe('remove');
  });

  it('takes the storage and media reads, and the overlay, back out with it', () => {
    // The template's legacy storage pair and its 'display over other apps',
    // and the media reads a module would bring: the app keeps one game and
    // its settings in AsyncStorage, reads nothing else off the device and
    // draws over nothing. Each blocked name is in the merged manifest as a
    // removal, so a module declaring it tomorrow is overruled.
    expect(appConfig.android.blockedPermissions).toEqual(BLOCKED);
    for (const name of BLOCKED) {
      expect(permission(name)?.$['tools:node']).toBe('remove');
    }
  });

  it('declares nothing in the generated manifest that the app does not use', () => {
    // The prebuild template adds permissions of its own (legacy storage, the
    // 'display over other apps' overlay) that nothing here ever asked for,
    // and blockedPermissions is the only thing that takes one back out. A
    // permission arriving in the shipped build is noticed here.
    const declared = manifest['uses-permission']
      .filter((p: Named) => p.$['tools:node'] !== 'remove')
      .map((p: Named) => p.$['android:name']);
    expect(declared.length).toBeGreaterThan(0); // the introspection found a manifest at all
    expect(declared.filter((name: string) => !USED.includes(name))).toEqual([]);
  });

  it('blocks every permission a bundled native module merges in', () => {
    // The generated manifest is only half of it: each native module ships an
    // AndroidManifest.xml that Gradle folds in at build time, which no plugin
    // option touches. expo-file-system, which expo itself bundles, declares
    // INTERNET and both legacy storage permissions that way.
    //
    // Every manifest in the tree is read rather than the ones at a guessed
    // path inside a directory whose name starts with 'expo'. A scoped package
    // is not a top-level directory name at all, react-native keeps its own
    // under ReactAndroid/src/debug, and async-storage and safe-area-context
    // each ship one — so the ratchet this is here to be only held for
    // expo-branded permission creep, and the module someone adds tomorrow is
    // the one it is for.
    const files = manifestsUnder(path.join(root, 'node_modules'));
    const declaredBy = new Map<string, string[]>(); // permission -> the manifests declaring it
    for (const file of files) {
      const xml = fs.readFileSync(file, 'utf8');
      for (const m of xml.matchAll(/<uses-permission[^>]*android:name="([^"]+)"/g)) {
        declaredBy.set(m[1], [...(declaredBy.get(m[1]) || []), path.relative(root, file)]);
      }
    }

    // The scan found the module manifests, and reaches the three kinds a
    // name filter would miss: a package that is not expo-*, a scoped one,
    // and a source set that is not src/main.
    const seen = files.map((f) => path.relative(path.join(root, 'node_modules'), f));
    expect(seen.length).toBeGreaterThan(10);
    expect(declaredBy.size).toBeGreaterThan(0);
    expect(seen.some((f) => f.startsWith('react-native/'))).toBe(true);
    expect(seen.some((f) => f.startsWith('@'))).toBe(true);
    expect(seen.some((f) => f.includes(`src${path.sep}debug${path.sep}`))).toBe(true);

    // INTERNET needs no exception here: expo-file-system declares it and the
    // blocked list is what takes it back out of the shipped build.
    const blocked: string[] = appConfig.android.blockedPermissions || [];
    const unblocked = [...declaredBy]
      .filter(([name]) => !USED.includes(name) && !blocked.includes(name))
      .map(([name, where]) => `${name} (${where.join(', ')})`);
    expect(unblocked).toEqual([]);
  });

  it('gives a development build the network back, in the debug source set only', async () => {
    // Blocking it outright would stop a dev client loading its bundle. The
    // manifest merger gives a build-type source set higher priority than the
    // main manifest, so the permission is added to android/app/src/debug —
    // the same split React Native's own template uses for its debug-only
    // SYSTEM_ALERT_WINDOW. The release variant never reads that file.
    expect(appConfig.plugins).toContain('./plugins/withDebugInternet');

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${appConfig.slug}-prebuild-`));
    try {
      // What expo-template-bare-minimum@57.0.26 puts there, verbatim (the
      // 57.0.22 that expo@57.0.20 ships is byte-identical).
      const template = [
        '<manifest xmlns:android="http://schemas.android.com/apk/res/android"',
        '    xmlns:tools="http://schemas.android.com/tools">',
        '',
        '    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>',
        '',
        '    <application android:usesCleartextTraffic="true" tools:targetApi="28" tools:ignore="GoogleAppIndexingWarning" tools:replace="android:usesCleartextTraffic" />',
        '</manifest>',
        '',
      ].join('\n');
      const file = path.join(dir, withDebugInternet.DEBUG_MANIFEST);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, template);

      const config = withDebugInternet({ name: appConfig.name, slug: appConfig.slug });
      const dangerous = config.mods?.android?.dangerous;
      expect(typeof dangerous).toBe('function');
      await dangerous?.({ ...config, modRequest: { platformProjectRoot: dir } });

      const written = fs.readFileSync(file, 'utf8');
      expect(written).toMatch(/<uses-permission[^>]*android:name="android\.permission\.INTERNET"/);
      // ...without dropping what the template had there.
      expect(written).toContain('android.permission.SYSTEM_ALERT_WINDOW');
      expect(written).toContain('usesCleartextTraffic');
      // ...and running it again changes nothing.
      expect(withDebugInternet.addInternetPermission(written)).toBe(written);
      // A project whose template wrote no debug manifest gets one.
      const fresh = path.join(dir, 'fresh');
      expect(fs.readFileSync(withDebugInternet.writeDebugManifest(fresh), 'utf8')).toContain(
        'android.permission.INTERNET'
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps the saved game in Android backup', () => {
    // @expo/config-plugins defaults allowBackup to true over the template's
    // own false, so the file states it rather than inheriting it. The store
    // is the five records in persist.ts - the game in progress, the settings,
    // the record sheet, the puzzle progress and the entitlements - all of
    // them the player's own, holding nothing that must not leave the device.
    // The only thing `false` would do is lose them on a move to a new phone.
    //
    // The entitlements record is the one to look at again if the store is
    // ever wired up (STORE_ENABLED in purchases.ts): with no backup rules of
    // its own, a restored - or planted - entitlements record is whatever it
    // says it is. Today every cosmetic is free and it unlocks nothing.
    expect(appConfig.android.allowBackup).toBe(true);
    expect(manifest.application[0].$['android:allowBackup']).toBe('true');
    // And the sentence above names the records the app actually keeps.
    expect(Object.keys(KEYS).sort()).toEqual(['entitlements', 'game', 'progress', 'settings', 'stats']);
  });
});

describe('eas.json', () => {
  it('has the shared build shape', () => {
    expect(eas.cli).toEqual({ version: '>= 16.0.0', appVersionSource: 'remote' });
    expect(eas.build.development).toMatchObject({ developmentClient: true, distribution: 'internal' });
    expect(eas.build.preview).toMatchObject({ distribution: 'internal' });
    expect(eas.build.production).toMatchObject({ autoIncrement: true });
  });
});

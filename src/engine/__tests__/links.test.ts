/**
 * Links carrying a game code. A code left in the web address bar is re-imported
 * on every reload, which throws away whatever has been played since.
 */
import { clearCodeFromUrl, codeFromUrl, urlWithoutCode } from '../../app/links';

describe('codeFromUrl', () => {
  it('finds the code in every shape of link', () => {
    expect(codeFromUrl('https://example.com/?code=5DC4.abc')).toBe('5DC4.abc');
    expect(codeFromUrl('multidconnect4://load?code=5DC4.abc')).toBe('5DC4.abc');
    expect(codeFromUrl('https://example.com/#code=5DC4.abc')).toBe('5DC4.abc');
    expect(codeFromUrl('https://example.com/load/5DC4.abc')).toBe('5DC4.abc');
    expect(codeFromUrl('https://example.com/?code=5DC4.a%2Bb')).toBe('5DC4.a+b');
  });

  it('finds nothing where there is nothing', () => {
    expect(codeFromUrl(null)).toBeNull();
    expect(codeFromUrl('https://example.com/')).toBeNull();
  });

  it('reads no code it could not hand back to urlWithoutCode', () => {
    // A code taken out of a shape the cleaner cannot rewrite is imported again
    // on every reload. The fragment matters most: it never reaches the server,
    // so any static host serving index.html at / loads the app with it.
    expect(codeFromUrl('https://example.com/load/5DC4.abc/x')).toBeNull();
    expect(codeFromUrl('https://example.com/a/load/5DC4.abc/b/c')).toBeNull();
    expect(codeFromUrl('https://example.com/?x=1#/load/5DC4.abc')).toBeNull();
    // The host, not the path: for a scheme the parser does not know, `load` in
    // `multidconnect4://load/CODE` is where the host goes, so the cleaner's
    // rewrite of the pathname can never reach it. Reading the raw href instead
    // of the parse is what let the reader see a code the cleaner could not.
    expect(codeFromUrl('multidconnect4://load/5DC4.abc')).toBeNull();
    // The query of the same link is read, and is strippable.
    expect(codeFromUrl('multidconnect4://load?code=5DC4.abc')).toBe('5DC4.abc');
  });
});

/**
 * Every shape a link can take, generated rather than listed. A list of examples
 * only pins the examples somebody thought of: the shape this pair came apart on
 * - `<scheme>://load/<code>`, where the parser puts `load` in the HOST and the
 * pathname the cleaner rewrites never contains it - was not among the twelve
 * that were listed, and the property was claimed as proven anyway.
 */
const ORIGINS = [
  'https://example.com',
  'https://user.github.io',
  'http://localhost:8081',
  'multidconnect4://load',
  'multidconnect4://',
  'exp://192.168.0.2:8081',
];
const PATHS = [
  '',
  '/',
  '/multidconnect4/',
  '/game/',
  '/--/',
  '/load/5DC4.abc',
  '/load/5DC4.abc/',
  '/load/5DC4.abc/x',
  '/a/load/5DC4.p/b',
  '/load/5DC4.a/load/5DC4.b',
];
const QUERIES = ['', '?x=1', '?code=5DC4.q', '?x=1&code=5DC4.q'];
const HASHES = ['', '#x', '#code=5DC4.h', '#/load/5DC4.h'];
/**
 * Each shape keeps the scheme and host it was built from, because what the
 * cleaner hands back is an address relative to them and has to be read back
 * through them: `new URL` throws on a bare path, so asking codeFromUrl about
 * the return value on its own answers "no code" whatever the cleaner left in
 * it - which is a property that holds for every possible cleaner.
 */
const SHAPES: { prefix: string; href: string }[] = [];
for (const prefix of ORIGINS) {
  for (const path of PATHS) {
    for (const query of QUERIES) {
      for (const hash of HASHES) SHAPES.push({ prefix, href: prefix + path + query + hash });
    }
  }
}

describe('urlWithoutCode', () => {
  it('leaves nothing a reload could import again, in any shape of link', () => {
    // The pair has to be an inverse of each other over every shape, not over
    // the ones the app writes: whatever codeFromUrl reads out of a link,
    // urlWithoutCode has to be able to take back out of it.
    expect(SHAPES.length).toBeGreaterThan(500);
    let read = 0;
    for (const { prefix, href } of SHAPES) {
      if (codeFromUrl(href) === null) continue;
      read++;
      const next = urlWithoutCode(href);
      // Only null means "there was nothing to strip". The empty string is an
      // address of its own, and one the caller must not be handed: replacing
      // the address with it resolves back to the address the code is in.
      expect(next).not.toBeNull();
      expect(next).not.toBe('');
      expect(codeFromUrl(prefix + next)).toBeNull();
    }
    // Most of them do carry a code; a property nothing satisfies proves nothing.
    expect(read).toBeGreaterThan(SHAPES.length / 2);
  });

  it('keeps the rest of the address', () => {
    expect(urlWithoutCode('https://example.com/game/?code=5DC4.abc&x=1')).toBe('/game/?x=1');
    expect(urlWithoutCode('https://example.com/?code=5DC4.abc')).toBe('/');
  });

  it('says so when there was nothing to strip', () => {
    expect(urlWithoutCode('https://example.com/game/?x=1')).toBeNull();
    expect(urlWithoutCode('not a url')).toBeNull();
  });
});

describe('clearCodeFromUrl', () => {
  // The web build's address bar, stood in for: `window` under this preset is
  // React Native's, with no location and no history on it.
  const g = globalThis as unknown as { window?: unknown };
  let before: unknown;
  beforeEach(() => {
    before = g.window;
  });
  afterEach(() => {
    g.window = before;
  });
  const addressBar = (href: string, replaceState?: jest.Mock) => {
    g.window = { location: { href }, history: replaceState ? { replaceState } : {} };
  };

  it('rewrites the address without the code, keeping the rest of it', () => {
    const replaceState = jest.fn();
    addressBar('https://example.com/game/?code=5DC4.abc&x=1', replaceState);
    clearCodeFromUrl();
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/game/?x=1');
  });

  it('leaves an address that carries no code alone', () => {
    const replaceState = jest.fn();
    addressBar('https://example.com/game/?x=1', replaceState);
    clearCodeFromUrl();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('does nothing where there is no address bar to rewrite', () => {
    addressBar('https://example.com/?code=5DC4.abc');
    expect(() => clearCodeFromUrl()).not.toThrow();
    g.window = undefined;
    expect(() => clearCodeFromUrl()).not.toThrow();
  });
});

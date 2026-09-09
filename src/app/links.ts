/**
 * Deep links carrying a game code: `<scheme>://load?code=…` on a device,
 * `https://…/?code=…` on the web. The code itself is validated by decodeGame.
 * Anyone can hand the app a link, so an absurdly long one is dropped here
 * rather than decoded and replayed.
 */
import { MAX_CODE_LENGTH } from './share';

export function codeFromUrl(url: string | null | undefined): string | null {
  const code = url ? codeIn(url) : null;
  return code && code.length <= MAX_CODE_LENGTH ? code : null;
}

function codeIn(url: string): string | null {
  const match = /[?&#]code=([^&#]+)/.exec(url);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
  const path = /\/load\/([^/?#]+)/.exec(url);
  return path ? path[1] : null;
}

/** A shareable link for the web build, or null when not running on the web. */
export function webLinkFor(code: string): string | null {
  if (typeof window === 'undefined' || !window.location?.origin || window.location.origin.startsWith('null')) return null;
  return `${window.location.origin}${window.location.pathname}?code=${encodeURIComponent(code)}`;
}

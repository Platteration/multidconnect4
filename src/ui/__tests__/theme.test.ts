/**
 * Contrast. The header writes straight on the screen background, with no panel
 * behind it, and the light palette is what a system-light phone gets, so these
 * pairings have to clear WCAG AA on their own.
 *
 * The sibling game's palette test, against this app's palettes. Every skin and
 * piece set is walked as well as both schemes: a premium set that only a
 * purchase draws is a set nobody would see this fail on.
 */
import { HeaderTextStyle, PIECE_SETS, SKINS, Scheme, buildTheme, headerTextStyles } from '../theme';

// The screen cannot be rendered here, so that it draws with these styles and
// not with a copy of them is checked by reading it. Declared locally, as the
// other tests that read a file do.
declare const require: (name: string) => { readFileSync(path: string, encoding: string): string };
declare const __dirname: string;
const source = (file: string): string => require('fs').readFileSync(`${__dirname}/../${file}`, 'utf8');

const SCHEMES: readonly Scheme[] = ['light', 'dark'];

/** WCAG 2.1 relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`not a six-digit hex colour: ${hex}`);
  const value = parseInt(match[1], 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255]
    .map((c) => c / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio: 1 for two identical colours, 21 for black on white. */
function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

/** AA wants 4.5:1, or 3:1 for large text — 18.66px bold, or 24px at any weight. */
function required(style: HeaderTextStyle): number {
  const large = style.fontSize >= 24 || (style.fontSize >= 18.66 && Number(style.fontWeight) >= 700);
  return large ? 3 : 4.5;
}

describe('palette contrast', () => {
  it('measures ratios the way WCAG does', () => {
    // Without this the check below could pass on a broken measurement.
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 4);
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 4);
    expect(contrast('#f3f4fb', '#f3f4fb')).toBeCloseTo(1, 4);
    expect(contrast('#5b6084', '#f3f4fb')).toBeCloseTo(5.55, 2);
    // The colour the header must not go back to on the light palette.
    expect(contrast('#0a9fc6', '#f3f4fb')).toBeCloseTo(2.82, 2);
  });

  it('writes every header line at AA on the background it sits on', () => {
    // 11px at any weight is not large text, so the subtitle needs the full
    // 4.5:1 - which `travel`, the obvious accent to reach for, does not have
    // on the light background.
    const failures: string[] = [];
    for (const scheme of SCHEMES) {
      for (const skin of SKINS) {
        for (const pieces of PIECE_SETS) {
          const theme = buildTheme(scheme, skin.id, pieces.id);
          for (const [name, style] of Object.entries(headerTextStyles(theme))) {
            const ratio = contrast(style.color, theme.background);
            const needed = required(style);
            if (ratio < needed) {
              failures.push(
                `${scheme}/${skin.id}/${pieces.id} ${name}: ${style.color} on ${theme.background} is ${ratio.toFixed(2)}:1, AA needs ${needed}:1`,
              );
            }
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('is measuring the styles the screen actually draws the header with', () => {
    // The point of keeping these in theme.ts is that the screen has no second
    // copy of them; a header that styled itself would pass this test for ever.
    const src = source('GameScreen.tsx');
    expect(src).toMatch(/\.\.\.headerTextStyles\(colors\),/);
    expect(src).not.toMatch(/\btitle: \{ color:/);
    expect(src).not.toMatch(/\bsubtitle: \{ color:/);
  });
});

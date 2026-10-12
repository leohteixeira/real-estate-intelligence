import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

// Semantic inventory: normal text, focus indicators and essential controls. Decorative
// --line separators and disabled controls are deliberately not essential boundaries.
const pairs: readonly (readonly [string, string, number])[] = [
  ...['ink', 'ink-2', 'ink-3', 'enamel-600', 'up', 'down'].flatMap((ink) =>
    ['surface', 'porcelain', 'enamel-50'].map((ground) => [ink, ground, 4.5] as const),
  ),
  ...[
    'enamel-800',
    'enamel-700',
    'enamel-600',
    'zone-centro',
    'zone-oeste',
    'zone-sul',
    'zone-norte',
    'zone-leste',
    'ok',
  ].map((ground) => ['surface', ground, 4.5] as const),
  ['enamel-200', 'enamel-800', 4.5],
  ['here-ink', 'here', 4.5],
  ['warn-ink', 'warn-bg', 4.5],
  ['danger-ink', 'danger-bg', 4.5],
  ['ok-ink', 'ok-bg', 4.5],
  ['enamel-800', 'enamel-100', 4.5],
  ['line-strong', 'surface', 3],
  ['line-strong', 'porcelain', 3],
  ['line-strong', 'enamel-50', 3],
  ['enamel-600', 'surface', 3],
  ['enamel-600', 'porcelain', 3],
  ['here', 'enamel-800', 3],
  // Yellow focus is inherited by plate links and active rail links on these grounds.
  ['here', 'enamel-700', 3],
  ['here', 'enamel-600', 3],
];
function parseTokens(css: string): Map<string, string> {
  const tokens = new Map(
    [...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6});/gi)].map((match) => [match[1]!, match[2]!]),
  );
  if (!tokens.size) throw new Error('No hexadecimal design tokens found');
  return tokens;
}
function luminance(hex: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Invalid token color: ${hex}`);
  const linear = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
}
function contrast(a: string, b: string): number {
  const light = luminance(a);
  const dark = luminance(b);
  return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
}
const tokens = parseTokens(readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8'));
it.each(pairs)('semantic --%s on --%s meets %s:1', (foreground, background, minimum) => {
  expect(tokens.has(foreground), foreground).toBe(true);
  expect(tokens.has(background), background).toBe(true);
  expect(
    contrast(tokens.get(foreground)!, tokens.get(background)!),
    `${foreground}/${background}`,
  ).toBeGreaterThanOrEqual(minimum);
});
it('rejects the original essential border and malformed tokens; verifies WCAG endpoints', () => {
  expect(contrast('#9aa6bb', tokens.get('surface')!)).toBeLessThan(3);
  expect(contrast('#9aa6bb', tokens.get('porcelain')!)).toBeLessThan(3);
  expect(contrast('#9aa6bb', tokens.get('enamel-50')!)).toBeLessThan(3);
  expect(() => parseTokens('--bad: rgb(0, 0, 0)')).toThrow('No hexadecimal');
  expect(() => luminance('#fff')).toThrow('Invalid token');
  expect(contrast('#000000', '#ffffff')).toBe(21);
  expect(contrast('#ffffff', '#000000')).toBe(21);
  expect(contrast('#ffffff', '#ffffff')).toBe(1);
});

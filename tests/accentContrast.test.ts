import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const tokenSource = readFileSync(new URL('../src/theme/tokens.ts', import.meta.url), 'utf8');

function luminance(hex: string): number {
  const channels = hex.match(/[a-f\d]{2}/gi)?.map((channel) => Number.parseInt(channel, 16) / 255) ?? [];
  const [red = 0, green = 0, blue = 0] = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(first: string, second: string): number {
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

test('accent foregrounds meet AA on the least favourable elevated surface', () => {
  const darkElevated = tokenSource.match(/export const darkPalette = \{[\s\S]*?surfaceElevated: '(#[A-F\d]+)'/)?.[1];
  const lightElevated = tokenSource.match(/export const lightPalette = \{[\s\S]*?surfaceElevated: '(#[A-F\d]+)'/)?.[1];
  assert.ok(darkElevated && lightElevated, 'elevated surface tokens must be readable');
  const accents = [...tokenSource.matchAll(/^  (\w+): \{[^\n]*onDark: '(#[A-F\d]+)', onLight: '(#[A-F\d]+)' \},$/gm)];
  assert.equal(accents.length, 5, 'every curated accent must define both scheme foregrounds');
  for (const [, id, onDark, onLight] of accents) {
    assert.ok(contrast(onDark ?? '', darkElevated) >= 4.5, `${id} dark accent foreground`);
    assert.ok(contrast(onLight ?? '', lightElevated) >= 4.5, `${id} light accent foreground`);
  }
});

test('the resolved foreground changes by scheme without changing the accent fill', () => {
  assert.match(tokenSource, /onSurface: mode === 'light' \? accent\.onLight : accent\.onDark/);
  assert.match(tokenSource, /lime: \{[^\n]*accent: '#C7FF4A'[^\n]*onDark: '#C7FF4A', onLight: '#486900'/);
});

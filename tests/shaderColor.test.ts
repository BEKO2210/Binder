import assert from 'node:assert/strict';
import { test } from 'node:test';

import { colorToUnitRgb, colorToUnitRgba } from '../src/lib/shaderColor.ts';
import { accentThemes, darkPalette, lightPalette } from '../src/theme/colorTokens.ts';

test('six-digit hex becomes unit floats', () => {
  assert.deepEqual(colorToUnitRgba('#000000'), [0, 0, 0, 1]);
  assert.deepEqual(colorToUnitRgba('#FFFFFF'), [1, 1, 1, 1]);
  const [red, green, blue, alpha] = colorToUnitRgba('#C7FF4A');
  assert.ok(Math.abs(red - 199 / 255) < 1e-9 && Math.abs(green - 1) < 1e-9 && Math.abs(blue - 74 / 255) < 1e-9);
  assert.equal(alpha, 1);
});

test('shorthand hex and hex with alpha are accepted', () => {
  assert.deepEqual(colorToUnitRgba('#fff'), colorToUnitRgba('#ffffff'));
  const [, , , alpha] = colorToUnitRgba('#00000080');
  assert.ok(Math.abs(alpha - 128 / 255) < 1e-9);
});

test('rgba keeps its alpha, rgb defaults to opaque', () => {
  const [red, green, blue, alpha] = colorToUnitRgba('rgba(4,5,8,0.88)');
  assert.ok(Math.abs(red - 4 / 255) < 1e-9 && Math.abs(green - 5 / 255) < 1e-9 && Math.abs(blue - 8 / 255) < 1e-9);
  assert.equal(alpha, 0.88);
  assert.equal(colorToUnitRgba('rgb(255, 255, 255)')[3], 1);
});

test('the float3 form drops alpha', () => {
  assert.deepEqual(colorToUnitRgb('rgba(255,0,0,0.5)'), [1, 0, 0]);
});

test('an unsupported colour fails loudly instead of rendering black', () => {
  assert.throws(() => colorToUnitRgba('transparent'), /Unsupported colour format/);
  assert.throws(() => colorToUnitRgba('#12g456'), /Unsupported colour format/);
});

test('every colour the loading shader can receive converts', () => {
  const shaderColors = [
    darkPalette.surface, darkPalette.surfaceElevated, darkPalette.canvas,
    lightPalette.surface, lightPalette.surfaceElevated, lightPalette.canvas,
    ...Object.values(accentThemes).flatMap((accent) => [accent.accent, accent.onDark, accent.onLight]),
  ];
  for (const color of shaderColors) {
    const channels = colorToUnitRgb(color);
    assert.equal(channels.length, 3);
    for (const channel of channels) assert.ok(channel >= 0 && channel <= 1, `${color} produced ${channel}`);
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { heartPath, liquidPath, LIQUID_FILL_RATIO } from '../src/lib/liquidHeart.ts';

test('the heart is never quite full, because a full heart stops looking like liquid', () => {
  assert.ok(LIQUID_FILL_RATIO > 0.4 && LIQUID_FILL_RATIO < 0.8);
});

test('the surface path closes into a fillable shape and stays inside the box', () => {
  const path = liquidPath(40, 40, 0, 0);
  assert.match(path, /^M0\.00,/, 'starts at the left edge');
  assert.match(path, /Z$/, 'closes');
  const ys = [...path.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map((m) => Number(m[2]));
  for (const y of ys) assert.ok(y >= -1 && y <= 41, `y ${y} stays inside the box`);
});

test('the wave moves with its phase', () => {
  assert.notEqual(liquidPath(40, 40, 0, 0), liquidPath(40, 40, 1.5, 0), 'phase changes the shape');
});

test('the heart outline is a closed curve sized to its box', () => {
  const path = heartPath(40);
  assert.match(path, /^M20\.00,35\.20/);
  assert.match(path, /Z$/);
  assert.ok(heartPath(80).length === path.length || heartPath(80) !== path, 'scales with size');
});

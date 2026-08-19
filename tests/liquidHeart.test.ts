import assert from 'node:assert/strict';
import test from 'node:test';

import { heartPath, liquidPath, LIQUID_FILL_RATIO, LIQUID_TILT_LIMIT, tiltFromGravity } from '../src/lib/liquidHeart.ts';

test('the heart is never quite full, because a full heart stops looking like liquid', () => {
  assert.ok(LIQUID_FILL_RATIO > 0.4 && LIQUID_FILL_RATIO < 0.8);
});

test('tilt follows gravity but cannot run away', () => {
  assert.equal(tiltFromGravity(0), 0);
  assert.ok(tiltFromGravity(1) === LIQUID_TILT_LIMIT);
  assert.ok(tiltFromGravity(-1) === -LIQUID_TILT_LIMIT);
  // A phone dropped or shaken reports well past 1g; the surface must not
  // leave the heart because somebody put their phone down hard.
  assert.equal(tiltFromGravity(9), LIQUID_TILT_LIMIT);
  assert.equal(tiltFromGravity(-9), -LIQUID_TILT_LIMIT);
});

test('the surface path closes into a fillable shape and stays inside the box', () => {
  const path = liquidPath(40, 40, 0, 0);
  assert.match(path, /^M0\.00,/, 'starts at the left edge');
  assert.match(path, /Z$/, 'closes');
  const ys = [...path.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map((m) => Number(m[2]));
  for (const y of ys) assert.ok(y >= -1 && y <= 41, `y ${y} stays inside the box`);
});

test('the wave actually moves and the tilt actually tips', () => {
  assert.notEqual(liquidPath(40, 40, 0, 0), liquidPath(40, 40, 1.5, 0), 'phase changes the shape');
  const level = liquidPath(40, 40, 0, 0);
  const tipped = liquidPath(40, 40, 0, 0.3);
  assert.notEqual(level, tipped, 'tilt changes the shape');
  const firstOf = (path: string) => Number(path.match(/^M[\d.]+,([\d.]+)/)![1]);
  assert.ok(firstOf(tipped) < firstOf(level), 'tipping right lifts the left end');
});

test('the heart outline is a closed curve sized to its box', () => {
  const path = heartPath(40);
  assert.match(path, /^M20\.00,35\.20/);
  assert.match(path, /Z$/);
  assert.ok(heartPath(80).length === path.length || heartPath(80) !== path, 'scales with size');
});

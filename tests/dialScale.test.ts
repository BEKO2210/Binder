import assert from 'node:assert/strict';
import test from 'node:test';

import { accumulateDragPosition, clampRange, grabOffset, moveRange, pointToPosition, positionToStepIndex, resolveDragTarget, unwrapAngleDelta } from '../src/lib/dialMath.ts';
import { positionToValue, radiusSteps, valueToPosition } from '../src/lib/dialScale.ts';

test('radius scale round-trips every legal value exactly', () => {
  for (const value of radiusSteps) assert.equal(positionToValue(valueToPosition(value)), value);
});

test('radius scale uses 1, 5 and 25 km bands', () => {
  assert.deepEqual(radiusSteps.slice(0, 3), [1, 2, 3]);
  assert.deepEqual(radiusSteps.slice(49, 53), [50, 55, 60, 65]);
  assert.deepEqual(radiusSteps.slice(-3), [450, 475, 500]);
});

test('dial maps its bounded 270 degree arc and parks the dead zone at an end', () => {
  assert.equal(pointToPosition(50, 0, 100), 0.5);
  assert.equal(pointToPosition(100, 50, 100), 5 / 6);
  assert.equal(pointToPosition(50, 100, 100), 0);
  assert.equal(positionToStepIndex(0.5, 11), 5);
});

test('continuous dragging clamps at both endpoints without wrapping', () => {
  assert.equal(accumulateDragPosition(0.98, 0, Math.PI / 2), 1);
  assert.equal(accumulateDragPosition(1, Math.PI / 2, Math.PI), 1);
  assert.equal(accumulateDragPosition(1, Math.PI, Math.PI - 0.1), 1 - 0.1 / (Math.PI * 1.5));
  assert.equal(accumulateDragPosition(0.02, 0, -Math.PI / 2), 0);
  assert.ok(Math.abs(accumulateDragPosition(0, -Math.PI / 2, -Math.PI / 2 + 0.1) - 0.1 / (Math.PI * 1.5)) < 1e-12);
});

test('angle unwrapping crosses zero by the short delta', () => {
  assert.ok(Math.abs(unwrapAngleDelta(359 * Math.PI / 180, Math.PI / 180) - 2 * Math.PI / 180) < 1e-12);
  assert.ok(Math.abs(unwrapAngleDelta(Math.PI / 180, 359 * Math.PI / 180) + 2 * Math.PI / 180) < 1e-12);
});

test('range clamping enforces bounds and minimum span', () => {
  assert.deepEqual(clampRange(99, 100, 18, 100, 2), [98, 100]);
  assert.deepEqual(clampRange(20, 20, 18, 100, 2), [20, 22]);
  assert.deepEqual(moveRange(24, 38, -20, 18, 100), [18, 32]);
  assert.deepEqual(moveRange(24, 38, 100, 18, 100), [86, 100]);
  assert.deepEqual(clampRange(17, 18, 18, 100, 2), [18, 20]);
  assert.deepEqual(clampRange(100, 101, 18, 100, 2), [98, 100]);
});

test('a touch grabs the handle it landed on, never the other one', () => {
  // The maximum handle sits at 0.8, the minimum at 0.2. A finger at 0.78 must
  // pick up the maximum — the earlier build handed this drag to the minimum and
  // collapsed the range.
  assert.equal(resolveDragTarget(0.78, 0.2, 0.8, true, 0.08), 1);
  assert.equal(resolveDragTarget(0.22, 0.2, 0.8, true, 0.08), 0);
  // Well inside the filled band and away from both handles: move the whole range.
  assert.equal(resolveDragTarget(0.5, 0.2, 0.8, true, 0.08), 2);
  // Single mode only ever has the one handle.
  assert.equal(resolveDragTarget(0.9, 0.2, 0.2, false, 0.08), 0);
  // Collapsed handles still resolve to a handle rather than the band.
  assert.equal(resolveDragTarget(0.5, 0.5, 0.52, true, 0.08), 0);
});

test('the grabbed handle keeps its distance from the finger', () => {
  // Finger 0.02 below the maximum handle: the offset carries that gap along, so
  // the handle does not teleport under the thumb on the first frame.
  assert.ok(Math.abs(grabOffset(1, 0.78, 0.2, 0.8) - 0.02) < 1e-12);
  assert.ok(Math.abs(grabOffset(0, 0.22, 0.2, 0.8) + 0.02) < 1e-12);
  assert.equal(grabOffset(2, 0.5, 0.2, 0.8), 0.2 - 0.5);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveDurations, resolvePressScale, resolveSpring, resolveStaggerDelay } from '../src/lib/motionPolicy.ts';

test('full motion keeps the research-backed duration bands', () => {
  const d = resolveDurations(false);
  assert.ok(d.feedback >= 200 && d.feedback <= 400, 'feedback must sit in the 200-400ms band');
  assert.ok(d.entrance >= 200 && d.entrance <= 400, 'entrances are still feedback-class motion');
  assert.ok(d.context <= 800, 'context changes must not exceed 800ms');
  assert.ok(d.fast < d.standard && d.standard < d.deliberate, 'scale must be monotonic');
});

test('row stagger is bounded and disappears under reduced motion', () => {
  assert.equal(resolveStaggerDelay(0, false), 0);
  assert.ok(resolveStaggerDelay(2, false) > resolveStaggerDelay(1, false));
  assert.equal(resolveStaggerDelay(100, false), resolveStaggerDelay(5, false));
  assert.equal(resolveStaggerDelay(3, true), 0);
});

test('reduced motion collapses every duration to zero', () => {
  const d = resolveDurations(true);
  for (const value of Object.values(d)) assert.equal(value, 0);
});

test('press scale disappears under reduced motion', () => {
  assert.equal(resolvePressScale(true), 1);
  const scale = resolvePressScale(false);
  assert.ok(scale > 0.9 && scale < 1, 'press scale is a subtle shrink');
});

test('springs stay professional unless celebration is requested', () => {
  const professional = resolveSpring(false, 'professional');
  assert.ok(professional.damping >= 20 && professional.damping <= 30);
  const celebratory = resolveSpring(false, 'celebratory');
  assert.ok(celebratory.damping >= 8 && celebratory.damping < 20);
  const reduced = resolveSpring(true, 'celebratory');
  assert.ok(reduced.damping >= 100, 'reduced motion springs settle without bounce');
});

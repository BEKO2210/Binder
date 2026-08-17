import assert from 'node:assert/strict';
import test from 'node:test';

import { advanceDeck, decideSwipe, discoveryDeckPhysics, isUndoWindowOpen } from '../src/lib/discoveryDeck.ts';

test('swipe commits when distance reaches either side of the threshold', () => {
  const width = 400;
  const threshold = width * discoveryDeckPhysics.distanceRatio;
  assert.equal(decideSwipe(threshold, 0, width), 'right');
  assert.equal(decideSwipe(-threshold, 0, width), 'left');
  assert.equal(decideSwipe(threshold - 1, 0, width), null);
});

test('a fast flick commits in its velocity direction even when short', () => {
  const velocity = discoveryDeckPhysics.velocityThreshold;
  assert.equal(decideSwipe(8, velocity, 400), 'right');
  assert.equal(decideSwipe(-8, -velocity, 400), 'left');
});

test('velocity direction wins when a release reverses direction', () => {
  assert.equal(decideSwipe(120, -discoveryDeckPhysics.velocityThreshold, 400), 'left');
});

test('advancing a deck is immutable and reveals the next profile', () => {
  const deck = ['first', 'second', 'third'] as const;
  assert.deepEqual(advanceDeck(deck), ['second', 'third']);
  assert.deepEqual(deck, ['first', 'second', 'third']);
});

test('undo window includes its boundaries and rejects invalid timestamps', () => {
  assert.equal(isUndoWindowOpen(1_000, 1_000), true);
  assert.equal(isUndoWindowOpen(1_000, 6_000), true);
  assert.equal(isUndoWindowOpen(1_000, 6_001), false);
  assert.equal(isUndoWindowOpen(1_000, 999), false);
});

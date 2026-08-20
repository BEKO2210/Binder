import assert from 'node:assert/strict';
import test from 'node:test';

import { advanceDeck, decideSwipe, discoveryDeckPhysics, isUndoWindowOpen, projectedTranslation, resistedTranslation, stampProgress, stampReveal, stampScale } from '../src/lib/discoveryDeck.ts';

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

test('release decision uses projected position so a reversal does not commit the wrong way', () => {
  assert.equal(decideSwipe(120, -discoveryDeckPhysics.velocityThreshold, 400), 'left');
  assert.equal(projectedTranslation(20, 1_000), 180);
});

test('drag is linear until the edge then applies bounded resistance', () => {
  const edge = 400 * discoveryDeckPhysics.edgeRatio;
  assert.equal(resistedTranslation(edge, 400), edge);
  assert.equal(resistedTranslation(edge + 100, 400), edge + 100 * discoveryDeckPhysics.edgeResistance);
  assert.equal(resistedTranslation(-edge - 100, 400), -edge - 100 * discoveryDeckPhysics.edgeResistance);
});

test('advancing a deck is immutable and reveals the next profile', () => {
  const deck = [{ id: 'first' }, { id: 'second' }, { id: 'third' }] as const;
  assert.deepEqual(advanceDeck(deck), [{ id: 'second' }, { id: 'third' }]);
  assert.deepEqual(deck, [{ id: 'first' }, { id: 'second' }, { id: 'third' }]);
});

test('the deck drops the card that was decided, wherever it sits now', () => {
  const reloaded = [{ id: 'fresh' }, { id: 'decided' }, { id: 'later' }];
  assert.deepEqual(advanceDeck(reloaded, 'decided'), [{ id: 'fresh' }, { id: 'later' }]);
  // The decided card is gone from the reloaded deck: nothing may be dropped.
  assert.deepEqual(advanceDeck([{ id: 'fresh' }], 'decided'), [{ id: 'fresh' }]);
  assert.deepEqual(advanceDeck([{ id: 'decided' }, { id: 'next' }], 'decided'), [{ id: 'next' }]);
});

test('a flick commits the direction of the flick, not the drag it reverses', () => {
  const width = 400;
  const fast = discoveryDeckPhysics.velocityThreshold + 100;
  // Dragged far right, then flicked hard left: the projection is still
  // positive, the user's intent is not.
  assert.equal(decideSwipe(180, -fast, width), 'left');
  assert.equal(decideSwipe(-180, fast, width), 'right');
  // Slow drags still decide by distance.
  assert.equal(decideSwipe(width, 0, width), 'right');
  assert.equal(decideSwipe(-width, 0, width), 'left');
  assert.equal(decideSwipe(4, 0, width), null);
});

test('undo window includes its boundaries and rejects invalid timestamps', () => {
  assert.equal(isUndoWindowOpen(1_000, 1_000), true);
  assert.equal(isUndoWindowOpen(1_000, 6_000), true);
  assert.equal(isUndoWindowOpen(1_000, 6_001), false);
  assert.equal(isUndoWindowOpen(1_000, 999), false);
});

test('the verdict is readable while the card can still come back', () => {
  const width = 1080;
  const decision = width * discoveryDeckPhysics.distanceRatio; // where the card leaves
  // Nothing at rest, and nothing for a twitch.
  assert.equal(stampProgress(0, width, 'right'), 0);
  assert.equal(stampProgress(20, width, 'right'), 0);
  // Solid well before the card commits — half the decision distance.
  assert.equal(stampProgress(width * stampReveal.fullRatio, width, 'right'), 1);
  assert.ok(width * stampReveal.fullRatio < decision / 2 + 1);
  // A swipe one way never shows the other verdict.
  assert.equal(stampProgress(200, width, 'left'), 0);
  assert.equal(stampProgress(-200, width, 'left'), 1);
  assert.equal(stampProgress(-200, width, 'right'), 0);
});

test('the stamp grows into place and stops at full size', () => {
  assert.equal(stampScale(0), stampReveal.restingScale);
  assert.equal(stampScale(1), 1);
  assert.equal(stampScale(2), 1);
  assert.ok(stampScale(0.5) > stampReveal.restingScale && stampScale(0.5) < 1);
});

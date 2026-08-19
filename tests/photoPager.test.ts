import assert from 'node:assert/strict';
import test from 'node:test';

import { adjacentPhotoIndex, clampPhotoIndex, nextPhotoPage, photoPagerPhysics, photosToPreload, photoStatusAfter, resistedPhotoTranslation } from '../src/lib/photoPager.ts';

test('pager navigation clamps at both ends', () => {
  assert.equal(adjacentPhotoIndex(0, 'previous', 3), 0);
  assert.equal(adjacentPhotoIndex(1, 'next', 3), 2);
  assert.equal(adjacentPhotoIndex(2, 'next', 3), 2);
  assert.equal(clampPhotoIndex(8, 0), 0);
});

test('pager preloads adjacent photos without duplicates', () => {
  assert.deepEqual(photosToPreload(['a', 'b', 'c'], 1), ['c', 'a']);
  assert.deepEqual(photosToPreload(['a', 'a'], 0), ['a']);
});

test('a swipe pages when it is far enough or fast enough', () => {
  const width = 400;
  const slow = 0;
  // Short, slow drag snaps back.
  assert.equal(nextPhotoPage(1, -40, slow, width, 4), 1);
  // Past the commit ratio pages forward.
  assert.equal(nextPhotoPage(1, -160, slow, width, 4), 2);
  assert.equal(nextPhotoPage(1, 160, slow, width, 4), 0);
  // A short but fast flick pages in the direction of the flick.
  assert.equal(nextPhotoPage(1, -20, -900, width, 4), 2);
  assert.equal(nextPhotoPage(1, 20, 900, width, 4), 0);
  // Edges hold.
  assert.equal(nextPhotoPage(0, 300, 900, width, 4), 0);
  assert.equal(nextPhotoPage(3, -300, -900, width, 4), 3);
  // A single photo never pages.
  assert.equal(nextPhotoPage(0, -300, -900, width, 1), 0);
});

test('dragging past an edge resists instead of tracking the thumb', () => {
  assert.equal(resistedPhotoTranslation(1, 100, 4), 100);
  assert.equal(resistedPhotoTranslation(0, 100, 4), 100 * photoPagerPhysics.edgeResistance);
  assert.equal(resistedPhotoTranslation(3, -100, 4), -100 * photoPagerPhysics.edgeResistance);
  assert.equal(resistedPhotoTranslation(0, -100, 4), -100);
});

test('a photo that never answers ends as a failure, not as an empty rectangle', () => {
  // Silence is not an error, so nothing used to reach the failure text: the
  // card stayed blank and stayed decidable.
  assert.equal(photoStatusAfter('pending', 'deadline'), 'failed');
  assert.equal(photoStatusAfter('pending', 'loaded'), 'ready');
  assert.equal(photoStatusAfter('pending', 'error'), 'failed');
});

test('a deadline that fires late cannot undo a photo that arrived', () => {
  assert.equal(photoStatusAfter('ready', 'deadline'), 'ready');
  assert.equal(photoStatusAfter('failed', 'deadline'), 'failed');
});

test('a retry puts the photo back into waiting', () => {
  assert.equal(photoStatusAfter('failed', 'retry'), 'pending');
});

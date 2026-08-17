import assert from 'node:assert/strict';
import test from 'node:test';

import { adjacentPhotoIndex, clampPhotoIndex, photosToPreload } from '../src/lib/photoPager.ts';

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

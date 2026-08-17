import assert from 'node:assert/strict';
import test from 'node:test';

import { matchCelebrationPhotoUrls } from '../src/lib/matchCelebrationAssets.ts';

test('celebration preloads both distinct portraits', () => {
  assert.deepEqual(matchCelebrationPhotoUrls('mine', 'theirs'), ['mine', 'theirs']);
});

test('celebration preload ignores missing and duplicate portraits', () => {
  assert.deepEqual(matchCelebrationPhotoUrls(null, 'shared'), ['shared']);
  assert.deepEqual(matchCelebrationPhotoUrls('shared', 'shared'), ['shared']);
});

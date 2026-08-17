import assert from 'node:assert/strict';
import test from 'node:test';

import { profileCompleteness } from '../src/lib/profileCompleteness.ts';

test('profile completeness exposes actionable missing parts', () => {
  const result = profileCompleteness({ photoCount: 1, bio: 'Short', interestCount: 3 });
  assert.equal(result.percent, 33);
  assert.deepEqual(result.items.filter((item) => !item.complete).map((item) => item.key), ['photos', 'bio']);
});

test('profile completeness recognizes a strong profile', () => {
  const result = profileCompleteness({ photoCount: 3, bio: 'A real bio with enough useful detail.', interestCount: 3 });
  assert.equal(result.complete, true);
  assert.equal(result.percent, 100);
});

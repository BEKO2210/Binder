import assert from 'node:assert/strict';
import test from 'node:test';

import { IMAGE_POLICY, imageDecodeSize } from '../src/lib/imagePolicy.ts';

test('thumbnail decode size follows layout density without decoding oversized originals', () => {
  assert.deepEqual(imageDecodeSize(48, 48, 2.625), { width: 126, height: 126 });
  assert.deepEqual(imageDecodeSize(48, 48, 4), { width: 144, height: 144 });
  assert.equal(IMAGE_POLICY.cache, 'immutable');
});

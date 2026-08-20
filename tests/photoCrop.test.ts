import assert from 'node:assert/strict';
import test from 'node:test';

import { coverCrop, PORTRAIT_FOCUS } from '../src/lib/photoCrop.ts';

test('a photo wider than the card is scaled to cover it and stays centred', () => {
  // 1000x1000 into a 300x600 card: it has to grow to 600 tall, and the sides
  // are what gets cut. There is no vertical overflow to move.
  const crop = coverCrop({ width: 1000, height: 1000 }, { width: 300, height: 600 });
  assert.deepEqual(crop, { width: 600, height: 600, translateY: 0 });
});

test('a tall photo is pulled up, because that is where the face is', () => {
  // 1000x2000 into 300x400: covering makes it 300x600, so 200 is hidden.
  // Centred it would hide 100 top and 100 bottom; the focus at 0.38 keeps more
  // of the top instead.
  const crop = coverCrop({ width: 1000, height: 2000 }, { width: 300, height: 400 });
  assert.equal(crop?.width, 300);
  assert.equal(crop?.height, 600);
  assert.equal(crop?.translateY, 200 * (0.5 - PORTRAIT_FOCUS));
  assert.ok(crop!.translateY > 0 && crop!.translateY < 100);
});

test('the pull never goes past the edge, so no gap can appear', () => {
  // An extreme focus asks for more than exists; the clamp keeps the photo
  // covering the card, and the worst case is the plain centred crop.
  const crop = coverCrop({ width: 1000, height: 2000 }, { width: 300, height: 400 }, 0);
  assert.equal(crop?.translateY, 100);
  const other = coverCrop({ width: 1000, height: 2000 }, { width: 300, height: 400 }, 1);
  assert.equal(other?.translateY, -100);
});

test('without a measured photo or a measured card there is nothing to place', () => {
  assert.equal(coverCrop({ width: 0, height: 100 }, { width: 300, height: 400 }), null);
  assert.equal(coverCrop({ width: 100, height: 0 }, { width: 300, height: 400 }), null);
  assert.equal(coverCrop({ width: 100, height: 100 }, { width: 0, height: 400 }), null);
  assert.equal(coverCrop({ width: 100, height: 100 }, { width: 300, height: 0 }), null);
});

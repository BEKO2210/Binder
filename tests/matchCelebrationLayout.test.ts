import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveMatchCelebrationLayout } from '../src/lib/matchCelebrationLayout.ts';

test('412 dp celebration portraits have exact bilateral symmetry', () => {
  const layout = resolveMatchCelebrationLayout({
    screenWidth: 412,
    screenHeight: 915,
    horizontalPadding: 24,
    verticalPadding: 24,
    portraitGap: 24,
    portraitMaxSize: 160,
    portraitMinSize: 64,
    fixedContentHeight: 299,
  });

  assert.equal(layout.portraitSize, 160);
  assert.equal(layout.groupWidth, 344);
  assert.equal(layout.outerOffset, 34);
  assert.equal(layout.leftCenterOffset, -92);
  assert.equal(layout.rightCenterOffset, 92);
  assert.equal(layout.leftCenterOffset + layout.rightCenterOffset, 0);
});

test('limited height scales portraits without changing fixed content', () => {
  const layout = resolveMatchCelebrationLayout({
    screenWidth: 412,
    screenHeight: 430,
    horizontalPadding: 24,
    verticalPadding: 24,
    portraitGap: 24,
    portraitMaxSize: 160,
    portraitMinSize: 64,
    fixedContentHeight: 299,
  });

  assert.equal(layout.portraitSize, 83);
  assert.equal(layout.leftCenterOffset, -layout.rightCenterOffset);
});

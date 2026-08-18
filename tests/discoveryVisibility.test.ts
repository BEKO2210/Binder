import assert from 'node:assert/strict';
import test from 'node:test';

import { discoveryVisibility } from '../src/lib/discoveryVisibility.ts';

test('a profile is only in the deck once its first photo is approved', () => {
  // The server gate reads exactly this, so the screen must not claim otherwise.
  assert.equal(discoveryVisibility([{ position: 0, moderationStatus: 'approved' }]), 'visible');
  assert.equal(discoveryVisibility([{ position: 0, moderationStatus: 'pending' }]), 'awaitingReview');
  assert.equal(discoveryVisibility([{ position: 0, moderationStatus: 'rejected' }]), 'blocked');
  assert.equal(discoveryVisibility([{ position: 0, moderationStatus: 'removed' }]), 'blocked');
  assert.equal(discoveryVisibility([]), 'noPhotos');
});

test('only the first photo decides, however good the others are', () => {
  // Three uploaded photos read as "3 of 3" on the profile. If the first one is
  // still in review, none of that puts the person in a deck.
  assert.equal(discoveryVisibility([
    { position: 0, moderationStatus: 'pending' },
    { position: 1, moderationStatus: 'approved' },
    { position: 2, moderationStatus: 'approved' },
  ]), 'awaitingReview');
  assert.equal(discoveryVisibility([
    { position: 0, moderationStatus: 'approved' },
    { position: 1, moderationStatus: 'rejected' },
  ]), 'visible');
});

test('media without a primary is treated as no photos at all', () => {
  assert.equal(discoveryVisibility([{ position: 1, moderationStatus: 'approved' }]), 'noPhotos');
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { deckIsCovered, discoveryLoadingVisible } from '../src/lib/discoveryOverlays.ts';

const nothingOpen = { filtersOpen: false, safetyOpen: false, profileOpen: false, celebrating: false };

test('the loading animation shows while the deck is searching and uncovered', () => {
  assert.equal(discoveryLoadingVisible(true, nothingOpen), true);
  assert.equal(discoveryLoadingVisible(false, nothingOpen), false);
});

test('nothing of the deck is drawn while a sheet covers it', () => {
  // The reported failure: opening the filter sheet during a search left the
  // sheet's middle hidden behind the aurora.
  assert.equal(discoveryLoadingVisible(true, { ...nothingOpen, filtersOpen: true }), false);
  assert.equal(discoveryLoadingVisible(true, { ...nothingOpen, safetyOpen: true }), false);
  assert.equal(discoveryLoadingVisible(true, { ...nothingOpen, profileOpen: true }), false);
  assert.equal(discoveryLoadingVisible(true, { ...nothingOpen, celebrating: true }), false);
});

test('a covered deck is covered no matter which layer does it', () => {
  assert.equal(deckIsCovered(nothingOpen), false);
  assert.equal(deckIsCovered({ ...nothingOpen, celebrating: true }), true);
});

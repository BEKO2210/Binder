import assert from 'node:assert/strict';
import test from 'node:test';

import { discoveryCountDebounceMs, discoveryPresets, likelyEmptyFilter, matchingDiscoveryPreset } from '../src/lib/discoveryPreferencesPolicy.ts';

test('discovery presets set radius and age together', () => {
  assert.deepEqual(discoveryPresets.map(({ id, minAge, maxAge, distance }) => ({ id, minAge, maxAge, distance })), [
    { id: 'nearby', minAge: 22, maxAge: 36, distance: 10 },
    { id: 'city', minAge: 20, maxAge: 45, distance: 30 },
    { id: 'wide', minAge: 18, maxAge: 60, distance: 100 },
  ]);
});

test('preset match disappears as soon as one exact value changes', () => {
  assert.equal(matchingDiscoveryPreset({ minAge: 22, maxAge: 36, distance: 10 }), 'nearby');
  assert.equal(matchingDiscoveryPreset({ minAge: 22, maxAge: 36, distance: 11 }), null);
  assert.equal(matchingDiscoveryPreset({ minAge: 21, maxAge: 36, distance: 10 }), null);
});

test('count policy uses a deliberate debounce and identifies the tightest likely filter', () => {
  assert.equal(discoveryCountDebounceMs, 450);
  assert.equal(likelyEmptyFilter({ interestedIn: [], minAge: 18, maxAge: 100, distance: 500 }), 'audience');
  assert.equal(likelyEmptyFilter({ interestedIn: ['woman'], minAge: 30, maxAge: 31, distance: 500 }), 'age');
  assert.equal(likelyEmptyFilter({ interestedIn: ['woman'], minAge: 18, maxAge: 100, distance: 1 }), 'distance');
});

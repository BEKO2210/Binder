import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyEmptyDiscovery, filterValuesToCountWith } from '../src/lib/discoveryAvailability.ts';

test('an empty saved-filter count is filtered only when standard values have candidates', () => {
  assert.equal(classifyEmptyDiscovery(0, 3), 'filtered');
  assert.equal(classifyEmptyDiscovery(0, 0), 'genuine');
});

test('a non-empty current count is never described as filtered empty', () => {
  assert.equal(classifyEmptyDiscovery(1, 4), 'genuine');
});

test('freshly applied filters decide the emptiness message, not the ones still in state', () => {
  // The measured failure: applying "no women" emptied the deck, but the count
  // ran with the previous values, so the screen claimed the deck was simply
  // up to date and offered no way back to the filters.
  const applied = { minAge: 30 };
  const inState = { minAge: 18 };
  assert.deepEqual(filterValuesToCountWith(applied, inState), applied);
  assert.deepEqual(filterValuesToCountWith(undefined, inState), inState);
  // Nothing known here means the screen has to ask the server, which is the
  // only case where a read is worth a round trip.
  assert.equal(filterValuesToCountWith(undefined, null), null);
});

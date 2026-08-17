import assert from 'node:assert/strict';
import test from 'node:test';

import { mapDiscoveryPreferences } from '../src/lib/discoveryPreferences.ts';

test('maps the server discovery-preferences row to UI values', () => {
  assert.deepEqual(mapDiscoveryPreferences({
    interested_in: ['woman', 'nonbinary'],
    min_age: 24,
    max_age: 39,
    max_distance_km: 75,
  }), {
    interestedIn: ['woman', 'nonbinary'],
    minAge: 24,
    maxAge: 39,
    distance: 75,
  });
});

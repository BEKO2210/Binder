import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyEmptyDiscovery } from '../src/lib/discoveryAvailability.ts';

test('an empty saved-filter count is filtered only when standard values have candidates', () => {
  assert.equal(classifyEmptyDiscovery(0, 3), 'filtered');
  assert.equal(classifyEmptyDiscovery(0, 0), 'genuine');
});

test('a non-empty current count is never described as filtered empty', () => {
  assert.equal(classifyEmptyDiscovery(1, 4), 'genuine');
});

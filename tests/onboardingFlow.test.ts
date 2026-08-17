import assert from 'node:assert/strict';
import test from 'node:test';

import { hasErrors, onboardingPosition, validateDiscovery, validateIdentity } from '../src/lib/onboardingFlow.ts';

test('onboarding progression reports a stable honest position', () => {
  assert.deepEqual(onboardingPosition('eligibility'), { index: 0, number: 1, total: 5, next: 'identity' });
  assert.deepEqual(onboardingPosition('photo'), { index: 4, number: 5, total: 5, next: null });
});

test('identity validation points to individual fields', () => {
  const errors = validateIdentity('  ', null);
  assert.equal(errors.firstName, 'Enter the first name people should call you.');
  assert.equal(errors.gender, 'Choose how you describe yourself.');
  assert.equal(hasErrors(errors), true);
  assert.equal(hasErrors(validateIdentity('Belkis', 'woman')), false);
});

test('discovery validation describes the invalid control', () => {
  assert.deepEqual(validateDiscovery([], 50, 20, 0), {
    audience: 'Choose at least one group of people to meet.',
    age: 'Choose an age range from 18 to 100.',
    distance: 'Choose a distance from 1 to 500 km.',
  });
  assert.equal(hasErrors(validateDiscovery(['man'], 18, 45, 50)), false);
});

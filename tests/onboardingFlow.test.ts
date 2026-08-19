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

test('the system back gesture walks the onboarding backwards instead of leaving', async () => {
  // Android's back is the navigation control everybody already uses. Without a
  // handler it closed the app mid-signup and threw five screens of work away.
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/screens/OnboardingScreen.tsx', import.meta.url), 'utf8');
  assert.match(source, /BackHandler\.addEventListener\('hardwareBackPress'/);
  assert.match(source, /if \(position\.index === 0 \|\| busy \|\| photoBusy\) return false;/, 'the first step and busy states yield to the system');
  assert.match(source, /goBack\(\);\s*\n\s*return true;/, 'any later step steps back and swallows the event');
});

test('a category opens from its heading, above the chips it reveals', async () => {
  // A toggle underneath a collapsing list moves out from under the finger and
  // leaves the reader somewhere else entirely on the page.
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/components/InterestPicker.tsx', import.meta.url), 'utf8');
  const headingAt = source.indexOf('accessibilityState={{ expanded: isOpen }}');
  const chipsAt = source.indexOf('interestsInCategory(categoryId).map(chip)');
  assert.ok(headingAt > 0 && chipsAt > 0, 'both the heading control and the chip list exist');
  assert.ok(headingAt < chipsAt, 'the control sits above the chips');
  assert.match(source, /minHeight: theme\.layout\.minimumTouchTarget/, 'the heading is a full touch target');
});

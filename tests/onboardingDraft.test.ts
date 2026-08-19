import assert from 'node:assert/strict';
import test from 'node:test';

import { sanitize } from '../src/lib/onboardingDraft.ts';

test('a normal draft comes back as it went in', () => {
  const draft = sanitize({ step: 'profile', birthDate: '1994-03-15', firstName: 'Lena', gender: 'woman', bio: 'Hallo', interests: ['Coffee'], interestedIn: ['man'], minAge: 25, maxAge: 40, distance: 50 });
  assert.equal(draft.firstName, 'Lena');
  assert.equal(draft.birthDate, '1994-03-15');
  assert.deepEqual(draft.interests, ['Coffee']);
  assert.equal(draft.distance, 50);
});

test('a stored draft cannot put the signup into a state its own rules reject', () => {
  // Anything read back from disk is untrusted: an older build, a half-written
  // file, a tampered value.
  const draft = sanitize({ birthDate: 'gestern', gender: 'alien', minAge: 5, maxAge: 900, distance: 99999, interests: 'nope', interestedIn: ['man', 'dragon'], firstName: 'x'.repeat(200) });
  assert.equal(draft.birthDate, undefined);
  assert.equal(draft.gender, undefined);
  assert.equal(draft.minAge, undefined);
  assert.equal(draft.maxAge, undefined);
  assert.equal(draft.distance, undefined);
  assert.equal(draft.interests, undefined);
  assert.deepEqual(draft.interestedIn, ['man'], 'the known values survive, the invented one does not');
  assert.equal(draft.firstName, undefined, 'a name longer than the field allows is dropped');
});

test('an inverted age range is dropped rather than restored', () => {
  const draft = sanitize({ minAge: 50, maxAge: 20 });
  assert.equal(draft.minAge, undefined);
  assert.equal(draft.maxAge, undefined);
});

test('too many interests are cut to what the server accepts', () => {
  const draft = sanitize({ interests: Array.from({ length: 30 }, (_, index) => `i${index}`) });
  assert.equal(draft.interests?.length, 12);
});

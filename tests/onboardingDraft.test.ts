import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('the draft is kept the way the session is kept, and leaves the same way', () => {
  // A birth date, a name and a bio, written down before an account exists, in
  // plain text for as long as the app stayed installed on an abandoned signup.
  const store = readFileSync(new URL('../src/lib/onboardingDraftStore.ts', import.meta.url), 'utf8');
  assert.match(store, /new LargeSecureStore\(\)/);
  assert.doesNotMatch(store, /from '@react-native-async-storage\/async-storage'/);

  // And a half-written profile is exactly what the next person on a shared
  // phone must not find.
  const menu = readFileSync(new URL('../src/screens/MenuScreen.tsx', import.meta.url), 'utf8');
  const signOut = menu.slice(menu.indexOf('async function signOut()'), menu.indexOf('function confirmDeletion()'));
  const deletion = menu.slice(menu.indexOf('async function performDeletion()'), menu.indexOf('return (', menu.indexOf('async function performDeletion()')));
  assert.match(signOut, /clearOnboardingDraft\(\)/);
  assert.equal((deletion.match(/clearOnboardingDraft\(\)/g) ?? []).length, 2);
});

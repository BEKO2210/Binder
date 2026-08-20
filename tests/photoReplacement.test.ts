import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { MAXIMUM_PROFILE_PHOTOS, replacementOrder } from '../src/lib/photoReplacement.ts';

test('a replacement uploads before it deletes whenever there is room', () => {
  // The old photo is only given up once the new one is safely on the server.
  for (const count of [1, 2, 3, 4, 5]) {
    assert.equal(replacementOrder(count), 'upload-first');
  }
});

test('a full gallery has to make room first, and that is the only such case', () => {
  // Six is what the server accepts; a seventh upload would be refused, so there
  // is no way to hold both at once.
  assert.equal(MAXIMUM_PROFILE_PHOTOS, 6);
  assert.equal(replacementOrder(6), 'remove-first');
  assert.equal(replacementOrder(7), 'remove-first');
});

test('the screen deletes only after a confirmed upload', () => {
  // uploadPhoto handles its own errors, so it has to report back — a
  // replacement that cannot tell a finished upload from a failed one would
  // delete the old photo after the new one never arrived.
  const source = readFileSync(new URL('../src/screens/ProfileSettingsScreen.tsx', import.meta.url), 'utf8');
  assert.match(source, /async function uploadPhoto\(image: PreparedImage\): Promise<boolean>/);
  // The removal carries a deadline now, so the call is wrapped — the order it
  // is checked for is unchanged.
  assert.match(source, /if \(!await uploadPhoto\(image\)\) return;\s*\n\s*setBusy\(true\);\s*\n\s*await withDeadline\(removeProfileMedia/);
  // And the order is decided by the tested rule, not by a hand-written check.
  assert.match(source, /replacementOrder\(media\.length\) === 'upload-first'/);
});

test('the profile viewer never shows one person under another person\'s name', () => {
  // It kept the previous profile on screen while the next one loaded, so a
  // route change — a tapped notification, another match — showed somebody
  // else's photos and bio under the name of the person actually opened.
  const source = readFileSync(new URL('../src/screens/PartnerProfileScreen.tsx', import.meta.url), 'utf8');
  assert.match(source, /setProfile\(initialProfile && initialProfile\.id === userId \? asPartnerProfile\(initialProfile\) : null\)/);
  // The head start from the deck is only kept when it is the same person, and
  // a stale error must not survive the switch either.
  assert.match(source, /setProfile\([\s\S]{0,120}\);\s*\n\s*setError\(''\);/);
});

test('a gallery that failed to load is not reported as an empty gallery', () => {
  // It showed a real person as somebody with no photos at all — a lie about
  // them, and on a dating app a reason to pass. The distance stays optional:
  // one missing line of context is still the truth.
  const source = readFileSync(new URL('../src/lib/partnerProfile.ts', import.meta.url), 'utf8');
  assert.match(source, /if \(mediaResult\.error\) throw mediaResult\.error;/);
  assert.ok(!source.includes('mediaResult.error ? [] :'), 'the failure must not be turned into an empty list');
  assert.match(source, /distanceKm: distanceResult\.error \? null :/, 'distance may still degrade quietly');
});

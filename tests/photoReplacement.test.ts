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
  assert.match(source, /if \(!await uploadPhoto\(image\)\) return;\s*\n\s*setBusy\(true\);\s*\n\s*await removeProfileMedia/);
  // And the order is decided by the tested rule, not by a hand-written check.
  assert.match(source, /replacementOrder\(media\.length\) === 'upload-first'/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { profileCompleteness } from '../src/lib/profileCompleteness.ts';

test('profile completeness exposes actionable missing parts', () => {
  const result = profileCompleteness({ photoCount: 1, bio: 'Short', interestCount: 3 });
  assert.equal(result.percent, 33);
  assert.deepEqual(result.items.filter((item) => !item.complete).map((item) => item.key), ['photos', 'bio']);
});

test('profile completeness recognizes a strong profile', () => {
  const result = profileCompleteness({ photoCount: 3, bio: 'A real bio with enough useful detail.', interestCount: 3 });
  assert.equal(result.complete, true);
  assert.equal(result.percent, 100);
});

test('a finished profile has nothing left to nag about', () => {
  // The card used to stay on screen at 100 % with every line ticked — a
  // checklist telling somebody they are done, on the screen they open to look
  // at themselves.
  const done = profileCompleteness({ photoCount: 3, bio: 'x'.repeat(20), interestCount: 3 });
  assert.equal(done.complete, true);
  const source = readFileSync(new URL('../src/screens/ProfileScreen.tsx', import.meta.url), 'utf8');
  assert.match(source, /\{completeness\.complete \? null : <BinderCard/, 'the whole card goes, not just its button');
});

test('the profile screen no longer carries the settings, the policies or account deletion', () => {
  // They live in the menu tab now. This is the part worth guarding: deleting an
  // account is not something to stumble over while looking at your own photo.
  const profile = readFileSync(new URL('../src/screens/ProfileScreen.tsx', import.meta.url), 'utf8');
  for (const gone of ['deleteCurrentAccount', 'confirmDestructive', 'signOut', 'PRIVACY_URL', 'onOpenSettings']) {
    assert.ok(!profile.includes(gone), `${gone} still sits on the profile screen`);
  }
  const menu = readFileSync(new URL('../src/screens/MenuScreen.tsx', import.meta.url), 'utf8');
  for (const moved of ['deleteCurrentAccount', 'confirmDestructive', 'signOut', 'PRIVACY_URL', 'onOpenSettings']) {
    assert.ok(menu.includes(moved), `${moved} did not arrive in the menu`);
  }
});

test('the profile preview is the same screen a match sees', () => {
  // Rendering a second version of the profile would let the preview drift from
  // the real thing, which is precisely what a preview must not do. The one
  // difference is the distance: the server answers 0 km to yourself, and
  // "0 km away" under your own name reads like a bug.
  const root = readFileSync(new URL('../src/Root.tsx', import.meta.url), 'utf8');
  assert.match(root, /profileRoute === 'preview'[\s\S]*?<PartnerProfileScreen userId=\{session\.user\.id\}[^>]*viewingSelf/);
  const viewer = readFileSync(new URL('../src/screens/PartnerProfileScreen.tsx', import.meta.url), 'utf8');
  assert.match(viewer, /profile\.distanceKm !== null && !viewingSelf/);
});

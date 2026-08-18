import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { sessionIdentityChanged } from '../src/lib/authTransition.ts';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

test('a token refresh for the same person is not an identity change', () => {
  // Supabase emits TOKEN_REFRESHED, USER_UPDATED and SIGNED_IN for a session
  // that was never lost. Treating those as a new sign-in threw away the legal
  // gate, the open chat and the selected tab roughly once an hour, and while a
  // photo was uploading it took the upload screen with it.
  assert.equal(sessionIdentityChanged(ALICE, ALICE), false);
});

test('signing in, signing out and switching account are identity changes', () => {
  assert.equal(sessionIdentityChanged(null, ALICE), true);
  assert.equal(sessionIdentityChanged(ALICE, null), true);
  assert.equal(sessionIdentityChanged(ALICE, BOB), true);
});

test('no session before and none after leaves nothing to discard', () => {
  assert.equal(sessionIdentityChanged(null, null), false);
});

test('only one place in Root may move the signed-in reference, and a stale read may not win', () => {
  // Two failure modes this guards, both of which would put one account's screen
  // under another account's token: a second path that advances the reference
  // without discarding the screen, and the start-up read of the stored session
  // answering after a newer auth event has already been handled.
  const source = readFileSync(new URL('../src/Root.tsx', import.meta.url), 'utf8');
  assert.equal(source.match(/signedInUserRef\.current = /g)?.length, 1, 'exactly one writer');
  assert.match(source, /const applySession = \(nextSession: Session \| null\) => \{/);
  assert.match(source, /if \(!active \|\| sawAuthEvent\) return;/, 'the stored session yields to a live auth event');
  assert.match(source, /sawAuthEvent = true;/);
  // Both paths hand their session to the same function, and there is no third.
  assert.equal(source.match(/applySession\(/g)?.length, 2, 'the stored session and the auth event, nothing else');
  assert.match(source, /applySession\(data\.session\)/, 'the stored session');
  assert.match(source, /applySession\(nextSession\)/, 'the auth event');
});

test('undefined reads the same as no session, so the first event is not a false change', () => {
  // The ref starts undefined before the first auth event arrives. If that read
  // as "somebody was signed in", the very first TOKEN_REFRESHED would reset a
  // freshly restored session.
  assert.equal(sessionIdentityChanged(undefined, undefined), false);
  assert.equal(sessionIdentityChanged(undefined, ALICE), true);
  assert.equal(sessionIdentityChanged(ALICE, undefined), true);
});

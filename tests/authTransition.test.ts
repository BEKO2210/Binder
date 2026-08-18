import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { sessionIdentityChanged } from '../src/lib/authTransition.ts';
import { startupPhase } from '../src/lib/startupState.ts';

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

test('every full-screen start-up read is bounded, and a late answer still lands', () => {
  // Three of these shipped with no ceiling at all: a request on a socket the
  // phone quietly lost does not fail, it waits, and the screen waits with it.
  // The deadline decides only when to stop waiting — the request itself keeps
  // its own handler, because a wrapper that already rejected can never resolve
  // again and would drop an answer that arrives a second late.
  const source = readFileSync(new URL('../src/Root.tsx', import.meta.url), 'utf8');
  assert.match(source, /STARTUP_DEADLINE_MS = 15_000/);
  assert.match(source, /withDeadline\(storedSession, STARTUP_DEADLINE_MS\)/);
  assert.match(source, /withDeadline\(profileRead, STARTUP_DEADLINE_MS\)/);
  // Each read is also awaited directly, which is what makes a late answer count.
  assert.match(source, /void storedSession\s*\n\s*\.then\(/);
  assert.match(source, /void profileRead\s*\n\s*\.then\(/);
  // The builder is resolved once; handing a lazy builder to two watchers would
  // send the query twice.
  assert.match(source, /const profileRead = Promise\.resolve\(/);
  // The failure is routed through the tested decision, so it can never outrank
  // a recovery, a legal gate or a session that answered late.
  assert.match(source, /const sessionPhase = startupPhase\(session !== undefined, startFailed\)/);
  assert.match(source, /const profilePhase = startupPhase\(onboardingComplete !== undefined, startFailed\)/);
});

test('a late answer beats an expired deadline', () => {
  // The failure and the answer race. If the deadline fires at 15s and the
  // session arrives at 16s, the app has a session — showing "Binder could not
  // start" over it would be a lie the person cannot dismiss.
  assert.equal(startupPhase(true, true), 'ready');
  assert.equal(startupPhase(true, false), 'ready');
  assert.equal(startupPhase(false, true), 'failed');
  assert.equal(startupPhase(false, false), 'loading');
});

test('finishing onboarding cannot lock somebody out at the last step', () => {
  // Three server calls with no ceiling: if one never answered, `busy` and the
  // double-tap guard both stayed closed at the exact moment somebody had filled
  // in everything and was trying to get in. No error, no second attempt.
  const source = readFileSync(new URL('../src/screens/OnboardingScreen.tsx', import.meta.url), 'utf8');
  assert.match(source, /ONBOARDING_DEADLINE_MS = 15_000/);
  assert.equal(source.match(/withDeadline\(/g)?.length, 3, 'all three server calls, and only those');
  // The upload keeps no deadline on purpose — a transfer may take a while.
  assert.ok(!/withDeadline\(addProfileImage/.test(source));
  // The guard has to be released whatever happens, or the deadline buys nothing.
  assert.match(source, /finally \{ inFlight\.current = false; setBusy\(false\); \}/);
});

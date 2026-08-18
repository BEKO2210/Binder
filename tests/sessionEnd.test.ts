import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { consumeIntentionalSignOut, markIntentionalSignOut, sessionEndDecision } from '../src/lib/sessionEnd.ts';

test('a deliberate sign-out is not an expired session', () => {
  // Tapping sign out and then being told "your session expired" reads as if
  // something went wrong, when the person did exactly what they meant to.
  assert.equal(sessionEndDecision({ intentional: true, hasServerSession: false, unreachable: false }), 'sign-out');
  assert.equal(sessionEndDecision({ intentional: true, hasServerSession: false, unreachable: true }), 'sign-out');
});

test('a tunnel never ends a session', () => {
  // A refresh that could not reach anybody proves nothing, and the cost of
  // guessing wrong is locking somebody out of a working account.
  assert.equal(sessionEndDecision({ intentional: false, hasServerSession: false, unreachable: true }), 'keep');
});

test('a session the server still has is kept', () => {
  assert.equal(sessionEndDecision({ intentional: false, hasServerSession: true, unreachable: false }), 'keep');
});

test('only a reachable server with no session ends it', () => {
  assert.equal(sessionEndDecision({ intentional: false, hasServerSession: false, unreachable: false }), 'expired');
});

test('the intent is consumed once, so a later refresh failure cannot inherit it', () => {
  markIntentionalSignOut();
  assert.equal(consumeIntentionalSignOut(), true);
  assert.equal(consumeIntentionalSignOut(), false);
});

test('Root holds the session until the server answers, and the sign-out button says it meant it', () => {
  // The old code dropped the session immediately and ran the check alongside,
  // so the check could only ever arrive too late to prevent anything.
  const root = readFileSync(new URL('../src/Root.tsx', import.meta.url), 'utf8');
  assert.match(root, /if \(consumeIntentionalSignOut\(\)\) \{ applySession\(null\); return; \}/);
  assert.match(root, /withDeadline\(supabase\.auth\.getSession\(\), STARTUP_DEADLINE_MS\)[\s\S]{0,600}sessionEndDecision\(/);
  // Nothing may fall through to the unconditional drop while the check runs.
  assert.match(root, /\.catch\(\(\) => undefined\); \/\/ No answer is not evidence[\s\S]{0,40}return;/);
  // Every deliberate exit marks itself, or it will be read as an expiry.
  const menu = readFileSync(new URL('../src/screens/MenuScreen.tsx', import.meta.url), 'utf8');
  assert.match(menu, /markIntentionalSignOut\(\);/);
  assert.match(root, /markIntentionalSignOut\(\);\s*\n\s*void supabase\.auth\.signOut\(\)/);
});

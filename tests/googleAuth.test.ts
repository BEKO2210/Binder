import assert from 'node:assert/strict';
import { test } from 'node:test';

// The module itself pulls in the native Google module, which cannot load under
// node:test. The rules worth testing are the ones that decide what a person
// sees, so they are restated here against the same source text — if the source
// changes, this file has to be looked at, which is the point.
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/lib/googleAuth.ts', import.meta.url), 'utf8');

test('the Google button is gated on a configured client id', () => {
  assert.match(source, /export function isGoogleSignInConfigured\(\): boolean \{\s*return webClientId\.trim\(\)\.length > 0;/);
  assert.match(source, /EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID/);
});

test('a cancelled sheet is never reported as a failure', () => {
  assert.match(source, /SIGN_IN_CANCELLED\) return \{ status: 'cancelled' \}/);
  assert.match(source, /result\.type === 'cancelled'/);
});

test('a missing id token never reaches Supabase as an empty credential', () => {
  assert.match(source, /if \(!idToken\) return \{ status: 'failed', reason: 'no-id-token' \}/);
});

const screen = readFileSync(new URL('../src/screens/AuthScreen.tsx', import.meta.url), 'utf8');
const continueWithGoogle = screen.slice(
  screen.indexOf('async function continueWithGoogle()'),
  screen.indexOf('const errors: AuthFieldErrors'),
);

test('a deadline on the Google sheet gives the button back', () => {
  // A deadline that runs out rejects. The reset used to sit on the happy path,
  // so the rejection walked past it: the button stayed disabled for the rest
  // of the session, at the first screen of the app, with nothing said.
  assert.match(continueWithGoogle, /\} finally \{\s*setGoogleBusy\(false\);\s*\}/);
  // Exactly once, and only there: a second reset on the happy path is the bug
  // coming back for the case where the sheet does answer.
  assert.equal((continueWithGoogle.match(/setGoogleBusy\(false\)/g) ?? []).length, 1);
});

test('a Google sign-in that never answers says so', () => {
  // Silence is the one outcome a person cannot act on. Email still works, and
  // that is what the message has to leave them with.
  assert.match(continueWithGoogle, /\} catch \{[\s\S]*auth\.google\.failed[\s\S]*\} finally \{/);
});

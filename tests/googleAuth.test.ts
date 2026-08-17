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

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/screens/MenuScreen.tsx', import.meta.url), 'utf8');
const signOut = source.slice(source.indexOf('async function signOut()'), source.indexOf('function confirmDeletion()'));
const deletion = source.slice(source.indexOf('async function performDeletion()'), source.indexOf('return (', source.indexOf('async function performDeletion()')));

test('signing out stops push for this account on this phone', () => {
  // The token stayed registered, so the dispatcher kept delivering that
  // account's matches and messages to the lock screen of a phone somebody else
  // had just been handed.
  assert.match(signOut, /disablePushNotifications\(\)/);
});

test('a sign-out that failed does not leave the flag behind', () => {
  // The flag is set before the request because the event can arrive during it.
  // Left standing after a failure, the next genuine session end inherits it and
  // drops the person out without asking the server.
  assert.match(signOut, /forgetIntentionalSignOut\(\)/);
});

test('deleting an account is a deliberate end of the session', () => {
  // Without saying so, the sign-out that follows a deletion looked like an
  // expiry: "your session has expired", right after asking for the account to
  // be removed.
  const marked = deletion.indexOf('markIntentionalSignOut()');
  const call = deletion.indexOf('deleteCurrentAccount()');
  assert.ok(marked > 0 && call > 0 && marked < call, 'the intent is recorded before the request');
});

test('a deletion that runs into its deadline is not called a failure', () => {
  // The request keeps running on the server, so the account may well be gone.
  // Only a real refusal takes the intent back.
  assert.match(deletion, /if \(!isDeadlineError\(error\)\) forgetIntentionalSignOut\(\)/);
});

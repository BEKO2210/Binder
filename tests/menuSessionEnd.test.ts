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

test('signing out forgets what this phone agreed to', () => {
  // The acceptance is remembered so a tunnel cannot lock the app out of its own
  // conversations. It belongs to the person who gave it, and leaves with them.
  assert.match(source, /forgetAcceptance\(\)/);
});

test('signing out takes the queued decisions with it', () => {
  // Offline binds and passes ride on disk until the server confirms them.
  // They belong to the account that made them: left behind, the next person to
  // sign in on this phone sends somebody else's decisions under their session.
  assert.match(signOut, /clearPending\(\)/);
});

test('deleting an account leaves no decision waiting on the phone', () => {
  // Both ways out of the request: the account is gone either way, so nothing
  // it decided may still be waiting to be sent.
  const clears = deletion.match(/clearPending\(\)/g) ?? [];
  assert.equal(clears.length, 2, 'the success path and the failure path both clear the queue');
});

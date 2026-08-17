import assert from 'node:assert/strict';
import test from 'node:test';

import { hasAuthErrors, MIN_PASSWORD_LENGTH, validateAuthForm } from '../src/lib/authForm.ts';

test('sign-in asks for an address that could exist and a long enough password', () => {
  assert.deepEqual(validateAuthForm('signin', '', '', ''), {
    email: 'Enter your email address.',
    password: 'Enter your password.',
  });
  assert.equal(validateAuthForm('signin', 'not-an-address', 'longenough', '').email, 'That does not look like an email address.');
  assert.equal(validateAuthForm('signin', 'a@b.de', 'short', '').password, `Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  assert.deepEqual(validateAuthForm('signin', ' a@b.de ', 'longenough', ''), {});
});

test('sign-up refuses a mismatch at the field instead of after submitting', () => {
  assert.equal(validateAuthForm('signup', 'a@b.de', 'longenough', '').confirmPassword, 'Repeat your password.');
  assert.equal(validateAuthForm('signup', 'a@b.de', 'longenough', 'longenoughX').confirmPassword, 'The two passwords do not match.');
  assert.deepEqual(validateAuthForm('signup', 'a@b.de', 'longenough', 'longenough'), {});
});

test('the confirm field is only a sign-up concern', () => {
  assert.equal(validateAuthForm('signin', 'a@b.de', 'longenough', 'whatever').confirmPassword, undefined);
  assert.equal(hasAuthErrors(validateAuthForm('signin', 'a@b.de', 'longenough', '')), false);
  assert.equal(hasAuthErrors(validateAuthForm('signup', 'a@b.de', 'longenough', '')), true);
});

test('a reset only needs an address the person could actually own', () => {
  assert.deepEqual(validateAuthForm('reset', 'a@b.de', '', ''), {});
  assert.equal(validateAuthForm('reset', '', '', '').email, 'Enter your email address.');
  assert.equal(validateAuthForm('reset', 'nope', '', '').email, 'That does not look like an email address.');
  // Asking for the forgotten password would be absurd, so neither field blocks.
  assert.equal(validateAuthForm('reset', 'a@b.de', '', '').password, undefined);
  assert.equal(validateAuthForm('reset', 'a@b.de', '', '').confirmPassword, undefined);
});

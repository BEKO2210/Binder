import assert from 'node:assert/strict';
import test from 'node:test';

import { parseRecoveryCallback } from '../src/lib/deepLinks.ts';

test('accepts a recovery PKCE code callback', () => {
  assert.deepEqual(parseRecoveryCallback('binder://reset-password?code=code_123'), { code: 'code_123' });
});

test('rejects callbacks outside the exact recovery endpoint', () => {
  assert.equal(parseRecoveryCallback('https://example.test/reset-password?code=code_123'), null);
  assert.equal(parseRecoveryCallback('binder://evil?code=code_123'), null);
  assert.equal(parseRecoveryCallback('binder://reset-password/extra?code=code_123'), null);
});

test('rejects bearer tokens, incomplete, duplicate, and mixed callbacks', () => {
  assert.equal(parseRecoveryCallback('binder://reset-password#access_token=a.b.c&refresh_token=x&type=recovery'), null);
  assert.equal(parseRecoveryCallback('binder://reset-password'), null);
  assert.equal(parseRecoveryCallback('binder://reset-password?code=abc&code=def'), null);
  assert.equal(parseRecoveryCallback('binder://reset-password?code=abc&type=recovery'), null);
});

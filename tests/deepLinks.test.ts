import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { parseAuthCallback, parseRecoveryCallback } from '../src/lib/deepLinks.ts';

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

test('the confirmation callback is parsed, and only from Binder\'s own scheme', () => {
  assert.deepEqual(parseAuthCallback('binder://confirm-email?code=code_123'), { kind: 'confirm-email', code: 'code_123' });
  assert.deepEqual(parseAuthCallback('binder://reset-password?code=code_123'), { kind: 'reset-password', code: 'code_123' });
  // A confirmation link must not be able to masquerade as a recovery link:
  // recovery unlocks the "set a new password" screen.
  assert.equal(parseRecoveryCallback('binder://confirm-email?code=code_123'), null);
  assert.equal(parseAuthCallback('https://example.test/confirm-email?code=code_123'), null);
  assert.equal(parseAuthCallback('binder://confirm-email#access_token=abc'), null);
  assert.equal(parseAuthCallback('binder://confirm-email?code=code_123&next=/evil'), null);
});

test('a link that arrives twice is exchanged once', () => {
  // A cold start hands the same link to getInitialURL and to the url event. A
  // PKCE code may be exchanged once, so the second attempt failed and told the
  // person the link was invalid — after the first had signed them in.
  const root = readFileSync(new URL('../src/Root.tsx', import.meta.url), 'utf8');
  const effect = root.slice(root.indexOf('const handled = new Set<string>();'), root.indexOf("Linking.addEventListener('url'"));
  const claim = effect.indexOf('handled.add(callback.code);');
  const exchange = effect.indexOf('await supabase.auth.exchangeCodeForSession');
  assert.match(effect, /if \(handled\.has\(callback\.code\)\) return;/);
  assert.ok(claim > 0 && exchange > claim, 'the code is claimed before the first await, not after it');
});

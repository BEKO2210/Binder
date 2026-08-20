import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { freshIdentityState, PER_IDENTITY_FIELDS } from '../src/lib/identityReset.ts';

test('a new person starts on the deck with nothing of the last one', () => {
  const fresh = freshIdentityState();
  assert.equal(fresh.tab, 'discover');
  assert.equal(fresh.activeMatch, null);
  assert.equal(fresh.profileRoute, 'home');
  assert.equal(fresh.menuRoute, 'home');
  assert.equal(fresh.loadError, '');
});

test('a password recovery belongs to the identity that started it', () => {
  // This is the bug the list exists for: the flag survived an account change,
  // and the next person to sign in on the phone was sent into a reset they
  // never asked for.
  assert.equal(freshIdentityState().recovering, false);
  assert.ok(PER_IDENTITY_FIELDS.includes('recovering'));
});

test('the screen applies every field the reset names', () => {
  // The list is only worth something if Root uses all of it. A field added here
  // and forgotten there is exactly how this went wrong once.
  const source = readFileSync(new URL('../src/Root.tsx', import.meta.url), 'utf8');
  const reset = source.slice(source.indexOf('if (!identityChanged) return;'), source.indexOf('if (!identityChanged) return;') + 1200);
  for (const field of PER_IDENTITY_FIELDS) {
    const setter = `set${field.charAt(0).toUpperCase()}${field.slice(1)}(`;
    assert.ok(reset.includes(setter), `Root does not reset ${field} when the identity changes`);
  }
});

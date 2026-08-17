process.env.TZ = 'UTC';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readFileSync } from 'node:fs';

import { prepareSafetyNotice } from '../src/lib/safetyNotice.ts';

test('shows a warning with its locale-formatted date', () => {
  const result = prepareSafetyNotice({
    account_status: 'active',
    warned: true,
    warning_reason: 'Please review the community rules.',
    warned_at: '2026-08-17T12:00:00Z',
    suspended_reason: null,
  }, 'en');
  assert.deepEqual(result, { kind: 'warning', reason: 'Please review the community rules.', date: '17 August 2026' });
});

test('does not show an active account without a warning', () => {
  assert.equal(prepareSafetyNotice({
    account_status: 'active', warned: false, warning_reason: null, warned_at: null, suspended_reason: null,
  }, 'en'), null);
});

test('the first authenticated call after sign-in retries once before it accuses the account', () => {
  const source = readFileSync(new URL('../src/lib/safety.ts', import.meta.url), 'utf8');
  const gate = source.slice(source.indexOf('export async function getLegalGate'));
  assert.match(gate, /for \(let attempt = 0; ; attempt \+= 1\)/);
  assert.match(gate, /if \(attempt >= 1\)/, 'the retry is bounded — one extra attempt, not a loop');
  assert.match(gate, /setTimeout\(resolve, 600\)/);
});

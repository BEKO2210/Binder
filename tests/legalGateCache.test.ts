import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { acceptanceApplies } from '../src/lib/legalGateCache.ts';

const cached = { userId: 'u1', termsVersion: '2026-08-15', privacyVersion: '2026-08-15', acceptedAt: 1 };

test('a remembered acceptance counts for the same person and the same versions', () => {
  assert.equal(acceptanceApplies(cached, 'u1', { terms: '2026-08-15', privacy: '2026-08-15' }), true);
});

test('new terms mean the gate appears again', () => {
  // This is the rule that keeps the cache from becoming a way around the gate:
  // a policy change has to be seen, offline or not.
  assert.equal(acceptanceApplies(cached, 'u1', { terms: '2026-09-01', privacy: '2026-08-15' }), false);
  assert.equal(acceptanceApplies(cached, 'u1', { terms: '2026-08-15', privacy: '2026-09-01' }), false);
});

test('somebody else on the same phone agreed to nothing', () => {
  assert.equal(acceptanceApplies(cached, 'u2', { terms: '2026-08-15', privacy: '2026-08-15' }), false);
});

test('without an answer about versions there is nothing to apply', () => {
  assert.equal(acceptanceApplies(cached, 'u1', null), false);
  assert.equal(acceptanceApplies(null, 'u1', { terms: '2026-08-15', privacy: '2026-08-15' }), false);
});

test('a slow answer is treated like no answer, not like a refusal', () => {
  // Five cold starts in a row made the policy check time out, and the app put a
  // wall in front of a phone that had already agreed to exactly these versions.
  // The cache was consulted for "offline" but not for "too slow", although both
  // mean the same thing to the person holding the phone.
  const source = readFileSync(new URL('../src/Root.tsx', import.meta.url), 'utf8');
  assert.match(source, /if \(\(offline \|\| timedOut\) && session\?\.user\.id\) \{/);
  // And the wall still stands for an answer that actually arrived and said no.
  assert.match(source, /if \(!legalGate\.accepted\) return <LegalGateScreen/);
});

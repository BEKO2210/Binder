import assert from 'node:assert/strict';
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

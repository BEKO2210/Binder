import assert from 'node:assert/strict';
import test from 'node:test';

import { outcomeForConfirmation, outcomeForFailure, outcomeForQueueFailure, shouldReloadDeck } from '../src/lib/decisionOutcome.ts';

test('a confirmed decision lets the card go and nothing else', () => {
  const outcome = outcomeForConfirmation(false);
  assert.equal(outcome.dismiss, true);
  assert.equal(outcome.queue, false);
  assert.equal(outcome.springBack, false);
  assert.equal(outcome.error, null);
});

test('a confirmed match carries the match through', () => {
  assert.equal(outcomeForConfirmation(true).matched, true);
});

test('no network means the card leaves, but only after it is stored', () => {
  // This is the pair that was wrong: the decision was thrown away before it was
  // written, so an app closed in the same second lost it.
  const outcome = outcomeForFailure(new TypeError('Network request failed'));
  assert.equal(outcome.dismiss, true);
  assert.equal(outcome.queue, true);
  assert.equal(outcome.springBack, false);
});

test('an ended session brings the card back and says so', () => {
  const outcome = outcomeForFailure({ code: '42501', message: 'permission denied' });
  assert.equal(outcome.sessionExpired, true);
  assert.equal(outcome.springBack, true);
  assert.equal(outcome.dismiss, false);
});

test('a refusal brings the card back with a reason', () => {
  const outcome = outcomeForFailure(new Error('bad request: invalid decision'));
  assert.equal(outcome.springBack, true);
  assert.equal(outcome.dismiss, false);
  assert.ok(outcome.error);
});

test('a failed queue write keeps the card', () => {
  const outcome = outcomeForQueueFailure(new Error('storage full'));
  assert.equal(outcome.springBack, true);
  assert.equal(outcome.dismiss, false);
  assert.ok(outcome.error);
});

test('the deck only reloads on the last card, and waits for a celebration', () => {
  assert.equal(shouldReloadDeck(5, false), 'no');
  assert.equal(shouldReloadDeck(1, false), 'now');
  assert.equal(shouldReloadDeck(1, true), 'after-celebration');
});

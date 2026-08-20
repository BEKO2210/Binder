import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/screens/DiscoveryScreen.tsx', import.meta.url), 'utf8');

test('a card only leaves after its decision is on disk', () => {
  // Offline, the decision goes into a queue on disk and the card leaves as it
  // would have. Queuing without waiting meant an app closed in the same second
  // lost the decision: the card was gone from the deck and the profile either
  // never came back or came back as if nothing had been decided.
  const branch = source.slice(source.indexOf('if (shouldKeepAfterFailure(failure.kind))'));
  const queued = branch.indexOf('await queueDecision(');
  const dismissed = branch.indexOf('finishDismiss(');
  assert.ok(queued > 0, 'the offline branch still queues the decision');
  assert.ok(dismissed > 0, 'the offline branch still dismisses the card');
  assert.ok(queued < dismissed, 'the decision is stored before the card is thrown away');
  // A queue write that fails must bring the card back rather than lose it.
  const failure = branch.indexOf('springBack()');
  assert.ok(failure > 0 && failure < dismissed, 'a failed queue write springs the card back');
});

test('the queue write itself is awaited, not fired and forgotten', () => {
  assert.doesNotMatch(source, /void queueDecision\(/);
});

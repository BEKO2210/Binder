import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/screens/DiscoveryScreen.tsx', import.meta.url), 'utf8');

test('a card only leaves after its decision is on disk', () => {
  // Offline, the decision goes into a queue on disk and the card leaves as it
  // would have. Queuing without waiting meant an app closed in the same second
  // lost the decision: the card was gone from the deck and the profile either
  // never came back or came back as if nothing had been decided.
  //
  // The rule now lives in src/lib/decisionOutcome.ts, which has its own tests;
  // what this file protects is the order of the effects in the screen.
  const effects = source.slice(source.indexOf('async function applyOutcome'));
  const queued = effects.indexOf('await queueDecision(');
  const dismissed = effects.indexOf('finishDismiss(');
  const springs = effects.indexOf('springBack();');
  assert.ok(queued > 0, 'the screen still writes the decision to disk');
  assert.ok(dismissed > 0, 'the screen still dismisses the card');
  assert.ok(queued < dismissed, 'the decision is stored before the card is thrown away');
  assert.ok(springs > 0 && springs < dismissed, 'a failed queue write springs the card back');
});

test('the queue write itself is awaited, not fired and forgotten', () => {
  assert.doesNotMatch(source, /void queueDecision\(/);
});

test('the first deck load survives a cold start', () => {
  // Twice on a freshly installed app the very first request took longer than
  // the deadline, and somebody who had just signed up was told Binder had
  // taken too long before they saw a single card. One silent second attempt
  // covers the wake-up; an unreachable server still fails.
  assert.match(source, /withRetry\(\(\) => withDeadline\(fetchDiscoveryBatch\(20\), DISCOVERY_DEADLINE_MS\), \{ attempts: 2/);
});

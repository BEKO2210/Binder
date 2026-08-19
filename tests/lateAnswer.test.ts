import assert from 'node:assert/strict';
import test from 'node:test';

import { askFor, openGate, stillWaitingFor, stopWaiting } from '../src/lib/lateAnswer.ts';

test('an answer that arrives while the screen still waits may act', () => {
  const gate = openGate();
  const ticket = askFor(gate);
  assert.equal(stillWaitingFor(gate, ticket), true);
});

test('an answer that arrives after the person left may not act', () => {
  // The exact sequence measured on the device: ask, dismiss, answer. Without
  // the gate the reply opened a chat twenty-five seconds after the celebration
  // had been closed.
  const gate = openGate();
  const ticket = askFor(gate);
  stopWaiting(gate);
  assert.equal(stillWaitingFor(gate, ticket), false);
});

test('a second request makes the first one stale', () => {
  const gate = openGate();
  const first = askFor(gate);
  const second = askFor(gate);
  assert.equal(stillWaitingFor(gate, first), false);
  assert.equal(stillWaitingFor(gate, second), true);
});

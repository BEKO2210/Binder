import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

const root = readFileSync(new URL('../src/Root.tsx', import.meta.url), 'utf8');

test('a tapped notification never waits forever', () => {
  // The route stays set while the chat target resolves, which is right — and
  // is exactly why the request needs an end. A fetch that never answered left
  // the route pending for the rest of the session: the tap did nothing, and
  // tapping again hit the guard and did nothing either.
  const from = root.indexOf('// Keep the pending route set while the chat target resolves');
  assert.ok(from > 0, 'the notification route effect moved');
  const effect = root.slice(from, root.indexOf('return () => { active = false; };', from));
  assert.match(effect, /withDeadline\(fetchMatches\(\), STARTUP_DEADLINE_MS\)/);
  assert.match(effect, /\.finally\(\(\) => \{\s*if \(active\) setPendingNotificationRoute\(null\);/);
});

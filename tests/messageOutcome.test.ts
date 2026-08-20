import assert from 'node:assert/strict';
import test from 'node:test';

import { outcomeForDelivery, outcomeForSendFailure } from '../src/lib/messageOutcome.ts';

const mounted = { mounted: true };

test('a delivered message stops being an attempt', () => {
  const outcome = outcomeForDelivery();
  assert.equal(outcome.discard, true);
  assert.equal(outcome.persist, false);
});

test('no network keeps the message on screen and on disk', () => {
  // The one this app was rebuilt around: typed in a tunnel, app closed at the
  // station, delivered when the phone found signal.
  const outcome = outcomeForSendFailure(new TypeError('Network request failed'), mounted);
  assert.equal(outcome.keepAsFailed, true);
  assert.equal(outcome.persist, true);
  assert.equal(outcome.discard, false);
  assert.ok(outcome.error);
});

test('a conversation that ended takes its unsent messages with it', () => {
  const outcome = outcomeForSendFailure(new Error('This conversation is no longer active.'), mounted);
  assert.equal(outcome.conversationEnded, true);
  assert.equal(outcome.discard, true);
  assert.equal(outcome.persist, false, 'nothing may keep waiting for a conversation that is over');
});

test('an ended session is not a failed message', () => {
  const outcome = outcomeForSendFailure({ code: '42501', message: 'permission denied' }, mounted);
  assert.equal(outcome.sessionExpired, true);
  assert.equal(outcome.discard, true);
  assert.equal(outcome.keepAsFailed, false);
});

test('a screen that went away decides nothing', () => {
  const abort = new Error('Aborted');
  abort.name = 'AbortError';
  assert.equal(outcomeForSendFailure(abort, mounted).ignore, true);
  assert.equal(outcomeForSendFailure(new Error('anything'), { mounted: false }).ignore, true);
});

test('a bug in our own code is not treated as a tunnel', () => {
  // classifyRequestFailure draws that line; this checks the send path keeps it,
  // because "offline, retrying" hid a real fault for as long as the screen was
  // open.
  const outcome = outcomeForSendFailure(new TypeError('undefined is not an object'), mounted);
  assert.equal(outcome.error?.kind, 'unknown');
  assert.equal(outcome.keepAsFailed, true);
});

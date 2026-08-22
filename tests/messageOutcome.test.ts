import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

const chat = readFileSync(new URL('../src/screens/ChatScreen.tsx', import.meta.url), 'utf8');
const sendPaths = ['async function submitMessage', 'async function submitVoice', 'async function retryVoice'];

test('no send is gated on a state that arrives a render too late', () => {
  // `sending` reaches the function after the next render, and two taps beat a
  // render. Each tap made its own client message id, so the server's
  // idempotency had nothing to match on: the same sentence, twice, in a
  // conversation with somebody the person had just matched with.
  for (const start of sendPaths) {
    const from = chat.indexOf(start);
    assert.ok(from > 0, start);
    const body = chat.slice(from, chat.indexOf('sendingRef.current = true;', from));
    assert.match(body, /sendingRef\.current\) return;/, `${start} does not check the ref before sending`);
    assert.doesNotMatch(body, /\|\| sending\)|\(sending\)/, `${start} still gates on the render-late state`);
  }
});

test('every send path gives the guard back, however it ends', () => {
  const releases = chat.match(/\} finally \{ sendingRef\.current = false;/g) ?? [];
  assert.equal(releases.length, sendPaths.length);
});

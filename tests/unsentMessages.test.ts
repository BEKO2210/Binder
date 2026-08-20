import assert from 'node:assert/strict';
import test from 'node:test';

import { addUnsent, forgetUnsentMatch, removeUnsent, unsentInOrder, type UnsentStore } from '../src/lib/unsentMessages.ts';

const message = (clientId: string, createdAt: number, body = 'hallo') => ({ clientId, body, createdAt });

test('a message that could not be sent is kept per conversation', () => {
  // It used to live only as long as the process: killing the app while offline
  // threw away something the person had already pressed send on.
  const store = addUnsent({}, 'm1', message('a', 1));
  assert.equal(store.m1?.length, 1);
  assert.equal(addUnsent(store, 'm2', message('b', 2)).m1?.length, 1);
});

test('a retry that fails again does not queue the same message twice', () => {
  const once = addUnsent({}, 'm1', message('a', 1));
  const twice = addUnsent(once, 'm1', message('a', 5));
  assert.equal(twice.m1?.length, 1);
  assert.equal(twice.m1?.[0]?.createdAt, 5);
});

test('what was written first goes out first', () => {
  let store: UnsentStore = {};
  store = addUnsent(store, 'm1', message('second', 20));
  store = addUnsent(store, 'm1', message('first', 10));
  assert.deepEqual(unsentInOrder(store, 'm1').map((entry) => entry.clientId), ['first', 'second']);
});

test('a delivered message leaves the queue, and an empty conversation leaves no key', () => {
  const store = addUnsent({}, 'm1', message('a', 1));
  assert.deepEqual(removeUnsent(store, 'm1', 'a'), {});
  assert.deepEqual(forgetUnsentMatch(store, 'm1'), {});
});

test('a failed voice take keeps its length, so the retry can succeed', () => {
  // Without the duration the retry sent zero, the server refused anything under
  // a second, and the recording sat there with a retry button that could never
  // work.
  const store = addUnsent({}, 'm-voice', { clientId: 'v1', body: '', localUri: 'file:///take.m4a', durationMs: 4200 });
  const [entry] = store['m-voice'] ?? [];
  assert.equal(entry?.durationMs, 4200);
  assert.equal(entry?.localUri, 'file:///take.m4a');
});

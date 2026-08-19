import assert from 'node:assert/strict';
import test from 'node:test';

import { addPending, nextToSend, removePending, shouldKeepAfterFailure, type PendingDecision } from '../src/lib/decisionQueue.ts';
import { classifyError, deadlineError } from '../src/lib/reliability.ts';

const entry = (id: string, at: number, decision: 'bind' | 'pass' = 'bind'): PendingDecision => ({ targetUserId: id, decision, decidedAt: at });

test('a decision waits instead of being lost', () => {
  const queue = addPending([], entry('a', 1));
  assert.equal(queue.length, 1);
  assert.equal(queue[0]?.decision, 'bind');
});

test('the same person is never queued twice', () => {
  // A retry that appends would ask the server the same question again.
  const queue = addPending(addPending([], entry('a', 1)), entry('a', 2, 'pass'));
  assert.equal(queue.length, 1);
  assert.equal(queue[0]?.decision, 'pass', 'the newer decision wins');
});

test('decisions leave in the order they were made', () => {
  const queue = [entry('later', 200), entry('earlier', 100)];
  assert.equal(nextToSend(queue)?.targetUserId, 'earlier');
  assert.equal(nextToSend([]), null);
});

test('a confirmed decision leaves the queue', () => {
  const queue = addPending(addPending([], entry('a', 1)), entry('b', 2));
  assert.deepEqual(removePending(queue, 'a').map((item) => item.targetUserId), ['b']);
});

test('only a lost connection is worth retrying', () => {
  // The server refusing (suspended account, ended match, no permission) will
  // refuse again forever; keeping it would retry until the app is reinstalled.
  assert.equal(shouldKeepAfterFailure('offline'), true);
  assert.equal(shouldKeepAfterFailure('timeout'), true);
  assert.equal(shouldKeepAfterFailure('permission-denied'), false);
  assert.equal(shouldKeepAfterFailure('server-refusal'), false);
  assert.equal(shouldKeepAfterFailure('conflict'), false);
});

test('the queue cannot grow without bound', () => {
  let queue: PendingDecision[] = [];
  for (let index = 0; index < 250; index += 1) queue = addPending(queue, entry(`p${index}`, index));
  assert.equal(queue.length, 200);
  assert.equal(queue[0]?.targetUserId, 'p50', 'the oldest fall off, not the newest');
});

test('a request that never answers keeps the decision instead of dropping it', () => {
  // The deck used to wait forever on a stalled socket: no error, no queue, both
  // buttons dead. The deadline is only worth anything if the error it raises
  // lands in the same branch a lost connection lands in.
  assert.equal(classifyError(deadlineError()).kind, 'timeout');
  assert.equal(shouldKeepAfterFailure(classifyError(deadlineError()).kind), true);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { addPending, nextToSend, removePending, shouldKeepAfterFailure, withQueueLock, type PendingDecision } from '../src/lib/decisionQueue.ts';
import { readFileSync } from 'node:fs';
import { classifyError, deadlineError } from '../src/lib/reliability.ts';

const entry = (id: string, at: number, decision: 'bind' | 'pass' = 'bind'): PendingDecision => ({ targetUserId: id, decision, decidedAt: at });

test('a decision waits instead of being lost', () => {
  const queue = addPending([], entry('a', 1));
  assert.equal(queue.length, 1);
  assert.equal(queue[0]?.decision, 'bind');
});

test('the same person is never queued twice', () => {
  // A retry that appends would ask the server the same question again. Which
  // of the two survives changed on purpose: the deck can hand the same profile
  // out again while its decision is still queued, and a second swipe must not
  // quietly replace the answer the person already gave.
  const queue = addPending(addPending([], entry('a', 1)), entry('a', 2, 'pass'));
  assert.equal(queue.length, 1);
  assert.equal(queue[0]?.decision, 'bind', 'the decision that was made first stands');
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

test('the first decision about a person wins', () => {
  // A profile can come back into the deck while its decision is still queued —
  // the server has not seen it yet. Letting the second swipe overwrite the
  // first turned somebody's bind into a pass without telling them.
  const first = addPending([], { targetUserId: 'u1', decision: 'bind', decidedAt: 100 });
  const second = addPending(first, { targetUserId: 'u1', decision: 'pass', decidedAt: 200 });
  assert.equal(second.length, 1);
  assert.equal(second[0]?.decision, 'bind');
  assert.equal(second[0]?.decidedAt, 100);
});

test('different people still queue separately, oldest first', () => {
  let queue = addPending([], { targetUserId: 'a', decision: 'bind', decidedAt: 10 });
  queue = addPending(queue, { targetUserId: 'b', decision: 'pass', decidedAt: 20 });
  assert.equal(queue.length, 2);
  assert.equal(nextToSend(queue)?.targetUserId, 'a');
});

test('two changes to the queue never overlap', async () => {
  // The lost update this exists for: read, await, write back. Overlapping, the
  // second writer's read happens before the first writer's write, and one of
  // the two decisions is gone — off a screen where the card had already left.
  const events: string[] = [];
  const change = (name: string) => withQueueLock(async () => {
    events.push(`${name}:read`);
    await new Promise((resolve) => setTimeout(resolve, 5));
    events.push(`${name}:write`);
  });
  await Promise.all([change('a'), change('b')]);
  assert.deepEqual(events, ['a:read', 'a:write', 'b:read', 'b:write']);
});

test('work that failed under the lock does not block what queued behind it', async () => {
  // A write can fail — storage is full, the disk says no. The queue is retried
  // later; what must not happen is the lock staying held for the session.
  await assert.rejects(withQueueLock(async () => { throw new Error('disk'); }));
  assert.equal(await withQueueLock(async () => 'through'), 'through');
});

const discovery = readFileSync(new URL('../src/screens/DiscoveryScreen.tsx', import.meta.url), 'utf8');
const flush = discovery.slice(discovery.indexOf('const flushPending = useCallback'), discovery.indexOf('// Whatever waited from an earlier session'));

test('the flush never carries the queue across the network', () => {
  // It used to: it read the queue once, sent one decision, and wrote its own
  // stale copy back — over the swipe that had been queued while it waited.
  assert.match(flush, /withQueueLock\(async \(\) => nextToSend\(await loadPending\(\)\)\)/);
  assert.match(flush, /removePending\(await loadPending\(\), entry\.targetUserId\)/);
});

test('a second flush waits for the first instead of sending twice', () => {
  assert.match(flush, /if \(flushing\.current\) return;/);
  assert.match(flush, /\} finally \{\s*flushing\.current = false;\s*\}/);
});

test('a decision made offline does not wait for a tab change', () => {
  // Mounting was the only thing that ever sent the queue. Somebody who swiped
  // in a tunnel and stayed on the deck kept their binds on the phone for as
  // long as they stayed, which is not what an offline queue is for.
  assert.match(discovery, /AppState\.addEventListener\('change', \(state\) => \{\s*if \(state === 'active'\) void flushPending\(\);/);
  assert.match(discovery, /subscription\.remove\(\)/);
});

test('something still waiting is retried without being asked', () => {
  // The app is not told when the connection comes back.
  assert.match(discovery, /if \(pendingCount === 0\) return undefined;/);
  assert.match(discovery, /setInterval\(\(\) => \{ void flushPending\(\); \}, PENDING_RETRY_MS\)/);
  assert.match(discovery, /clearInterval\(timer\)/);
});

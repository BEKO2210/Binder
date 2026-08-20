import assert from 'node:assert/strict';
import test from 'node:test';

import { availableLocales, translate } from '../src/i18n/index.ts';
import { abortable, backoffDelay, classifyError, classifyRequestFailure, deadlineError, isConversationEndedError, isDeadlineError, isLikelyOffline, withDeadline, withRetry } from '../src/lib/reliability.ts';

test('classifies every reliability family with distinct recovery', () => {
  const cases = [
    [new TypeError('Network request failed'), 'offline', 'retry-automatically'],
    [new Error('request timed out'), 'timeout', 'retry'],
    [{ status: 422, message: 'rejected' }, 'server-refusal', 'review-and-retry'],
    [{ code: '42501', message: 'permission denied' }, 'permission-denied', 'sign-in-again'],
    [{ code: '23505', message: 'duplicate key' }, 'conflict', 'refresh'],
    [new Error('surprise'), 'unknown', 'report-problem'],
  ] as const;
  for (const [input, kind, recovery] of cases) {
    const result = classifyError(input);
    assert.equal(result.kind, kind);
    assert.equal(result.recovery, recovery);
    assert.ok(result.messageKey.startsWith('reliability.'));
  }
  assert.equal(new Set(cases.map(([input]) => classifyError(input).messageKey)).size, cases.length);
  assert.equal(new Set(cases.map(([input]) => classifyError(input).recovery)).size, cases.length);
});

test('bounded retry backs off and stops after success', async () => {
  let calls = 0;
  const delays: number[] = [];
  const result = await withRetry(async () => {
    calls += 1;
    if (calls < 3) throw new TypeError('Failed to fetch');
    return 'ok';
  }, { attempts: 3, baseDelayMs: 100, sleep: async (delay) => { delays.push(delay); } });
  assert.equal(result, 'ok');
  assert.equal(calls, 3);
  assert.deepEqual(delays, [100, 200]);
  assert.equal(backoffDelay(9, 1_000), 8_000);
});

test('non-retryable errors do not retry', async () => {
  let calls = 0;
  await assert.rejects(withRetry(async () => { calls += 1; throw { status: 403 }; }, { attempts: 3, sleep: async () => undefined }));
  assert.equal(calls, 1);
});

test('abortable rejects immediately when its signal aborts', async () => {
  const controller = new AbortController();
  const pending = abortable(new Promise<string>(() => undefined), controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('a foreign-key violation is refused, not reported as a concurrent edit', () => {
  assert.equal(classifyError({ code: '23503', message: 'insert or update violates foreign key constraint' }).kind, 'server-refusal');
  assert.equal(classifyError({ code: '23505', message: 'duplicate key value violates unique constraint' }).kind, 'conflict');
  assert.equal(classifyError({ code: '23503' }).retryable, false);
});

test('recognizes only server-confirmed terminal conversation errors', () => {
  assert.equal(isConversationEndedError(new Error('This conversation is no longer active.')), true);
  assert.equal(isConversationEndedError({ code: '42501', message: 'Active match membership required.' }), true);
  assert.equal(isConversationEndedError(new Error('Network request failed')), false);
});

test('a request that never reached the server counts as offline', () => {
  // Transport failures differ by platform; what they share is the absence of a
  // server answer. A refusal always carries a code or a status.
  assert.equal(isLikelyOffline(new Error('Network request failed')), true);
  assert.equal(isLikelyOffline({ message: 'connection closed' }), true);
  assert.equal(isLikelyOffline({ code: '42501', message: 'Admin permission required.' }), false);
  assert.equal(isLikelyOffline({ status: 500, message: 'server exploded' }), false);
  assert.equal(isLikelyOffline({ statusCode: 400, message: 'bad request' }), false);
});

test('a deadline turns a request that never answers into an error with a way out', async () => {
  // A fetch on a socket the phone lost does not fail — it waits. The screen
  // behind it waits with it, and on the first screen after sign-in that leaves
  // a full-screen loading state with no retry and no message.
  await assert.rejects(
    withDeadline(new Promise(() => {}), 40),
    (error: unknown) => classifyError(error).kind === 'timeout',
  );
  // And it waits for its deadline rather than giving up at once: a request that
  // answers inside the ceiling still wins. Comparing wall-clock time here made
  // the gate flaky — a timer may fire a hair before Date.now() agrees — so the
  // race itself is the assertion.
  const answered = new Promise((resolve) => setTimeout(() => resolve('answered'), 10));
  assert.equal(await withDeadline(answered, 40), 'answered');
});

test('a deadline passes a result and a failure straight through', async () => {
  assert.equal(await withDeadline(Promise.resolve('gate'), 1_000), 'gate');
  await assert.rejects(withDeadline(Promise.reject(new Error('refused')), 1_000), /refused/);
});

test('only this module\'s own deadline counts as one', () => {
  // The shared offline rule stays as it was: the SIGNED_OUT check reads "no
  // server answer" as a tunnel, not as an ended session, and a caller that set
  // its own deadline must not change that for everybody else.
  assert.equal(isDeadlineError(deadlineError()), true);
  assert.equal(isDeadlineError(new Error('request timed out')), false);
  assert.equal(isDeadlineError({ message: 'timeout' }), false);
  // Any library may raise a TimeoutError; only this module's own one counts.
  const impostor = new Error('some other library gave up');
  impostor.name = 'TimeoutError';
  assert.equal(isDeadlineError(impostor), false);
  // And the marker must not accidentally answer the offline question.
  assert.equal(isLikelyOffline(deadlineError()), true);
  assert.equal(isLikelyOffline(new Error('Network request failed')), true);
});


test('every reliability message exists in every language', () => {
  // These are the sentences a person sees whenever the network or the server
  // misbehaves, which is often enough that they were the most visible English
  // left in the app. A key without a translation renders as the key itself.
  const kinds = ['offline', 'timeout', 'server-refusal', 'permission-denied', 'conflict', 'unknown'] as const;
  for (const { code } of availableLocales()) {
    for (const kind of kinds) {
      const key = classifyError({ code: 'x', message: kind }).messageKey;
      const text = translate(code, key);
      assert.ok(text && text !== key, `${code} is missing ${key}`);
    }
  }
  for (const kind of kinds) {
    const key = `reliability.${kind.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())}`;
    for (const { code } of availableLocales()) {
      const text = translate(code, key);
      assert.ok(text && text !== key, `${code} is missing ${key}`);
    }
  }
});

test('every screen that blocks on a network read has a ceiling on the wait', async () => {
  // The diagnostics recorded profile_load failing after 8.7 seconds — not a
  // server error, but the system giving up on requests the app was willing to
  // wait for indefinitely, with a spinner and no way out until then.
  const { readFileSync } = await import('node:fs');
  const profile = readFileSync(new URL('../src/screens/ProfileScreen.tsx', import.meta.url), 'utf8');
  assert.match(profile, /PROFILE_DEADLINE_MS = 12_000/);
  assert.match(profile, /withDeadline\(Promise\.all\(\[/, 'the three parallel reads share one deadline');
  // And the failure has a way out: the screen already offers a retry.
  assert.match(profile, /kind="error" icon="retry"|kind={loadError\.kind === 'offline' \? 'offline' : 'error'} icon="retry"/);
});

test('a lost connection reads as offline even when it says nothing recognisable', () => {
  // Sending in airplane mode told the person that something unexpected had
  // happened and asked them to report it — twice on one screen.
  assert.equal(classifyRequestFailure('CHANNEL_ERROR').kind, 'offline');
  assert.equal(classifyRequestFailure(new Error('')).kind, 'offline');
  // Anything the server answered keeps its own classification.
  assert.equal(classifyRequestFailure({ code: '42501', message: 'permission denied' }).kind, 'permission-denied');
  assert.equal(classifyRequestFailure({ status: 400, message: 'bad request' }).kind, 'server-refusal');
});

test('a bug in our own code is not reported as the phone being offline', () => {
  // Everything without a server answer counts as offline, which is right for a
  // request that never arrived. A TypeError from a mistake in the request path
  // used to fall into the same bucket and be retried automatically, hiding the
  // fault behind a message about the person's connection.
  assert.equal(classifyRequestFailure(new TypeError('undefined is not an object (evaluating \'row.id\')')).kind, 'unknown');
  assert.equal(classifyRequestFailure(new ReferenceError('supabase is not defined')).kind, 'unknown');
  // The transport failure React Native reports keeps reading as offline.
  assert.equal(classifyRequestFailure(new TypeError('Network request failed')).kind, 'offline');
  // And a request that simply never answered still counts as offline.
  assert.equal(classifyRequestFailure({ message: 'no answer' }).kind, 'offline');
});

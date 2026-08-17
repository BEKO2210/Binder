import assert from 'node:assert/strict';
import test from 'node:test';

import { abortable, backoffDelay, classifyError, withRetry } from '../src/lib/reliability.ts';

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
    assert.ok(result.message.length > 0);
  }
  assert.equal(new Set(cases.map(([input]) => classifyError(input).message)).size, cases.length);
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

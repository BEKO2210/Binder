process.env.TZ = 'UTC';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildChatTimeline, dayLabel, timeLabel } from '../src/lib/chatTimeline.ts';

const ref = new Date('2026-08-16T18:00:00Z');

function msg(id: string, sender: string, at: string) {
  return { id, sender_id: sender, body: id, created_at: at };
}

test('messages inside five minutes from one sender form a group', () => {
  const items = buildChatTimeline([
    msg('a', 'u1', '2026-08-16T10:00:00Z'),
    msg('b', 'u1', '2026-08-16T10:02:00Z'),
    msg('c', 'u1', '2026-08-16T10:20:00Z'),
  ], ref);
  const messages = items.filter((item) => item.type === 'message');
  assert.deepEqual(messages.map((item) => item.type === 'message' && item.groupedWithPrevious), [false, true, false]);
  assert.deepEqual(messages.map((item) => item.type === 'message' && item.showsTimestamp), [false, true, true]);
});

test('a sender change breaks the group', () => {
  const items = buildChatTimeline([
    msg('a', 'u1', '2026-08-16T10:00:00Z'),
    msg('b', 'u2', '2026-08-16T10:01:00Z'),
  ], ref);
  const messages = items.filter((item) => item.type === 'message');
  assert.deepEqual(messages.map((item) => item.type === 'message' && item.groupedWithPrevious), [false, false]);
});

test('every calendar day gets exactly one separator', () => {
  const items = buildChatTimeline([
    msg('a', 'u1', '2026-08-15T23:50:00Z'),
    msg('b', 'u1', '2026-08-16T00:05:00Z'),
    msg('c', 'u2', '2026-08-16T09:00:00Z'),
  ], ref);
  const days = items.filter((item) => item.type === 'day');
  assert.equal(days.length, 2);
  assert.deepEqual(days.map((item) => item.type === 'day' && item.label), ['Yesterday', 'Today']);
});

test('day labels resolve today, yesterday and full dates', () => {
  assert.equal(dayLabel('2026-08-16T08:00:00Z', ref), 'Today');
  assert.equal(dayLabel('2026-08-15T08:00:00Z', ref), 'Yesterday');
  assert.equal(dayLabel('2026-07-01T08:00:00Z', ref), '1 July 2026');
});

test('time labels are zero-padded 24h clock values', () => {
  assert.match(timeLabel('2026-08-16T09:05:00Z'), /^\d{2}:\d{2}$/);
});

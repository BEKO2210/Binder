process.env.TZ = 'UTC';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatCount, formatDayLabel, formatDistanceKm, formatTime } from '../src/lib/format.ts';

const now = new Date('2026-08-17T00:00:00Z');

test('time follows the locale while retaining the existing 24-hour clock', () => {
  const date = new Date('2026-08-17T09:05:00Z');
  assert.equal(formatTime(date, 'en'), '09:05');
  assert.equal(formatTime(date, 'de'), '09:05');
});

test('day labels handle midnight, yesterday at 23:59 and older dates', () => {
  assert.equal(formatDayLabel(new Date('2026-08-17T00:00:00Z'), 'en', now), 'today');
  assert.equal(formatDayLabel(new Date('2026-08-16T23:59:00Z'), 'de', now), 'yesterday');
  assert.equal(formatDayLabel(new Date('2026-08-14T12:00:00Z'), 'en', now), 'Friday');
  assert.equal(formatDayLabel(new Date('2026-08-09T12:00:00Z'), 'en', now), '9 August 2026');
  assert.equal(formatDayLabel(new Date('2026-08-09T12:00:00Z'), 'de', now), '9. August 2026');
});

test('metric distances localize only the number', () => {
  for (const km of [0, 1, 999]) {
    assert.equal(formatDistanceKm(km, 'en'), String(km));
    assert.equal(formatDistanceKm(km, 'de'), String(km));
  }
  assert.equal(formatDistanceKm(1.5, 'en'), '1.5');
  assert.equal(formatDistanceKm(1.5, 'de'), '1,5');
});

test('counts use locale grouping', () => {
  assert.equal(formatCount(1234, 'en'), '1,234');
  assert.equal(formatCount(1234, 'de'), '1.234');
});

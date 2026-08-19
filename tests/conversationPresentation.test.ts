process.env.TZ = 'UTC';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { composerBody, previewTimeLabel, shouldShowConnectionNotice, splitConversationPreviews } from '../src/lib/conversationPresentation.ts';

test('composer accepts only a trimmed server-valid body', () => {
  assert.equal(composerBody('   '), null);
  assert.equal(composerBody('  hello  '), 'hello');
  assert.equal(composerBody('x'.repeat(2001)), null);
});

test('new matches are separated and unread conversations lead read ones', () => {
  const result = splitConversationPreviews([
    { matchId: 'read', matchedAt: '2026-08-01T00:00:00Z', lastMessageAt: '2026-08-17T12:00:00Z', unreadCount: 0 },
    { matchId: 'new', matchedAt: '2026-08-17T13:00:00Z', lastMessageAt: null, unreadCount: 0 },
    { matchId: 'unread', matchedAt: '2026-08-01T00:00:00Z', lastMessageAt: '2026-08-16T12:00:00Z', unreadCount: 1 },
  ]);
  assert.deepEqual(result.newMatches.map((item) => item.matchId), ['new']);
  assert.deepEqual(result.conversations.map((item) => item.matchId), ['unread', 'read']);
});

test('preview time uses time today and a compact date otherwise', () => {
  const reference = new Date('2026-08-17T18:00:00Z');
  assert.match(previewTimeLabel('2026-08-17T09:05:00Z', 'en', reference), /09:05/);
  assert.equal(previewTimeLabel('2026-08-16T09:05:00Z', 'en', reference), 'yesterday');
});

test('one lost connection is reported once, not beside the message and above it', () => {
  assert.equal(shouldShowConnectionNotice('offline', ['offline']), false);
  assert.equal(shouldShowConnectionNotice('offline', []), true);
  // A different problem is a different sentence and deserves its own line.
  assert.equal(shouldShowConnectionNotice('offline', ['server-refusal']), true);
  assert.equal(shouldShowConnectionNotice(null, ['offline']), false);
});

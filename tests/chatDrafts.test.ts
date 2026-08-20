import assert from 'node:assert/strict';
import test from 'node:test';

import { forgetAllChats, forgetChat, recallAttempts, recallDraft, rememberAttempts, rememberDraft } from '../src/lib/chatDrafts.ts';

test('a half-written message survives leaving the chat', () => {
  rememberDraft('m1', 'Hey, ich wollte fragen');
  assert.equal(recallDraft('m1'), 'Hey, ich wollte fragen');
});

test('drafts are kept apart per conversation', () => {
  rememberDraft('m1', 'an Anna');
  rememberDraft('m2', 'an Ben');
  assert.equal(recallDraft('m1'), 'an Anna');
  assert.equal(recallDraft('m2'), 'an Ben');
  assert.equal(recallDraft('m3'), '');
});

test('emptying the field forgets the draft rather than storing whitespace', () => {
  rememberDraft('m4', 'etwas');
  rememberDraft('m4', '   ');
  assert.equal(recallDraft('m4'), '');
});

test('failed sends survive too, including a recording that never uploaded', () => {
  rememberAttempts('m5', [{ clientId: 'c1', body: 'ging nicht raus' }, { clientId: 'c2', body: '', localUri: 'file:///take.m4a' }]);
  const recalled = recallAttempts('m5');
  assert.equal(recalled.length, 2);
  assert.equal(recalled[1]?.localUri, 'file:///take.m4a', 'the recording itself is what a retry needs');
});

test('an ended conversation takes its leftovers with it', () => {
  rememberDraft('m6', 'text');
  rememberAttempts('m6', [{ clientId: 'c3', body: 'x' }]);
  forgetChat('m6');
  assert.equal(recallDraft('m6'), '');
  assert.deepEqual(recallAttempts('m6'), []);
});

test('the chat screen actually uses the store, and a tap no longer opens the menu', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/screens/ChatScreen.tsx', import.meta.url), 'utf8');
  assert.match(source, /useState\(\(\) => recallDraft\(match\.matchId\)\)/, 'the composer starts from the stored draft');
  assert.match(source, /rememberDraft\(match\.matchId, composerRef\.current\)/, 'and hands it back on the way out');
  assert.match(source, /forgetChat\(match\.matchId\)/, 'an ended conversation keeps nothing');
  // The hint says "hold"; a tap that also opens the menu fires while somebody
  // is scrolling or reaching for a play button inside a voice bubble.
  assert.ok(!/onPress=\{\(\) => \{\s*\n\s*if \(longPressHandled/.test(source), 'no tap handler on the bubble');
  assert.match(source, /onLongPress=\{\(\) => onOpenActions\(messageId, body, mine, true, Boolean\(voice\)\)\}/);
  assert.match(source, /isVoice \? \[\] : \[\{ text: t\('chat\.actions\.copy'\)/, 'copy is not offered for audio');
});

test('signing out leaves no drafts or attempts on the phone', () => {
  rememberDraft('m-out', 'halb geschriebener Satz');
  rememberAttempts('m-out', [{ clientId: 'c9', body: 'ging nicht raus' }]);
  forgetAllChats();
  assert.equal(recallDraft('m-out'), '');
  assert.deepEqual(recallAttempts('m-out'), []);
});

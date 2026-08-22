import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { availableLocales, translate } from '../src/i18n/index.ts';
import { VOICE_MAX_DURATION_MS, VOICE_MIN_DURATION_MS, formatVoiceDuration, interruptedTakeAction, recordingStopDecision, voiceObjectPath, waveformHeights } from '../src/lib/voiceMessage.ts';

test('the object path is exactly what the reference guard accepts', () => {
  // The guard compares split_part(path,'/',1) to the match and 2 to the
  // sender; a drifted client path would upload fine and then fail to send.
  assert.equal(voiceObjectPath('m-1', 'u-2', 'f-3'), 'm-1/u-2/f-3.m4a');
});

test('the client bounds match the server constraint', () => {
  assert.equal(VOICE_MIN_DURATION_MS, 1000);
  assert.equal(VOICE_MAX_DURATION_MS, 60000);
  assert.equal(recordingStopDecision(999), 'too-short');
  assert.equal(recordingStopDecision(1000), 'ready');
});

test('durations format as minutes and padded seconds', () => {
  assert.equal(formatVoiceDuration(0), '0:00');
  assert.equal(formatVoiceDuration(37_200), '0:37');
  assert.equal(formatVoiceDuration(60_000), '1:00');
  assert.equal(formatVoiceDuration(-5), '0:00');
});

test('the waveform is deterministic per message and bounded', () => {
  const first = waveformHeights('message-a', 24);
  assert.deepEqual(waveformHeights('message-a', 24), first, 'same seed, same shape');
  assert.notDeepEqual(waveformHeights('message-b', 24), first, 'different message, different shape');
  assert.equal(first.length, 24);
  for (const height of first) assert.ok(height >= 0.25 && height <= 1, `bar height ${height} stays visible and inside the row`);
});

test('every voice string exists in every language', () => {
  const keys = [
    'chat.voice.recording', 'chat.voice.preparing', 'chat.voice.pending', 'chat.voice.uploading',
    'chat.voice.loadFailed', 'chat.voice.permissionTitle', 'chat.voice.permissionBody',
    'chat.voice.accessibility.record', 'chat.voice.accessibility.finish', 'chat.voice.accessibility.discard',
    'chat.voice.accessibility.play', 'chat.voice.accessibility.pause',
    'matches.voiceMessage',
    'identity.voiceIntro.title', 'identity.voiceIntro.copy', 'identity.voiceIntro.record',
    'identity.voiceIntro.replace', 'identity.voiceIntro.delete',
    'identity.voiceIntro.saveFailed', 'identity.voiceIntro.deleteFailed',
  ];
  for (const { code } of availableLocales()) {
    for (const key of keys) {
      const text = translate(code, key);
      assert.ok(text && text !== key, `${code} is missing ${key}`);
    }
  }
});

test('leaving the app keeps a take worth keeping and drops a stub', () => {
  // Backgrounding used to leave the recorder running: the counter kept
  // counting while the microphone was gone, so seventy-five seconds away came
  // back as eleven seconds of audio, and the one-minute cap sends by itself.
  assert.equal(interruptedTakeAction(VOICE_MIN_DURATION_MS), 'keep');
  assert.equal(interruptedTakeAction(30_000), 'keep');
  assert.equal(interruptedTakeAction(VOICE_MIN_DURATION_MS - 1), 'discard');
  assert.equal(interruptedTakeAction(0), 'discard');
});

test('a waveform is one silence to a screen reader, not thirty', () => {
  // importantForAccessibility="no" hides the view and leaves its children
  // announced: TalkBack read out thirty-odd unlabelled views between the play
  // button and the duration. "no-hide-descendants" is the one that means what
  // the name of the other one suggests.
  const bubble = readFileSync(new URL('../src/components/VoiceMessageBubble.tsx', import.meta.url), 'utf8');
  assert.match(bubble, /importantForAccessibility="no-hide-descendants"/);
  assert.doesNotMatch(bubble, /importantForAccessibility="no"/);
});

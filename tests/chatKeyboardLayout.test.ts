import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/screens/ChatScreen.tsx', import.meta.url), 'utf8');

test('the chat header does not ride the keyboard', () => {
  // The whole screen used to be translated by the keyboard's height, so
  // opening the composer took the back arrow, the name and the safety menu
  // off the top edge and pushed the content under the system status bar.
  // Only what sits below the header may move.
  const header = source.indexOf('<BinderScreenHeader');
  const shift = source.indexOf('keyboardShift]}');
  assert.ok(header > 0, 'the chat still has a screen header');
  assert.ok(shift > 0, 'the chat is still driven by the keyboard animation');
  assert.ok(header < shift, 'the header is rendered outside the keyboard-shifted region');
});

test('the keyboard-shifted region clips what it moves out of view', () => {
  assert.match(source, /overflow: 'hidden' \}, keyboardShift\]/);
});

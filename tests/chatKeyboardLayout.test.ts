import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { conversationKeyboardPadding } from '../src/lib/chatKeyboardLayout.ts';

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

test('the keyboard shrinks the region instead of sliding it', () => {
  // Sliding moved the clipping box along with the content, so the messages
  // rode up over the header and painted on top of it. Padding keeps every
  // edge where it belongs.
  assert.match(source, /paddingBottom: conversationKeyboardPadding\(keyboard\.height\.value, insets\.bottom\)/);
  assert.doesNotMatch(source, /translateY: keyboard\.height\.value/);
});

test('the keyboard does not pay for the navigation bar twice', () => {
  // The screen is padded by the safe-area inset already. Adding the keyboard's
  // full height on top of it left a dead strip between the text field and the
  // keys — 48dp on a phone with the three-button navigation bar.
  assert.equal(conversationKeyboardPadding(-960, 48), 912);
  // Closed keyboard: nothing to add, and never a negative padding.
  assert.equal(conversationKeyboardPadding(0, 48), 0);
  // Mid-animation, while the keyboard is still shorter than the bar it will
  // cover, the composer must not be pushed downwards.
  assert.equal(conversationKeyboardPadding(-20, 48), 0);
  // A screen without a bottom inset gets the full height.
  assert.equal(conversationKeyboardPadding(-960, 0), 960);
});

test('a short bubble is as wide as its text, not as its timestamp', () => {
  // The bubble and the "00:15 · Sent" line are siblings in a column. Without an
  // explicit alignSelf the bubble stretches to the widest sibling, so "Fesh"
  // came out as a bubble half full of empty accent colour.
  const bubble = source.indexOf('paddingHorizontal: theme.spacing.x4,\n          paddingVertical: theme.spacing.x3');
  assert.ok(bubble > 0, 'the message bubble still sets its own padding');
  const before = source.slice(Math.max(0, bubble - 400), bubble);
  assert.match(before, /alignSelf: mine \? 'flex-end' : 'flex-start'/);
});

test('the timestamp lines up with the edge of its bubble', () => {
  // An 8dp horizontal margin on the caption pulled it a finger away from the
  // bubble's edge, so every message had two different right edges.
  const stamp = source.indexOf("marginTop: theme.spacing.x1, alignSelf: mine ? 'flex-end' : 'flex-start'");
  assert.ok(stamp > 0, 'the timestamp still follows the bubble it belongs to');
  const style = source.slice(stamp, source.indexOf('}}', stamp));
  assert.doesNotMatch(style, /marginHorizontal/);
});

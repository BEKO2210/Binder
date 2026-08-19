import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/screens/DiscoveryScreen.tsx', import.meta.url), 'utf8');

test('the card behind the top one is neither touchable nor readable', () => {
  // The uiautomator dump listed the second person with all their labels and
  // their photo hot zones while the first card was on screen.
  assert.match(source, /<ProfileCard key=\{nextProfile\.id\}[^>]*behind/);
  assert.match(source, /interactive=\{!back && !behind\}/);
});

test('what a sheet covers is hidden from a screen reader', () => {
  assert.match(source, /accessibilityElementsHidden=\{deckCovered\}/);
  assert.match(source, /importantForAccessibility=\{deckCovered \? 'no-hide-descendants' : 'auto'\}/);
});

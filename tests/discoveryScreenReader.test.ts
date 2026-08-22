import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { availableLocales, translate } from '../src/i18n/index.ts';

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

test('a gesture that cannot be seen is explained', () => {
  // The deck is decided with a swipe and the pager is paged with one. Both
  // have buttons behind them, and neither said so: a screen reader user met
  // two unexplained buttons and a photo that quietly had five more.
  const discovery = readFileSync(new URL('../src/screens/DiscoveryScreen.tsx', import.meta.url), 'utf8');
  assert.match(discovery, /accessibilityHint=\{bind \? t\('discovery\.accessibility\.bindProfileHint'\) : t\('discovery\.accessibility\.passProfileHint'\)\}/);
  const pager = readFileSync(new URL('../src/components/PhotoPager.tsx', import.meta.url), 'utf8');
  assert.match(pager, /accessibilityHint=\{swipeable && count > 1 \? t\('photoPager\.accessibility\.swipeHint'\) : undefined\}/);
});

test('every hint exists in every language', () => {
  for (const locale of availableLocales()) {
    for (const key of ['discovery.accessibility.bindProfileHint', 'discovery.accessibility.passProfileHint', 'photoPager.accessibility.swipeHint']) {
      assert.notEqual(translate(locale.code, key), key, `${locale.code} is missing ${key}`);
    }
  }
});

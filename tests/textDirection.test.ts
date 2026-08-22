import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { isRightToLeft, needsDirectionRestart, tracksLetters } from '../src/i18n/direction.ts';
import { availableLocales } from '../src/i18n/index.ts';
import { untrackedTypography, typography } from '../src/theme/typographyTokens.ts';

test('Arabic runs right to left, and the Latin languages do not', () => {
  assert.equal(isRightToLeft('ar'), true);
  for (const code of ['en', 'de', 'tr', 'pl', 'pt-BR', 'zh-CN', 'ja']) assert.equal(isRightToLeft(code), false, code);
});

test('a region never changes which way a language reads', () => {
  // ar-EG, ar_SA, whatever a device sends: the script decides, not the country.
  for (const tag of ['ar-EG', 'ar_SA', 'AR-ma']) assert.equal(isRightToLeft(tag), true, tag);
});

test('the app restarts only when the layout and the language disagree', () => {
  // React Native lays out once, at start. Restarting when they already agree
  // is an app that never finishes starting.
  assert.equal(needsDirectionRestart('ar', false), true);
  assert.equal(needsDirectionRestart('ar', true), false);
  assert.equal(needsDirectionRestart('en', true), true);
  assert.equal(needsDirectionRestart('en', false), false);
});

test('a joining script is never tracked apart', () => {
  // micro and eyebrow push letters 1.2 and 1.1 points apart. Arabic letters
  // join; pulled apart they stop being a word.
  assert.equal(tracksLetters('ar'), false);
  assert.equal(tracksLetters('en'), true);
  for (const style of Object.values(untrackedTypography)) assert.equal(style.letterSpacing, 0);
  // Same scale otherwise — this is tracking, not a second type system.
  for (const [name, style] of Object.entries(typography)) {
    const untracked = untrackedTypography[name as keyof typeof untrackedTypography];
    assert.equal(untracked.fontSize, style.fontSize, name);
    assert.equal(untracked.lineHeight, style.lineHeight, name);
    assert.equal(untracked.fontFamily, style.fontFamily, name);
  }
});

test('every language that ships is one the layout can be put into', () => {
  // The bug this replaces: Arabic sat in the picker with the whole interface
  // still laid out left to right.
  for (const locale of availableLocales()) assert.equal(typeof isRightToLeft(locale.code), 'boolean');
  assert.ok(availableLocales().some((locale) => isRightToLeft(locale.code)), 'no right-to-left language ships, so this guard means nothing');
});

const provider = readFileSync(new URL('../src/theme/ThemeProvider.tsx', import.meta.url), 'utf8');

test('changing the language puts the layout the right way round', () => {
  assert.match(provider, /applyTextDirection\(locale\)/);
  assert.match(provider, /typography: spacedLetters \? typography : untrackedTypography/);
});

const applier = readFileSync(new URL('../src/lib/textDirection.ts', import.meta.url), 'utf8');

test('right-to-left layout is allowed before anything is measured', () => {
  // Android refuses it otherwise, and the answer is read while the first
  // screen is laid out.
  assert.match(applier, /^I18nManager\.allowRTL\(true\);$/m);
});

test('a restart that cannot happen does not take the app down with it', () => {
  // A development client has no updates module. An unreadable layout for one
  // more launch beats an app that cannot finish starting.
  assert.match(applier, /try \{\s*await Updates\.reloadAsync\(\);\s*\} catch \{\s*return false;\s*\}/);
});

const mirrored: [string, RegExp][] = [
  ['src/screens/DiscoveryScreen.tsx', /position: 'absolute', top: theme\.spacing\.x3, end: theme\.spacing\.x3/],
  ['src/components/PhotoPager.tsx', /move\('previous'\)\} style=\{\{ position: 'absolute', top: theme\.spacing\.x10, bottom: 0, start: 0/],
  ['src/components/PhotoPager.tsx', /move\('next'\)\} style=\{\{ position: 'absolute', top: theme\.spacing\.x10, bottom: 0, end: 0/],
  ['src/components/ui/BinderInput.tsx', /paddingEnd: revealToggle/],
  ['src/components/VerifiedBadge.tsx', /paddingStart: theme\.spacing\.x2/],
];

test('what sits in a corner sits in the corner the language points at', () => {
  // left and right do not move in a right-to-left layout; start and end do.
  // The safety button, the pager's tap zones and the reveal toggle were all
  // pinned to the side the writing does not start on.
  for (const [file, pattern] of mirrored) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(source, pattern, file);
  }
});

test('the swipe stamps stay where the thumb went', () => {
  // A gesture is physical: swiping towards the right shows the bind stamp on
  // the right, in every language. Mirroring that would say the opposite of
  // what the hand just did.
  const discovery = readFileSync(new URL('../src/screens/DiscoveryScreen.tsx', import.meta.url), 'utf8');
  assert.match(discovery, /borderRightWidth: theme\.spacing\.x1[\s\S]*?bindStampStyle/);
  assert.match(discovery, /borderLeftWidth: theme\.spacing\.x1[\s\S]*?passStampStyle/);
});

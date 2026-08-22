import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { PLURAL_CATEGORIES, pluralCategoriesFor, pluralCategory, pluralKey } from '../src/i18n/plural.ts';
import { availableLocales, hasTranslation, translateCount } from '../src/i18n/index.ts';

test('a language gets the number of forms it actually has', () => {
  assert.deepEqual(pluralCategoriesFor('en'), ['one', 'other']);
  assert.deepEqual(pluralCategoriesFor('pl'), ['one', 'few', 'many', 'other']);
  assert.deepEqual(pluralCategoriesFor('ar'), ['zero', 'one', 'two', 'few', 'many', 'other']);
  // Nothing to distinguish is a valid answer, not an empty one.
  assert.deepEqual(pluralCategoriesFor('ja'), ['other']);
});

test('Polish counts in three, and English does not', () => {
  // `count === 1 ? one : other` told a Polish speaker "2 wiadomości" with the
  // form for five and more. Two, three and four are their own sentence.
  assert.equal(pluralCategory('pl', 1), 'one');
  assert.equal(pluralCategory('pl', 3), 'few');
  assert.equal(pluralCategory('pl', 7), 'many');
  assert.equal(pluralCategory('en', 3), 'other');
});

test('Arabic counts in six, including nothing and eleven', () => {
  assert.equal(pluralCategory('ar', 0), 'zero');
  assert.equal(pluralCategory('ar', 1), 'one');
  assert.equal(pluralCategory('ar', 2), 'two');
  assert.equal(pluralCategory('ar', 5), 'few');
  assert.equal(pluralCategory('ar', 11), 'many');
  assert.equal(pluralCategory('ar', 100), 'other');
});

test('a form a language does not carry falls back to other, never to a raw key', () => {
  const exists = (key: string) => key.endsWith('.other');
  assert.equal(pluralKey('a.b', 'pl', 3, exists), 'a.b.other');
  assert.equal(pluralKey('a.b', 'pl', 3, () => true), 'a.b.few');
});

const groups = ['matches.accessibility.unread', 'partnerProfile.photosReviewed', 'discovery.filters.more', 'discovery.pending', 'discoveryFilterSheet.count.person'];

test('every language carries every form it needs for every count on screen', () => {
  for (const locale of availableLocales()) {
    for (const category of pluralCategoriesFor(locale.code)) {
      for (const group of groups) {
        assert.ok(hasTranslation(locale.code, `${group}.${category}`), `${locale.code} is missing ${group}.${category}`);
      }
    }
  }
});

test('a count reads as its own sentence, not as English with a number in it', () => {
  assert.equal(translateCount('en', 'discovery.filters.more', 1, { count: '1' }), '1 more filter');
  assert.equal(translateCount('en', 'discovery.filters.more', 4, { count: '4' }), '4 more filters');
  // The two Polish forms English does not have.
  assert.notEqual(translateCount('pl', 'discovery.filters.more', 3, { count: '3' }), translateCount('pl', 'discovery.filters.more', 8, { count: '8' }));
  assert.notEqual(translateCount('ar', 'discovery.pending', 2, { count: '2' }), translateCount('ar', 'discovery.pending', 8, { count: '8' }));
});

test('a plural group only ever holds plural forms', () => {
  // A stray key inside a group is a string nothing will ever read.
  for (const name of readdirSync(new URL('../src/i18n/locales', import.meta.url))) {
    if (!name.endsWith('.json')) continue;
    const dictionary = JSON.parse(readFileSync(new URL(`../src/i18n/locales/${name}`, import.meta.url), 'utf8')) as Record<string, unknown>;
    for (const group of groups) {
      let node: unknown = dictionary;
      for (const part of group.split('.')) node = (node as Record<string, unknown>)[part];
      for (const key of Object.keys(node as Record<string, unknown>)) {
        assert.ok((PLURAL_CATEGORIES as readonly string[]).includes(key), `${name}: ${group}.${key} is not a plural form`);
      }
    }
  }
});

test('no count is decided by comparing it to one', () => {
  // The rule this replaces, wherever it might come back.
  const offenders: string[] = [];
  for (const entry of readdirSync(new URL('../src', import.meta.url), { recursive: true })) {
    const name = String(entry);
    if (!name.endsWith('.tsx')) continue;
    const source = readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
    for (const match of source.matchAll(/===\s*1\s*\?\s*'[\w.]+'\s*:\s*'[\w.]+'/g)) offenders.push(`src/${name}: ${match[0]}`);
  }
  assert.deepEqual(offenders, []);
});

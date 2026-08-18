import assert from 'node:assert/strict';
import test from 'node:test';

import { INTEREST_CATALOG, INTEREST_CATEGORIES, INTEREST_SELECTION_LIMIT, catalogLabelKey, interestEntry, interestsInCategory } from '../src/lib/interestCatalog.ts';
import { INTERESTS } from '../src/lib/validation.ts';
import { translate } from '../src/i18n/index.ts';

test('every id is unique and every entry carries a real emoji', () => {
  const ids = new Set<string>();
  for (const item of INTEREST_CATALOG) {
    assert.ok(!ids.has(item.id), `duplicate id ${item.id}`);
    ids.add(item.id);
    // A broken paste shows up as replacement characters or plain ASCII — an
    // emoji is at least one character outside the basic plane or a symbol.
    assert.ok(item.emoji.length > 0, `${item.id} has no emoji`);
    assert.ok(!item.emoji.includes('�'), `${item.id} has a corrupted emoji`);
    assert.ok(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/u.test(item.emoji), `${item.id} emoji "${item.emoji}" is not pictographic`);
  }
});

test('no interest emoji collides with the banned control glyphs', () => {
  // verify-phase6-design bans a specific set in screens; the catalogue is data,
  // but shipping one of these as an interest would defeat the point of the ban.
  const banned = ['♥', '×', '✕', '✖', '⚙', '🔔', '🎨', '🗑'];
  for (const item of INTEREST_CATALOG) {
    for (const glyph of banned) {
      assert.ok(!item.emoji.includes(glyph), `${item.id} uses banned glyph ${glyph}`);
    }
  }
});

test('the twelve legacy interests keep their exact stored strings', () => {
  // These values sit in real profile rows. The catalogue must contain each one
  // unchanged, or existing profiles would render as untranslated leftovers.
  for (const legacy of INTERESTS) {
    assert.ok(interestEntry(legacy), `legacy interest ${legacy} missing from the catalogue`);
  }
});

test('every entry and every category has an English label', () => {
  for (const item of INTEREST_CATALOG) {
    const key = catalogLabelKey(item.id);
    const label = translate('en', key);
    assert.ok(label && label !== key, `missing en label for ${item.id}`);
  }
  for (const category of INTEREST_CATEGORIES) {
    const key = `identity.interestCategories.${category}`;
    const label = translate('en', key);
    assert.ok(label && label !== key, `missing en label for category ${category}`);
  }
});

test('the catalogue is the size and shape the product asked for', () => {
  assert.equal(INTEREST_CATEGORIES.length, 13);
  assert.ok(INTEREST_CATALOG.length >= 250 && INTEREST_CATALOG.length <= 320, `unexpected size ${INTEREST_CATALOG.length}`);
  assert.equal(INTEREST_SELECTION_LIMIT, 10);
  for (const category of INTEREST_CATEGORIES) {
    assert.ok(interestsInCategory(category).length >= 10, `${category} is too thin`);
  }
  // Every entry's category must be a declared category.
  const known = new Set(INTEREST_CATEGORIES);
  for (const item of INTEREST_CATALOG) {
    assert.ok(known.has(item.categoryId), `${item.id} points at unknown category ${item.categoryId}`);
  }
});

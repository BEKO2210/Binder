import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { availableLocales, translate } from '../src/i18n/index.ts';
import {
  attributeLabelKey,
  attributesPayload,
  attributeValueKey,
  clampHeight,
  EMPTY_ATTRIBUTES,
  ENUM_ATTRIBUTES,
  HEIGHT_MAX_CM,
  HEIGHT_MIN_CM,
  rowsFromProfile,
  zodiacLabelKey,
} from '../src/lib/profileAttributes.ts';

const ZODIAC_SIGNS = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'];

test('the client vocabulary is exactly what the migration CHECK constraints accept', () => {
  // The server refuses anything outside its CHECK lists. If this file and the
  // migration drift apart, the editor offers a chip the server rejects — the
  // worst kind of bug, because it only appears on save.
  const migration = readFileSync(new URL('../supabase/migrations/20260819080000_phase10_profile_attributes.sql', import.meta.url), 'utf8');
  for (const field of ENUM_ATTRIBUTES) {
    const match = migration.match(new RegExp(`${field.id} text check \\(${field.id} in \\(([^)]+)\\)\\)`));
    assert.ok(match, `migration defines ${field.id}`);
    const serverValues = [...(match[1] ?? '').matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
    assert.deepEqual([...field.values], serverValues, `${field.id} vocabulary matches the migration`);
  }
  assert.match(migration, new RegExp(`height_cm between ${HEIGHT_MIN_CM} and ${HEIGHT_MAX_CM}`));
});

test('the payload carries only what changed', () => {
  assert.equal(attributesPayload(EMPTY_ATTRIBUTES, EMPTY_ATTRIBUTES), null, 'nothing changed, nothing sent');
  const edited = { ...EMPTY_ATTRIBUTES, smoking: 'never', height_cm: 178 };
  assert.deepEqual(attributesPayload(EMPTY_ATTRIBUTES, edited), { smoking: 'never', height_cm: 178 });
  // Clearing a value sends the key as null — absent would leave it standing.
  assert.deepEqual(attributesPayload(edited, { ...edited, smoking: null }), { smoking: null });
  // A field the editor never touched is absent, so an old value survives a
  // save from a screen that loaded before the attribute existed.
  assert.ok(!('diet' in (attributesPayload(EMPTY_ATTRIBUTES, edited) ?? {})));
});

test('the height stepper cannot leave the server range', () => {
  assert.equal(clampHeight(100), HEIGHT_MIN_CM);
  assert.equal(clampHeight(300), HEIGHT_MAX_CM);
  assert.equal(clampHeight(177.6), 178);
});

test('a profile row with an out-of-vocabulary value reads as unset, not as a crash', () => {
  const row = rowsFromProfile({ height_cm: 178, smoking: 'never', diet: 'air', drinking: 42 });
  assert.equal(row.height_cm, 178);
  assert.equal(row.smoking, 'never');
  assert.equal(row.diet, null);
  assert.equal(row.drinking, null);
});

test('every attribute label, value and zodiac sign is translated in every language', () => {
  const keys: string[] = [];
  for (const field of ENUM_ATTRIBUTES) {
    keys.push(attributeLabelKey(field.id));
    for (const value of field.values) keys.push(attributeValueKey(field.id, value));
  }
  keys.push(attributeLabelKey('height_cm'), 'identity.attributes.zodiac.label', 'identity.attributes.notSet');
  for (const sign of ZODIAC_SIGNS) keys.push(zodiacLabelKey(sign));
  for (const { code } of availableLocales()) {
    for (const key of keys) {
      const text = translate(code, key);
      assert.ok(text && text !== key, `${code} is missing ${key}`);
    }
  }
});

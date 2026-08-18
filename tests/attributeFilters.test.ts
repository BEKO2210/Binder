import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  activeFilterCount,
  clearFilterField,
  FILTER_FIELDS,
  filtersPayload,
  parseStoredFilters,
  setHeightBound,
  toggleFilterValue,
} from '../src/lib/attributeFilters.ts';
import { ZODIAC_SIGNS } from '../src/lib/profileAttributes.ts';

test('the filter vocabulary is exactly what the migration validator accepts', () => {
  // The sheet offers chips; the server refuses codes outside its lists. If
  // they drift, a chip exists that can never be saved.
  const migration = readFileSync(new URL('../supabase/migrations/20260819100000_phase10_attribute_filters.sql', import.meta.url), 'utf8');
  const vocabStart = migration.indexOf('vocab constant jsonb');
  const vocabBlock = migration.slice(vocabStart, migration.indexOf("}'::jsonb", vocabStart));
  for (const field of FILTER_FIELDS) {
    const match = vocabBlock.match(new RegExp(`"${field.id}": \\[([^\\]]+)\\]`));
    assert.ok(match, `validator lists ${field.id}`);
    const serverValues = [...(match[1] ?? '').matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
    assert.deepEqual([...field.values], serverValues, `${field.id} filter vocabulary matches the validator`);
  }
  assert.deepEqual([...(FILTER_FIELDS.find((f) => f.id === 'zodiac')?.values ?? [])], [...ZODIAC_SIGNS]);
});

test('an emptied selection is an absent key, never an empty array', () => {
  // The server refuses empty arrays so a nobody-matches filter cannot be
  // stored; the client must therefore never produce one.
  let filters = toggleFilterValue({}, 'smoking', 'never');
  assert.deepEqual(filters, { smoking: ['never'] });
  filters = toggleFilterValue(filters, 'smoking', 'sometimes');
  assert.deepEqual(filters.smoking, ['never', 'sometimes']);
  filters = toggleFilterValue(toggleFilterValue(filters, 'smoking', 'never'), 'smoking', 'sometimes');
  assert.ok(!('smoking' in filters));
  assert.deepEqual(filtersPayload(filters), {});
});

test('height bounds clamp to the server range and never invert', () => {
  let filters = setHeightBound({}, 'min', 300);
  assert.equal(filters.height_min_cm, 230);
  filters = setHeightBound({ height_min_cm: 180, height_max_cm: 200 }, 'min', 210);
  assert.deepEqual(filters, { height_min_cm: 210, height_max_cm: 210 });
  filters = setHeightBound(filters, 'max', 150);
  assert.deepEqual(filters, { height_min_cm: 150, height_max_cm: 150 });
  assert.deepEqual(setHeightBound(filters, 'min', null).height_min_cm, undefined);
  assert.deepEqual(clearFilterField(filters, 'height'), {});
});

test('a stored object survives garbage and keeps only known codes', () => {
  const parsed = parseStoredFilters({
    smoking: ['never', 'daily', 42],
    zodiac: ['leo'],
    height_min_cm: 500,
    height_max_cm: 190.4,
    favourite_colour: ['red'],
  });
  assert.deepEqual(parsed, { smoking: ['never'], zodiac: ['leo'], height_max_cm: 190 });
  assert.deepEqual(parseStoredFilters(null), {});
  assert.deepEqual(parseStoredFilters([1]), {});
});

test('the active count reports fields, not codes', () => {
  assert.equal(activeFilterCount({}), 0);
  assert.equal(activeFilterCount({ smoking: ['never', 'sometimes'], height_min_cm: 170 }), 2);
  assert.equal(activeFilterCount({ height_min_cm: 170, height_max_cm: 190 }), 1);
});

test('every filter label the sheet needs is translated in every language', async () => {
  const { availableLocales, translate } = await import('../src/i18n/index.ts');
  const keys = ['discoveryFilterSheet.attributes.title', 'discoveryFilterSheet.attributes.any', 'discoveryFilterSheet.attributes.heightMin', 'discoveryFilterSheet.attributes.heightMax', 'discoveryFilterSheet.attributes.show', 'discoveryFilterSheet.attributes.hide'];
  for (const { code } of availableLocales()) {
    for (const key of keys) {
      const text = translate(code, key);
      assert.ok(text && text !== key, `${code} is missing ${key}`);
    }
  }
});

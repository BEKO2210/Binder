import assert from 'node:assert/strict';
import test from 'node:test';

import { INTEREST_CATALOG, INTEREST_SELECTION_LIMIT, catalogLabelKey } from '../src/lib/interestCatalog.ts';
import { searchCatalog, toggleInterest, unknownSelections } from '../src/lib/interestPicker.ts';
import { translate } from '../src/i18n/index.ts';

const labelDe = (entry: { id: string }) => translate('de', catalogLabelKey(entry.id));

test('search finds by translated label, not only by the stored id', () => {
  // A German speaker types the German word; the stored value is English.
  const hits = searchCatalog('Wandern', labelDe);
  assert.ok(hits.some((entry) => entry.id === 'Hiking'), 'Wandern should find Hiking');
  const byId = searchCatalog('hiking', labelDe);
  assert.ok(byId.some((entry) => entry.id === 'Hiking'), 'the stored id stays findable');
});

test('an empty query returns nothing instead of everything', () => {
  assert.equal(searchCatalog('   ', labelDe).length, 0);
});

test('selection stops at the limit without throwing', () => {
  let selection: readonly string[] = INTEREST_CATALOG.slice(0, INTEREST_SELECTION_LIMIT).map((entry) => entry.id);
  const before = selection;
  selection = toggleInterest(selection, 'Dogs');
  assert.deepEqual(selection, before, 'a tap on a full picker changes nothing');
});

test('somebody over the limit can always deselect', () => {
  // Legacy profiles may hold twelve; the picker offers ten. The way down must
  // always be open, or the limit becomes a trap.
  const twelve = INTEREST_CATALOG.slice(0, 12).map((entry) => entry.id);
  const first = twelve[0] ?? '';
  const reduced = toggleInterest(twelve, first);
  assert.equal(reduced.length, 11);
  assert.ok(!reduced.includes(first));
});

test('unknown stored values are surfaced, not lost', () => {
  const known = new Set(INTEREST_CATALOG.map((entry) => entry.id));
  assert.deepEqual(unknownSelections(['Travel', 'Knitting'], known), ['Knitting']);
});

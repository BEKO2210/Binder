import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const chip = readFileSync(new URL('../src/components/ui/BinderChip.tsx', import.meta.url), 'utf8');
const preferences = readFileSync(new URL('../src/components/DiscoveryPreferences.tsx', import.meta.url), 'utf8');

test('a preset keeps the values it is picked for at 200 % font size', () => {
  // At 200 % the presets read "In der Nähe · Bis 10 km · 22–…": the numbers
  // that are the whole reason to pick one were cut off.
  assert.match(preferences, /<BinderChip key=\{preset\.id\} multiline/);
  assert.match(chip, /numberOfLines=\{multiline \? undefined : 1\}/);
});

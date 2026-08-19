import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { contrastRatio, minimumContrast } from '../src/theme/contrast.ts';
import { accentThemes, semanticContrastPairs, semanticPalettes, semanticStateContrastPairs } from '../src/theme/colorTokens.ts';
import { feedback } from '../src/theme/feedbackTokens.ts';

for (const scheme of ['dark', 'light'] as const) {
  test(`${scheme} semantic colour pairings meet WCAG AA`, () => {
    const pairs = semanticContrastPairs(scheme);
    assert.ok(pairs.length > 0, `${scheme} must declare semantic pairings`);
    assert.equal(new Set(pairs.map(({ name }) => name)).size, pairs.length, `${scheme} pairing names must be unique`);
    for (const pair of pairs) {
      const ratio = contrastRatio(pair.foreground, pair.background);
      assert.ok(
        ratio >= minimumContrast[pair.level],
        `${scheme} ${pair.name}: ${ratio.toFixed(2)}:1 is below ${minimumContrast[pair.level]}:1 (${pair.level})`,
      );
    }
  });

  test(`${scheme} interaction-state colour pairings meet WCAG AA`, () => {
    const pairs = semanticStateContrastPairs(scheme, feedback.disabledOpacity);
    assert.ok(pairs.length > 0, `${scheme} must declare interaction-state pairings`);
    assert.equal(new Set(pairs.map(({ name }) => name)).size, pairs.length, `${scheme} state pairing names must be unique`);
    for (const pair of pairs) {
      const ratio = contrastRatio(pair.foreground, pair.background);
      assert.ok(
        ratio >= minimumContrast[pair.level],
        `${scheme} ${pair.name}: ${ratio.toFixed(2)}:1 is below ${minimumContrast[pair.level]}:1 (${pair.level})`,
      );
    }
  });
}

test('contrast calculation follows the WCAG reference values', () => {
  assert.equal(contrastRatio('#000000', '#FFFFFF'), 21);
  assert.ok(Math.abs(contrastRatio('#777777', '#FFFFFF') - 4.478) < 0.001);
  assert.ok(Math.abs(contrastRatio('rgba(0,0,0,0.5)', '#FFFFFF') - 3.977) < 0.001);
});

test('the swipe stamps stay readable on a bright photograph', () => {
  // Reported from the device: in light mode the lime BIND stamp on a sunny
  // portrait was barely there. A photo is not a surface the theme controls,
  // so both stamps take the dark palette and carry their own backing — the
  // same rule the card's name and bio already follow.
  const source = readFileSync(new URL('../src/screens/DiscoveryScreen.tsx', import.meta.url), 'utf8');
  assert.match(source, /color: theme\.accent\.onDark \}\}>\{t\('discovery\.actions\.bindStamp'\)/);
  assert.match(source, /color: semanticPalettes\.dark\.destructive \}\}>\{t\('discovery\.actions\.passStamp'\)/);
  assert.equal((source.match(/backgroundColor: darkPalette\.overlay, borderRadius: theme\.radii\.pill/g) ?? []).length, 2);
  assert.ok(contrastRatio(accentThemes.lime.onDark, 'rgba(4,5,8,0.88)') >= 4.5);
  assert.ok(contrastRatio(semanticPalettes.dark.destructive, 'rgba(4,5,8,0.88)') >= 4.5);
});

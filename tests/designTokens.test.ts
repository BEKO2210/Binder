import assert from 'node:assert/strict';
import test from 'node:test';

import { contrastRatio, minimumContrast } from '../src/theme/contrast.ts';
import { semanticContrastPairs } from '../src/theme/colorTokens.ts';

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
}

test('contrast calculation follows the WCAG reference values', () => {
  assert.equal(contrastRatio('#000000', '#FFFFFF'), 21);
  assert.ok(Math.abs(contrastRatio('#777777', '#FFFFFF') - 4.478) < 0.001);
  assert.ok(Math.abs(contrastRatio('rgba(0,0,0,0.5)', '#FFFFFF') - 3.977) < 0.001);
});

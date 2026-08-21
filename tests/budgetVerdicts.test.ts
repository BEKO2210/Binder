import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { bundleSizeVerdict, performanceVerdict, PERFORMANCE_MARGIN } from '../scripts/lib/budget-verdicts.mjs';

const budgets = { maxJsBytes: 6 * 1048576, maxTotalBytes: 40 * 1048576 };

test('a size report is judged by its numbers, not by existing', () => {
  assert.equal(bundleSizeVerdict({ jsBytes: 5 * 1048576, totalBytes: 30 * 1048576, budgets }).status, 'PASS');
  // The run that produced this exited 1 — and left the file behind, which is
  // how a failed measurement used to read as a pass one step later.
  const over = bundleSizeVerdict({ jsBytes: 7 * 1048576, totalBytes: 30 * 1048576, budgets });
  assert.equal(over.status, 'FAIL');
  assert.match(over.reasons[0] ?? '', /JS\/Hermes 7\.00 MiB over the 6\.00 MiB budget/);
  assert.equal(bundleSizeVerdict({ jsBytes: 1, totalBytes: 41 * 1048576, budgets }).status, 'FAIL');
});

test('a report without numbers or without budgets is missing, not passing', () => {
  assert.equal(bundleSizeVerdict(null).status, 'MISSING');
  assert.equal(bundleSizeVerdict({ jsBytes: 1 }).status, 'MISSING');
  assert.equal(bundleSizeVerdict({ jsBytes: 1, totalBytes: 2 }).status, 'MISSING');
});

const baseline = { coldStartMs: 1000, jankyPercent: 0.5, memoryMb: 340 };

test('every measured value counts, the frame statistics included', () => {
  assert.equal(performanceVerdict({ coldStartMs: 1200, jankyPercent: 0.6, memoryMb: 350 }, baseline).status, 'PASS');
  // This is the case the release candidate used to call PASS: cold start and
  // memory fine, the app twice as janky.
  const janky = performanceVerdict({ coldStartMs: 1000, jankyPercent: 1.0, memoryMb: 340 }, baseline);
  assert.equal(janky.status, 'FAIL');
  assert.match(janky.reasons[0] ?? '', /jankyPercent: 0\.5% → 1%/);
  assert.equal(performanceVerdict({ coldStartMs: 2000, jankyPercent: 0.5, memoryMb: 340 }, baseline).status, 'FAIL');
  assert.equal(performanceVerdict({ coldStartMs: 1000, jankyPercent: 0.5, memoryMb: 500 }, baseline).status, 'FAIL');
});

test('a value the phone never answered is not a pass', () => {
  // -1 is what the gfxinfo parser writes when the output had no janky line.
  const unread = performanceVerdict({ coldStartMs: 1000, jankyPercent: -1, memoryMb: 340 }, baseline);
  assert.equal(unread.status, 'FAIL');
  assert.match(unread.reasons[0] ?? '', /jankyPercent was not measured/);
  assert.equal(performanceVerdict(null, baseline).status, 'MISSING');
  assert.equal(performanceVerdict({ coldStartMs: 1 }, null).status, 'MISSING');
});

test('the margin has one home, and both the run and the candidate use it', () => {
  assert.deepEqual(PERFORMANCE_MARGIN, { coldStartMs: 1.35, jankyPercent: 1.6, memoryMb: 1.30 });
  for (const file of ['scripts/performance.mjs', 'scripts/release-candidate.mjs', 'scripts/report-bundle-size.mjs']) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(source, /budget-verdicts\.mjs/, `${file} defines its own idea of "within budget"`);
  }
});

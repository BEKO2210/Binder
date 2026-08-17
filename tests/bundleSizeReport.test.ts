import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { collectBundleReport, formatBundleReport } from '../scripts/report-bundle-size.mjs';

test('bundle report measures payloads and attributes source-map modules', (t) => {
  const root = mkdtempSync('/tmp/binder-bundle-report-');
  mkdirSync(join(root, 'bundle'), { recursive: true });
  writeFileSync(join(root, 'bundle/index.hbc'), Buffer.alloc(20));
  writeFileSync(join(root, 'bundle/index.hbc.map'), JSON.stringify({ sources: ['/small.ts', '/large.ts'], sourcesContent: ['a', '12345'] }));
  const report = collectBundleReport(root);
  assert.equal(report.jsBytes, 20);
  assert.equal(report.topModules[0]?.path, 'large.ts');
  assert.match(formatBundleReport(report), /Top Metro source modules/);
});

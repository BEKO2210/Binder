import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../scripts/release-build.mjs', import.meta.url), 'utf8');

test('the signature is checked before anything is staged', () => {
  // The check used to run after the copy, so a build signed with the wrong key
  // was already lying in the release folder under its final name when the
  // script exited — ready for somebody to upload to Play.
  const verified = source.indexOf('Signature verified against the upload key');
  const firstStage = source.indexOf('stage(builtApk');
  assert.ok(verified > 0 && firstStage > 0);
  assert.ok(verified < firstStage, 'nothing is copied before the certificate matches');
});

test('a missing apksigner stops the release instead of warning', () => {
  assert.match(source, /if \(!existsSync\(apksigner\)\) \{[\s\S]{0,200}process\.exit\(1\)/);
  assert.doesNotMatch(source, /signature not verified/);
});

test('a wrong certificate exits non-zero', () => {
  const mismatch = source.indexOf('not the upload key');
  assert.ok(mismatch > 0);
  assert.match(source.slice(mismatch, mismatch + 400), /process\.exit\(1\)/);
});

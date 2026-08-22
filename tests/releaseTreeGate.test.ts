import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const build = readFileSync(new URL('../scripts/release-build.mjs', import.meta.url), 'utf8');
const candidate = readFileSync(new URL('../scripts/release-candidate.mjs', import.meta.url), 'utf8');

test('a release is not built from a tree nobody can reproduce', () => {
  // The last evidence before this said treeClean: false. The artefact that
  // would have gone to Play came from a commit plus an unknown pile of
  // uncommitted edits, and nothing anybody has reproduces it. The candidate
  // already reported that as a failure — after the build, which is too late.
  const start = build.indexOf("gitOutput(['status', '--porcelain'])");
  const bump = build.indexOf('appJson.expo.version = version;');
  assert.ok(start > 0 && bump > start, 'the tree is checked before anything is written');
  assert.match(build, /if \(dirtyAtStart\.length > 0 && !allowDirty\) \{[\s\S]*process\.exit\(1\);/);
});

test('the version bump gets a commit of its own', () => {
  // Otherwise the tree can never be clean at build time: this script's first
  // act is to change four files.
  assert.match(build, /execFileSync\('git', \['commit', '-m', `Version \$\{version\} \(code \$\{versionCode\}\)`\]/);
});

test('the candidate still refuses a dirty build', () => {
  // Both ends: the build will not start, and a candidate assembled from older
  // evidence that was built dirty is still not READY.
  assert.match(candidate, /ask\('tree clean at build time', release\.treeClean \? 'PASS' : 'FAIL'/);
});

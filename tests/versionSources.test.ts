import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = JSON.parse(read('app.json')) as { expo: { version: string; android: { versionCode: number } } };
const packageJson = JSON.parse(read('package.json')) as { version: string };
const eas = JSON.parse(read('eas.json')) as { build: Record<string, { autoIncrement?: boolean }>; cli?: { appVersionSource?: string } };
const gradle = read('android/app/build.gradle');
const readme = read('README.md');

test('one version, in every place that carries it', () => {
  // The release script writes all four. A mismatch means somebody edited one
  // by hand, and the build that goes to Play carries whichever the packager
  // happened to read.
  assert.equal(packageJson.version, app.expo.version);
  assert.match(gradle, new RegExp(`versionName "${app.expo.version.replace(/\./g, '\\.')}"`));
  assert.match(gradle, new RegExp(`versionCode ${app.expo.android.versionCode}\\b`));
  assert.match(readme, new RegExp(`android-${app.expo.version.replace(/\./g, '\\.')}-`));
});

test('nothing raises the version behind the release script’s back', () => {
  // With autoIncrement on, EAS bumps the version code itself. The local script
  // had already written one into app.json, package.json, build.gradle and the
  // README — so the artifact and everything describing it disagreed, and the
  // evidence for a build pointed at a number that was never built.
  assert.equal(eas.cli?.appVersionSource, 'local');
  for (const [profile, config] of Object.entries(eas.build)) {
    assert.notEqual(config.autoIncrement, true, `${profile} increments the version behind the script`);
  }
});

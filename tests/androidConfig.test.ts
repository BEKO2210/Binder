import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { AUTH_CALLBACK_KINDS } from '../src/lib/deepLinks.ts';

type Plugin = string | [string, Record<string, unknown>];
type IntentFilter = { action: string; data?: { scheme?: string; host?: string }[]; category?: string[] };

const config = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')) as {
  expo: { scheme: string; plugins: Plugin[]; android: { intentFilters: IntentFilter[] } };
};
const expo = config.expo;

test('every link the app answers to opens the app', () => {
  // The confirmation link was missing: Android had no filter for it, so
  // tapping "confirm your address" left the person in a browser with a link
  // the app never saw, in the one flow that stands between them and an
  // account. The parser and the manifest have to agree, always.
  const hosts = expo.android.intentFilters.flatMap((filter) => (filter.data ?? []).map((entry) => entry.host));
  for (const kind of AUTH_CALLBACK_KINDS) assert.ok(hosts.includes(kind), `no intent filter for binder://${kind}`);
});

test('every callback filter is browsable and uses the app scheme', () => {
  for (const filter of expo.android.intentFilters) {
    assert.equal(filter.action, 'VIEW');
    assert.ok(filter.category?.includes('BROWSABLE') && filter.category.includes('DEFAULT'));
    for (const entry of filter.data ?? []) assert.equal(entry.scheme, expo.scheme);
  }
});

test('a build plugin is registered once', () => {
  // expo-build-properties stood twice, once bare and once configured. Prebuild
  // runs both, and the bare one can hand back the shrink and ProGuard settings
  // the configured one just made — silently, in the release build.
  const names = expo.plugins.map((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin));
  assert.deepEqual(names.length, new Set(names).size, `a plugin is registered twice: ${names.join(', ')}`);
});

test('the SDK the release targets is written down, not inherited', () => {
  const properties = expo.plugins.find((plugin): plugin is [string, Record<string, unknown>] =>
    Array.isArray(plugin) && plugin[0] === 'expo-build-properties');
  const android = (properties?.[1].android ?? {}) as Record<string, unknown>;
  assert.equal(android.enableProguardInReleaseBuilds, true);
  assert.equal(android.enableShrinkResourcesInReleaseBuilds, true);
  // Play refuses an upload below 35. A number that comes from whatever the SDK
  // happens to default to is a number nobody decided.
  assert.ok(typeof android.targetSdkVersion === 'number' && android.targetSdkVersion >= 35);
  assert.ok(typeof android.compileSdkVersion === 'number' && android.compileSdkVersion >= android.targetSdkVersion);
});

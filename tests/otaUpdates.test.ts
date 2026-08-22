import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const config = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')) as {
  expo: {
    extra: { eas: { projectId: string } };
    runtimeVersion?: { policy?: string };
    updates?: Record<string, unknown>;
  };
};
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  dependencies: Record<string, string>;
};
const eas = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8')) as {
  build: Record<string, { channel?: string }>;
};

test('a fix can reach people without a store review', () => {
  // Without this there is exactly one way to fix anything: upload, wait for
  // review, wait for rollout. Days, for a line of JavaScript, while the app is
  // broken on every phone that has it.
  assert.ok(packageJson.dependencies['expo-updates'], 'expo-updates is not a dependency');
  assert.equal(config.expo.updates?.enabled, true);
  assert.equal(config.expo.updates?.url, `https://u.expo.dev/${config.expo.extra.eas.projectId}`);
});

test('an update never lands on a build it was not written for', () => {
  // Native code does not travel over the air. A bundle built against another
  // app version can call a native module the installed binary does not have,
  // and that is a crash on launch with no way back.
  assert.equal(config.expo.runtimeVersion?.policy, 'appVersion');
});

test('a build says which channel it listens to', () => {
  assert.equal(eas.build.production?.channel, 'production');
  assert.equal(eas.build.preview?.channel, 'preview');
});

test('the app never waits for the network to start', () => {
  // A person opening the app is not interested in whether a fix exists. The
  // installed bundle starts; anything new is fetched behind it and taken on
  // the next launch.
  assert.equal(config.expo.updates?.fallbackToCacheTimeout, 0);
});

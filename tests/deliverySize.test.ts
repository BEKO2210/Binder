import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { deliverySizes, formatDeliveryReport } from '../scripts/report-delivery-size.mjs';

const MiB = 1048576;

const entries = [
  { name: 'BUNDLE-METADATA/com.android.tools.build.debugsymbols/arm64-v8a/librnskia.so.sym', compressedBytes: 5 * MiB },
  { name: 'BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map', compressedBytes: 4 * MiB },
  { name: 'META-INF/KEY0.SF', compressedBytes: 1 * MiB },
  { name: 'base/lib/arm64-v8a/librnskia.so', compressedBytes: 4 * MiB },
  { name: 'base/lib/armeabi-v7a/librnskia.so', compressedBytes: 3 * MiB },
  { name: 'base/dex/classes.dex', compressedBytes: 2 * MiB },
  { name: 'base/assets/index.android.bundle', compressedBytes: 1 * MiB },
];

test('what Play never delivers is not counted as a download', () => {
  // The audit read the bundle's own size, 101 MB, and asked whether the store
  // listing survives it. Roughly half of that is native debug symbols and the
  // R8 mapping — kept so a crash report can be read, never sent to a phone.
  const report = deliverySizes(entries);
  assert.equal(report.strippedBytes, 10 * MiB);
  assert.equal(report.sharedBytes, 3 * MiB);
});

test('a device downloads the shared part plus its own architecture', () => {
  const report = deliverySizes(entries);
  const arm64 = report.devices.find((device) => device.abi === 'arm64-v8a');
  const arm32 = report.devices.find((device) => device.abi === 'armeabi-v7a');
  assert.equal(arm64?.downloadBytes, 7 * MiB);
  assert.equal(arm32?.downloadBytes, 6 * MiB);
  // Sorted worst first: that is the number somebody on the wrong phone and a
  // bad connection is looking at.
  assert.equal(report.devices[0]?.abi, 'arm64-v8a');
  assert.equal(report.largestDownloadBytes, 7 * MiB);
});

test('a bundle with no native code still reports a download', () => {
  const report = deliverySizes([{ name: 'base/dex/classes.dex', compressedBytes: MiB }]);
  assert.deepEqual(report.devices, []);
  assert.equal(report.largestDownloadBytes, MiB);
});

test('the report says the three things somebody wants to know', () => {
  const text = formatDeliveryReport(deliverySizes(entries));
  assert.match(text, /Play keeps and never delivers/);
  assert.match(text, /arm64-v8a/);
  assert.match(text, /Largest per-device download: 7\.0 MiB/);
});

test('the measured bundle is well under what hurts a download', () => {
  // The rule of thumb the audit named: conversion suffers past 50 MB per
  // device. This is the measurement, not an estimate — recorded from the
  // 1.0.8 bundle.
  const measured = JSON.parse(readFileSync(new URL('../artifacts/delivery-size-report.json', import.meta.url), 'utf8')) as { largestDownloadBytes: number };
  assert.ok(measured.largestDownloadBytes < 50 * MiB, `largest per-device download is ${(measured.largestDownloadBytes / MiB).toFixed(1)} MiB`);
});

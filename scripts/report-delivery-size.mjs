// What a phone actually downloads, measured from the bundle itself.
//
// The audit read "AAB 101 MB, APK 127 MB" and asked whether the store listing
// would survive it. Neither number is what anybody downloads: the APK is the
// universal one with every ABI in it, and roughly half the bundle is metadata
// Play keeps and never ships — native debug symbols and the R8 mapping, which
// exist so a crash report can be read.
//
// Play builds one APK set per device out of the rest. This works out what that
// comes to, per ABI, without a Play Console login: the entries for that ABI
// plus everything every device gets, compressed, which is what a download
// costs.
//
//   node scripts/report-delivery-size.mjs /path/to/Binder-v1.0.8-vc105.aab
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/** Play strips these before it builds anything for a device. */
const NEVER_DELIVERED = ['BUNDLE-METADATA/', 'META-INF/'];

export function deliverySizes(entries) {
  const shared = [];
  const perAbi = new Map();
  let stripped = 0;
  let archive = 0;

  for (const entry of entries) {
    archive += entry.compressedBytes;
    if (NEVER_DELIVERED.some((prefix) => entry.name.startsWith(prefix))) {
      stripped += entry.compressedBytes;
      continue;
    }
    const abi = /(?:^|\/)lib\/([^/]+)\//.exec(entry.name)?.[1];
    if (abi) {
      perAbi.set(abi, (perAbi.get(abi) ?? 0) + entry.compressedBytes);
      continue;
    }
    shared.push(entry.compressedBytes);
  }

  const sharedBytes = shared.reduce((sum, bytes) => sum + bytes, 0);
  const devices = [...perAbi.entries()]
    .map(([abi, bytes]) => ({ abi, nativeBytes: bytes, downloadBytes: sharedBytes + bytes }))
    .sort((first, second) => second.downloadBytes - first.downloadBytes);

  return {
    schemaVersion: 1,
    archiveBytes: archive,
    strippedBytes: stripped,
    sharedBytes,
    devices,
    // The worst case is the number worth watching: it is the one somebody on
    // the wrong phone and a bad connection is looking at.
    largestDownloadBytes: devices.length ? devices[0].downloadBytes : sharedBytes,
  };
}

export function formatDeliveryReport(report) {
  const mib = (bytes) => `${(bytes / 1048576).toFixed(1)} MiB`;
  const lines = [
    `Bundle on disk: ${mib(report.archiveBytes)}`,
    `Play keeps and never delivers: ${mib(report.strippedBytes)} (native debug symbols, R8 mapping, signatures)`,
    `Every device downloads: ${mib(report.sharedBytes)} of shared parts, plus its own native libraries:`,
  ];
  for (const device of report.devices) lines.push(`  ${device.abi.padEnd(12)} ${mib(device.nativeBytes).padStart(9)} native  →  ${mib(device.downloadBytes)} download`);
  lines.push(`Largest per-device download: ${mib(report.largestDownloadBytes)}`);
  return lines.join('\n');
}

function entriesOf(aabPath) {
  // `unzip -v` rather than a zip library: the toolchain already has it, and an
  // AAB is large enough that reading it twice is not free.
  const listing = execFileSync('unzip', ['-v', aabPath], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const entries = [];
  for (const line of listing.split('\n')) {
    const match = /^\s*\d+\s+\S+\s+(\d+)\s+\S+\s+\S+\s+\S+\s+\S+\s+(.+)$/.exec(line);
    if (match) entries.push({ name: match[2].trim(), compressedBytes: Number(match[1]) });
  }
  if (entries.length === 0) throw new Error(`no entries read from ${aabPath}`);
  return entries;
}

const [aabPath, outPath] = process.argv.slice(2);
if (aabPath) {
  const report = deliverySizes(entriesOf(aabPath));
  console.log(formatDeliveryReport(report));
  if (outPath) {
    writeFileSync(outPath, `${JSON.stringify({ ...report, bundle: aabPath.split('/').pop() }, null, 2)}\n`);
    console.log(`Written to ${outPath}`);
  }
}

export { entriesOf };

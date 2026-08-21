// What the app costs to use, measured on hardware rather than argued about.
//
// Three numbers, each tied to something a person feels: how long the app takes
// to appear from cold, how many frames it drops while the deck and the photo
// pager are being moved, and how much memory it is holding after ten photos
// have been decoded.
//
// The budgets come from a measured run, not from a round number somebody liked,
// and they are compared with the same rule as everything else here: worse than
// the baseline by more than the stated margin fails. Raising a budget is a
// decision that shows up in a diff.
//
//   node scripts/performance.mjs --record   measure and store the baseline
//   node scripts/performance.mjs            measure and compare
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { performanceVerdict } from './lib/budget-verdicts.mjs';

const adb = process.env.ADB ?? join(homedir(), 'Android/Sdk/platform-tools/adb');
const maestro = join(homedir(), '.maestro/maestro/bin/maestro');
const javaHome = process.env.JAVA_HOME ?? join(homedir(), '.local/jdk/jdk-21.0.12+8');
const appId = 'de.beko2210.binder';
const BASELINE = 'artifacts/performance-baseline.json';

// The margin and the comparison live in scripts/lib/budget-verdicts.mjs, so the
// release candidate cannot drift into a second definition of "fast enough".


// With two phones on the desk, every adb call fails with "more than one
// device/emulator" halfway through a run. The evidence has to say which phone
// it came from anyway, so the serial is chosen here, once, and passed to every
// call — adb and Maestro alike.
function chosenSerial() {
  const attached = execFileSync(adb, ['devices'], { encoding: 'utf8' })
    .split('\n').slice(1)
    .map((line) => line.split('\t'))
    .filter(([, state]) => state?.trim() === 'device')
    .map(([serial]) => serial.trim());
  if (attached.length === 0) { console.error('No device is attached.'); process.exit(1); }
  const wanted = process.env.ANDROID_SERIAL;
  if (wanted) {
    if (!attached.includes(wanted)) { console.error(`ANDROID_SERIAL=${wanted} is not attached (${attached.join(', ')}).`); process.exit(1); }
    return wanted;
  }
  if (attached.length > 1) {
    console.error(`More than one device is attached (${attached.join(', ')}).\nPick one: ANDROID_SERIAL=<serial> ${process.argv[1].split('/').pop()}`);
    process.exit(1);
  }
  return attached[0];
}

const serial = chosenSerial();

const shell = (...args) => execFileSync(adb, ['-s', serial, 'shell', ...args], { encoding: 'utf8' });
const sleep = (seconds) => execFileSync('sleep', [String(seconds)]);

function coldStartMs(samples = 5) {
  const times = [];
  for (let index = 0; index < samples; index += 1) {
    shell('am', 'force-stop', appId);
    sleep(2);
    const output = shell('am', 'start-activity', '-W', '-n', `${appId}/.MainActivity`);
    const total = /TotalTime:\s*(\d+)/.exec(output)?.[1];
    if (total) times.push(Number(total));
    sleep(1);
  }
  if (times.length === 0) throw new Error('No cold start time could be measured');
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

function memoryMb() {
  const output = shell('dumpsys', 'meminfo', appId);
  const total = /TOTAL PSS:\s*(\d+)/.exec(output)?.[1] ?? /TOTAL\s+(\d+)/.exec(output)?.[1];
  return total ? Math.round((Number(total) / 1024) * 10) / 10 : null;
}

function flow(file, account) {
  execFileSync(maestro, ['--device', serial, 'test', '--include-tags=scenario', join('.maestro', file)], {
    stdio: 'inherit',
    env: { ...process.env, JAVA_HOME: javaHome, PATH: `${javaHome}/bin:${process.env.PATH}`, MAESTRO_EMAIL: account.email, MAESTRO_PASSWORD: account.password },
  });
}

function interactionFrames(account) {
  shell('dumpsys', 'gfxinfo', appId, 'reset');
  flow('90-performance.yaml', account);
  const output = shell('dumpsys', 'gfxinfo', appId);
  const totalFrames = Number(/Total frames rendered:\s*(\d+)/.exec(output)?.[1] ?? 0);
  const jankyPercent = Number(/Janky frames:\s*\d+\s*\(([\d.]+)%\)/.exec(output)?.[1] ?? -1);
  const p95 = Number(/95th percentile:\s*(\d+)ms/.exec(output)?.[1] ?? 0);
  return { totalFrames, jankyPercent, p95Ms: p95 };
}

function stage() {
  const output = execFileSync(process.execPath, ['scripts/stage-test-account.mjs', 'create'], { encoding: 'utf8' });
  execFileSync(process.execPath, ['scripts/stage-demo-profiles.mjs', 'create', 'docs/demo-profiles.json'], { stdio: 'inherit' });
  return {
    email: /E-Mail:\s*(\S+)/.exec(output)?.[1],
    password: /Passwort:\s*(\S+)/.exec(output)?.[1],
  };
}

function unstage() {
  for (const args of [['scripts/stage-demo-profiles.mjs', 'remove', 'docs/demo-profiles.json'], ['scripts/stage-test-account.mjs', 'remove']]) {
    try { execFileSync(process.execPath, args, { stdio: 'ignore' }); } catch { /* keep going */ }
  }
}

// The matrix and the suite runner stage once for everything that follows;
// staging again would create a second account and delete the first one's
// demo profiles out from under the run that is using them.
const preStaged = process.env.BINDER_STAGED === '1' && process.env.MAESTRO_EMAIL && process.env.MAESTRO_PASSWORD;
const account = preStaged
  ? { email: process.env.MAESTRO_EMAIL, password: process.env.MAESTRO_PASSWORD }
  : stage();
let measurement;
try {
  // Sign in once from a cleared state: a cold start of a signed-out app
  // measures a login screen, which is not the number anybody feels.
  shell('pm', 'clear', appId);
  flow('00-signin.yaml', account);

  console.log('── cold start ──');
  const cold = coldStartMs();
  console.log(`   ${cold} ms (median of five)`);

  console.log('\n── deck and photo pager ──');
  const frames = interactionFrames(account);
  console.log(`   ${frames.totalFrames} frames, ${frames.jankyPercent}% janky, 95th percentile ${frames.p95Ms} ms`);

  console.log('\n── memory after ten photos ──');
  const memory = memoryMb();
  console.log(`   ${memory} MB total PSS`);

  measurement = {
    ranAt: new Date().toISOString(),
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    device: shell('getprop', 'ro.product.model').trim(),
    android: shell('getprop', 'ro.build.version.release').trim(),
    coldStartMs: cold,
    jankyPercent: frames.jankyPercent,
    p95Ms: frames.p95Ms,
    totalFrames: frames.totalFrames,
    memoryMb: memory,
  };
} finally {
  if (!preStaged) unstage();
}

mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/performance-evidence.json', `${JSON.stringify(measurement, null, 2)}\n`);

if (process.argv.includes('--record')) {
  writeFileSync(BASELINE, `${JSON.stringify(measurement, null, 2)}\n`);
  console.log(`\nBaseline recorded in ${BASELINE}.`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.log('\nNo baseline yet. Run with --record on a quiet phone.');
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const regressions = performanceVerdict(measurement, baseline).reasons;

if (regressions.length > 0) {
  console.error('\nPerformance went backwards:');
  for (const regression of regressions) console.error(`  ${regression}`);
  console.error('\nFind the cause. Recording a new baseline is a decision, and belongs in a commit that says why.');
  process.exit(1);
}

console.log('\nPerformance holds against the baseline.');

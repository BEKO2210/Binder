// The device matrix on both phones at once.
//
// Four conditions, one after another, is twelve journeys on one device — about
// twelve minutes of a person waiting. Two phones halve that, but only if the two
// runs cannot touch each other. Three ways they could, all found by reading the
// scripts rather than by watching it break:
//
//   * Screenshots: Maestro writes into ~/.maestro/tests/<timestamp>, and the
//     "newest folder" is whichever run wrote last. Each run now gets its own
//     --debug-output folder.
//   * adb: the retry path used to `kill-server`, which drops the connection to
//     every attached phone. It reconnects one device now.
//   * The test account: one email and one display name for both runs meant the
//     second staging deleted the first run's account as a leftover, and the
//     match staging picked whichever row came first. Each phone gets its own
//     address and name.
//
// The demo profiles stay shared on purpose: they are deck content, decisions are
// per account, and staging them twice would be two sets of the same three
// people. They are created once here and removed once at the end.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const adb = process.env.ADB ?? join(homedir(), 'Android/Sdk/platform-tools/adb');
const attached = execFileSync(adb, ['devices'], { encoding: 'utf8' })
  .split('\n').slice(1)
  .map((line) => line.split('\t'))
  .filter(([, state]) => state?.trim() === 'device')
  .map(([serial]) => serial.trim());

if (attached.length === 0) {
  console.error('No device is attached.');
  process.exit(1);
}

const CONDITIONS = ['light', 'dark', '200-font', 'reduced-motion'];
// One phone: everything on it, in order. Two: split down the middle. More than
// two: round-robin, because nothing here assumes exactly two.
const plan = attached.map((serial, index) => ({
  serial,
  conditions: CONDITIONS.filter((_, position) => position % attached.length === index),
}));

console.log(plan.map((lane) => `${lane.serial}: ${lane.conditions.join(', ')}`).join('\n'));

function stageFor(lane, index) {
  const env = {
    ...process.env,
    BINDER_TEST_EMAIL: `belkis.aslani+binder.testlauf${index + 1}@gmail.com`,
    BINDER_TEST_NAME: `Testlauf ${index + 1} (Testkonto)`,
  };
  const output = execFileSync(process.execPath, ['scripts/stage-test-account.mjs', 'create'], { encoding: 'utf8', env });
  const email = /E-Mail:\s*(\S+)/.exec(output)?.[1];
  const password = /Passwort:\s*(\S+)/.exec(output)?.[1];
  if (!email || !password) throw new Error(`Could not read the staged account for ${lane.serial}`);
  execFileSync(process.execPath, ['scripts/stage-test-match.mjs', 'create'], { stdio: 'inherit', env });
  return { ...env, MAESTRO_EMAIL: email, MAESTRO_PASSWORD: password };
}

function unstageFor(index) {
  const env = {
    ...process.env,
    BINDER_TEST_EMAIL: `belkis.aslani+binder.testlauf${index + 1}@gmail.com`,
    BINDER_TEST_NAME: `Testlauf ${index + 1} (Testkonto)`,
  };
  for (const args of [['scripts/stage-test-match.mjs', 'remove'], ['scripts/stage-test-account.mjs', 'remove']]) {
    try { execFileSync(process.execPath, args, { stdio: 'ignore', env }); } catch { /* keep going */ }
  }
}

execFileSync(process.execPath, ['scripts/stage-demo-profiles.mjs', 'create', 'docs/demo-profiles.json'], { stdio: 'inherit' });

const lanes = plan.map((lane, index) => ({ ...lane, env: stageFor(lane, index), index }));

const results = await Promise.all(lanes.map((lane) => new Promise((resolve) => {
  const debugOutput = join('artifacts', 'maestro-debug', lane.serial);
  rmSync(debugOutput, { recursive: true, force: true });
  mkdirSync(debugOutput, { recursive: true });
  const evidenceFile = `artifacts/device-evidence-${lane.serial}.json`;
  const child = spawn(process.execPath, ['scripts/device-matrix.mjs', ...lane.conditions], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...lane.env,
      ANDROID_SERIAL: lane.serial,
      BINDER_STAGED: '1',
      BINDER_DEBUG_OUTPUT: debugOutput,
      BINDER_EVIDENCE_FILE: evidenceFile,
    },
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; process.stdout.write(`[${lane.serial}] ${chunk}`); });
  child.stderr.on('data', (chunk) => { output += chunk; });
  child.on('close', (code) => resolve({ ...lane, code, evidenceFile, output }));
})));

for (const lane of lanes) unstageFor(lane.index);
try { execFileSync(process.execPath, ['scripts/stage-demo-profiles.mjs', 'remove', 'docs/demo-profiles.json'], { stdio: 'inherit' }); } catch { /* keep going */ }

// One record for the release candidate, made of both phones. A condition that
// only ran on one of them still counts once; a condition that failed anywhere
// fails here.
const merged = { ranAt: new Date().toISOString(), devices: [], conditions: [], status: 'PASS' };
for (const lane of results) {
  if (!existsSync(lane.evidenceFile)) {
    merged.status = 'FAIL';
    merged.devices.push({ serial: lane.serial, status: 'FAIL', detail: 'no evidence written' });
    continue;
  }
  const evidence = JSON.parse(readFileSync(lane.evidenceFile, 'utf8'));
  merged.commit = evidence.commit;
  merged.installed = evidence.installed;
  merged.devices.push({ serial: lane.serial, device: evidence.device, status: evidence.status });
  merged.conditions.push(...evidence.conditions.map((condition) => ({ ...condition, serial: lane.serial })));
  if (evidence.status !== 'PASS') merged.status = 'FAIL';
}
writeFileSync('artifacts/device-evidence.json', `${JSON.stringify(merged, null, 2)}\n`);

const covered = new Set(merged.conditions.map((condition) => condition.condition));
for (const condition of CONDITIONS) {
  if (!covered.has(condition)) {
    merged.status = 'FAIL';
    console.error(`Condition ${condition} never ran.`);
  }
}
writeFileSync('artifacts/device-evidence.json', `${JSON.stringify(merged, null, 2)}\n`);

console.log(`\nDevice matrix across ${results.length} phone(s): ${merged.status} — ${merged.conditions.filter((c) => c.status === 'PASS').length}/${CONDITIONS.length} conditions`);
if (merged.status !== 'PASS') process.exit(1);

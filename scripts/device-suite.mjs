// The whole device evidence chain, with one account for all of it.
//
// Four scripts used to stage their own test account, their own demo profiles
// and their own test match, then take them away again: the device matrix (once
// per condition, four times), the offline journey, and the performance run.
// Seven round trips to a production database to create the same three profiles.
// Staging costs 20 to 40 seconds each time, and it is the same account every
// time.
//
//   node scripts/device-suite.mjs            matrix, offline journey, performance
//   node scripts/device-suite.mjs matrix     just the matrix
import { execFileSync } from 'node:child_process';

const steps = process.argv.slice(2);
const wanted = steps.length > 0 ? steps : ['matrix', 'offline', 'performance'];

function run(command, args, env) {
  execFileSync(command, args, { stdio: 'inherit', env: { ...process.env, ...env } });
}

function stage() {
  const output = execFileSync(process.execPath, ['scripts/stage-test-account.mjs', 'create'], { encoding: 'utf8' });
  process.stdout.write(output);
  const email = /E-Mail:\s*(\S+)/.exec(output)?.[1];
  const password = /Passwort:\s*(\S+)/.exec(output)?.[1];
  if (!email || !password) throw new Error('Could not read the staged account');
  run(process.execPath, ['scripts/stage-demo-profiles.mjs', 'create', 'docs/demo-profiles.json']);
  run(process.execPath, ['scripts/stage-test-match.mjs', 'create']);
  return { email, password };
}

function unstage() {
  for (const args of [['scripts/stage-test-match.mjs', 'remove'],
    ['scripts/stage-demo-profiles.mjs', 'remove', 'docs/demo-profiles.json'],
    ['scripts/stage-test-account.mjs', 'remove']]) {
    try { execFileSync(process.execPath, args, { stdio: 'inherit' }); } catch { /* keep going */ }
  }
}

const account = stage();
const shared = { BINDER_STAGED: '1', MAESTRO_EMAIL: account.email, MAESTRO_PASSWORD: account.password };
const failures = [];

try {
  for (const step of wanted) {
    const script = { matrix: 'scripts/device-matrix.mjs', offline: 'scripts/e2e-offline.mjs', performance: 'scripts/performance.mjs' }[step];
    if (!script) { failures.push(`${step}: no such step`); continue; }
    console.log(`\n════ ${step} ════`);
    try {
      run(process.execPath, [script], shared);
    } catch {
      // One failing step must not cost the evidence of the others: the release
      // candidate reads each record on its own.
      failures.push(step);
    }
  }
} finally {
  unstage();
}

if (failures.length > 0) {
  console.error(`\nFailed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nEvery step passed, on one staged account.');

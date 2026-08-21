// Runs the black-box journeys against whatever build is on the device.
//
// The journeys need an account, and an account that survives a test run is
// litter in a production database — so this stages one, runs Maestro, and takes
// it away again whatever happens. The credentials never touch the repository or
// a command line: they are handed to Maestro through the environment.
//
//   node scripts/e2e.mjs                 every journey under .maestro
//   node scripts/e2e.mjs 01-auth.yaml    one of them
//
// BINDER_STAGED=1 says the caller has already created the account and the demo
// profiles and will remove them itself. The device matrix runs these journeys
// four times in a row; staging four accounts to throw away three of them cost
// more wall-clock than two of the journeys together.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const maestro = join(homedir(), '.maestro/maestro/bin/maestro');
const javaHome = process.env.JAVA_HOME ?? join(homedir(), '.local/jdk/jdk-21.0.12+8');
if (!existsSync(maestro)) {
  console.error(`Maestro is not installed at ${maestro}. Install the pinned CLI release first.`);
  process.exit(1);
}

const target = process.argv[2] ? join('.maestro', process.argv[2]) : '.maestro';

function stage() {
  const output = execFileSync(process.execPath, ['scripts/stage-test-account.mjs', 'create'], { encoding: 'utf8' });
  const email = /E-Mail:\s*(\S+)/.exec(output)?.[1];
  const password = /Passwort:\s*(\S+)/.exec(output)?.[1];
  if (!email || !password) throw new Error('Could not read the staged account from stage-test-account.mjs');
  execFileSync(process.execPath, ['scripts/stage-demo-profiles.mjs', 'create', 'docs/demo-profiles.json'], { stdio: 'inherit' });
  // A conversation to walk into: deciding twice through the app would make the
  // chat journey a test of the deck.
  execFileSync(process.execPath, ['scripts/stage-test-match.mjs', 'create'], { stdio: 'inherit' });
  return { email, password };
}

function unstage() {
  try { execFileSync(process.execPath, ['scripts/stage-test-match.mjs', 'remove'], { stdio: 'ignore' }); } catch { /* keep going */ }
  try { execFileSync(process.execPath, ['scripts/stage-demo-profiles.mjs', 'remove', 'docs/demo-profiles.json'], { stdio: 'ignore' }); } catch { /* keep going */ }
  try { execFileSync(process.execPath, ['scripts/stage-test-account.mjs', 'remove'], { stdio: 'ignore' }); } catch { /* keep going */ }
}

const preStaged = process.env.BINDER_STAGED === '1' && process.env.MAESTRO_EMAIL && process.env.MAESTRO_PASSWORD;
let failure = null;
const account = preStaged
  ? { email: process.env.MAESTRO_EMAIL, password: process.env.MAESTRO_PASSWORD }
  : stage();
try {
  // The offline scenario's steps carry the `scenario` tag: they assume a
  // network state and a screen that only their runner sets up, so a plain
  // folder run must not pick them up.
  // --debug-output puts this run's screenshots in a folder only this run knows.
  // Without it Maestro writes into ~/.maestro/tests/<timestamp>, and two phones
  // running at the same time pick up each other's pictures.
  execFileSync(maestro, [
    ...(process.env.ANDROID_SERIAL ? ['--device', process.env.ANDROID_SERIAL] : []),
    'test',
    ...(process.env.BINDER_DEBUG_OUTPUT ? ['--debug-output', process.env.BINDER_DEBUG_OUTPUT] : []),
    '--exclude-tags=scenario', target,
  ], {
    stdio: 'inherit',
    env: {
      ...process.env,
      JAVA_HOME: javaHome,
      PATH: `${javaHome}/bin:${process.env.PATH}`,
      MAESTRO_EMAIL: account.email,
      MAESTRO_PASSWORD: account.password,
    },
  });
} catch (error) {
  failure = error;
} finally {
  if (!preStaged) unstage();
}

// The record the release gate reads: which journeys ran, on which build, with
// what result. A journey that was not run is not a journey that passed.
mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/e2e-evidence.json', `${JSON.stringify({
  ranAt: new Date().toISOString(),
  target,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  installedVersion: (() => {
    try {
      const dump = execFileSync(process.env.ADB ?? `${process.env.HOME}/Android/Sdk/platform-tools/adb`, [...(process.env.ANDROID_SERIAL ? ['-s', process.env.ANDROID_SERIAL] : []), 'shell', 'dumpsys', 'package', 'de.beko2210.binder'], { encoding: 'utf8' });
      return {
        versionName: /versionName=(\S+)/.exec(dump)?.[1] ?? null,
        versionCode: Number(/versionCode=(\d+)/.exec(dump)?.[1] ?? 0) || null,
      };
    } catch { return null; }
  })(),
  status: failure ? 'FAIL' : 'PASS',
}, null, 2)}\n`);

if (failure) {
  console.error(preStaged
    ? '\nJourneys failed. The account stays: whoever staged it takes it away.'
    : '\nJourneys failed. The staged account and demo profiles were removed.');
  process.exit(1);
}
console.log(preStaged
  ? '\nJourneys passed. The account stays: whoever staged it takes it away.'
  : '\nJourneys passed. The staged account and demo profiles were removed.');

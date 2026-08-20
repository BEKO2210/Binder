// Runs the black-box journeys against whatever build is on the device.
//
// The journeys need an account, and an account that survives a test run is
// litter in a production database — so this stages one, runs Maestro, and takes
// it away again whatever happens. The credentials never touch the repository or
// a command line: they are handed to Maestro through the environment.
//
//   node scripts/e2e.mjs                 every journey under .maestro
//   node scripts/e2e.mjs 01-auth.yaml    one of them
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

let failure = null;
const account = stage();
try {
  // The offline scenario's steps carry the `scenario` tag: they assume a
  // network state and a screen that only their runner sets up, so a plain
  // folder run must not pick them up.
  execFileSync(maestro, [...(process.env.ANDROID_SERIAL ? ['--device', process.env.ANDROID_SERIAL] : []), 'test', '--exclude-tags=scenario', target], {
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
  unstage();
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
  console.error('\nJourneys failed. The staged account and demo profiles were removed.');
  process.exit(1);
}
console.log('\nJourneys passed. The staged account and demo profiles were removed.');

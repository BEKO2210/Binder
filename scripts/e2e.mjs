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
import { existsSync } from 'node:fs';
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
  execFileSync(maestro, ['test', target], {
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

if (failure) {
  console.error('\nJourneys failed. The staged account and demo profiles were removed.');
  process.exit(1);
}
console.log('\nJourneys passed. The staged account and demo profiles were removed.');

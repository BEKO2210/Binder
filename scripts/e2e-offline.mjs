// The journey that needs the network taken away.
//
// Maestro drives the screen; it does not drive the radio. So this script owns
// the sequence: sign in, cut the network, write a message, kill the process
// while it is still waiting, restore the network, and require the app to
// deliver it on its own. That is the exact failure this app was rebuilt around
// — a message typed on a train and an app closed at the station.
//
//   node scripts/e2e-offline.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const adb = process.env.ADB ?? join(homedir(), 'Android/Sdk/platform-tools/adb');
const maestro = join(homedir(), '.maestro/maestro/bin/maestro');
const javaHome = process.env.JAVA_HOME ?? join(homedir(), '.local/jdk/jdk-21.0.12+8');
const appId = 'de.beko2210.binder';
const text = `offline-${Date.now().toString().slice(-6)}`;

if (!existsSync(maestro) || !existsSync(adb)) {
  console.error('This journey needs both the pinned Maestro CLI and adb.');
  process.exit(1);
}


// One phone per run, chosen once: with two attached, adb answers "more than one
// device/emulator" and the run dies halfway through. ANDROID_SERIAL picks.
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
    console.error(`More than one device is attached (${attached.join(', ')}). Pick one with ANDROID_SERIAL=<serial>.`);
    process.exit(1);
  }
  return attached[0];
}
const serial = chosenSerial();

const device = (...args) => execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8' });
const network = (state) => {
  device('shell', 'svc', 'wifi', state ? 'enable' : 'disable');
  device('shell', 'svc', 'data', state ? 'enable' : 'disable');
};

function flow(file, account) {
  execFileSync(maestro, ['--device', serial, 'test', '--include-tags=scenario', join('.maestro', file)], {
    stdio: 'inherit',
    env: {
      ...process.env,
      JAVA_HOME: javaHome,
      PATH: `${javaHome}/bin:${process.env.PATH}`,
      MAESTRO_EMAIL: account.email,
      MAESTRO_PASSWORD: account.password,
      MAESTRO_OFFLINE_TEXT: text,
    },
  });
}

function stage() {
  const output = execFileSync(process.execPath, ['scripts/stage-test-account.mjs', 'create'], { encoding: 'utf8' });
  const email = /E-Mail:\s*(\S+)/.exec(output)?.[1];
  const password = /Passwort:\s*(\S+)/.exec(output)?.[1];
  execFileSync(process.execPath, ['scripts/stage-demo-profiles.mjs', 'create', 'docs/demo-profiles.json'], { stdio: 'inherit' });
  execFileSync(process.execPath, ['scripts/stage-test-match.mjs', 'create'], { stdio: 'inherit' });
  return { email, password };
}

function unstage() {
  for (const args of [['scripts/stage-test-match.mjs', 'remove'], ['scripts/stage-demo-profiles.mjs', 'remove', 'docs/demo-profiles.json'], ['scripts/stage-test-account.mjs', 'remove']]) {
    try { execFileSync(process.execPath, args, { stdio: 'ignore' }); } catch { /* keep going */ }
  }
}

const account = stage();
let failure = null;
try {
  // Sign in while there is still a network, so the offline half is only about
  // the message.
  device('shell', 'pm', 'clear', appId);
  flow('00-signin.yaml', account);
  flow('04a-open-chat.yaml', account);

  console.log('\n── network off ──');
  network(false);
  execFileSync('sleep', ['5']);
  flow('04-offline-send.yaml', account);

  console.log('\n── killing the app while the message waits ──');
  device('shell', 'am', 'force-stop', appId);

  console.log('\n── network on ──');
  network(true);
  execFileSync('sleep', ['12']);

  flow('05-offline-delivered.yaml', account);
} catch (error) {
  failure = error;
} finally {
  network(true);
  unstage();
}

mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/e2e-offline-evidence.json', `${JSON.stringify({
  ranAt: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  message: text,
  status: failure ? 'FAIL' : 'PASS',
}, null, 2)}\n`);

if (failure) {
  console.error(`\nThe offline journey failed. Text used: ${text}`);
  process.exit(1);
}
console.log(`\nThe offline journey passed: ${text} survived no network, a killed process, and was delivered on its own.`);

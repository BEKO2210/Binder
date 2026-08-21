// The same journeys, under the conditions people actually hold the phone in.
//
// A build that works on one phone in one theme at one font size has been tested
// once, not tested well. The conditions below are the ones that have broken
// this app before: a doubled system font clipping a fixed-height control, a
// light theme with a colour that ignored it, an animation that never ended
// because the system was told not to animate, and a network slow enough to make
// every loading state visible.
//
// Each condition is set through adb, the journeys run against the build already
// installed, and the result is written down per condition. Nothing here is
// inferred: a condition that could not be set is recorded as not covered.
//
//   node scripts/device-matrix.mjs                 every condition
//   node scripts/device-matrix.mjs dark 200-font   a subset
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const adb = process.env.ADB ?? join(homedir(), 'Android/Sdk/platform-tools/adb');
if (!existsSync(adb)) {
  console.error(`adb not found at ${adb}`);
  process.exit(1);
}


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

const shell = (...args) => execFileSync(adb, ['-s', serial, 'shell', ...args], { encoding: 'utf8' }).trim();

function device() {
  return {
    model: shell('getprop', 'ro.product.model'),
    android: shell('getprop', 'ro.build.version.release'),
    api: Number(shell('getprop', 'ro.build.version.sdk')),
    screen: shell('wm', 'size').replace('Physical size: ', ''),
    density: shell('wm', 'density').replace('Physical density: ', ''),
  };
}

// Each condition knows how to set itself and how to put the phone back.
const CONDITIONS = {
  'light': {
    why: 'the theme most people have during the day, and where a hand-written colour shows',
    apply: () => shell('cmd', 'uimode', 'night', 'no'),
    reset: () => shell('cmd', 'uimode', 'night', 'yes'),
  },
  'dark': {
    why: 'the app is designed dark first',
    apply: () => shell('cmd', 'uimode', 'night', 'yes'),
    reset: () => {},
  },
  '200-font': {
    why: 'a doubled system font has clipped fixed-height controls here before',
    apply: () => shell('settings', 'put', 'system', 'font_scale', '2.0'),
    reset: () => shell('settings', 'put', 'system', 'font_scale', '1.0'),
  },
  'reduced-motion': {
    why: 'animations are switched off system-wide, and a transition that waits for one never ends',
    apply: () => {
      for (const key of ['transition_animation_scale', 'animator_duration_scale', 'window_animation_scale']) {
        shell('settings', 'put', 'global', key, '0');
      }
    },
    reset: () => {
      for (const key of ['transition_animation_scale', 'animator_duration_scale', 'window_animation_scale']) {
        shell('settings', 'put', 'global', key, '1');
      }
    },
  },
};

// The child's output is captured rather than inherited: a run started in the
// background inherits no terminal, and the first version of this recorded four
// failures whose reason existed only in a stream nobody kept.
// One account and one set of demo profiles for the whole matrix. Every
// condition used to stage its own and throw it away again — four round trips to
// the database to create the same three profiles, which cost more time than two
// of the journeys.
function stageOnce() {
  const output = execFileSync(process.execPath, ['scripts/stage-test-account.mjs', 'create'], { encoding: 'utf8' });
  const email = /E-Mail:\s*(\S+)/.exec(output)?.[1];
  const password = /Passwort:\s*(\S+)/.exec(output)?.[1];
  if (!email || !password) throw new Error('Could not read the staged account');
  execFileSync(process.execPath, ['scripts/stage-demo-profiles.mjs', 'create', 'docs/demo-profiles.json'], { stdio: 'inherit' });
  execFileSync(process.execPath, ['scripts/stage-test-match.mjs', 'create'], { stdio: 'inherit' });
  return { email, password };
}

function unstageOnce() {
  for (const args of [['scripts/stage-test-match.mjs', 'remove'],
    ['scripts/stage-demo-profiles.mjs', 'remove', 'docs/demo-profiles.json'],
    ['scripts/stage-test-account.mjs', 'remove']]) {
    try { execFileSync(process.execPath, args, { stdio: 'ignore' }); } catch { /* keep going */ }
  }
}

function runJourneys() {
  try {
    const output = execFileSync(process.execPath, ['scripts/e2e.mjs'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BINDER_STAGED: '1', MAESTRO_EMAIL: account.email, MAESTRO_PASSWORD: account.password },
    });
    process.stdout.write(output);
    return output;
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    process.stdout.write(output);
    const reason = /\[Failed\][^\n]*/.exec(output)?.[0] ?? output.trim().split('\n').slice(-3).join(' | ').slice(0, 300);
    const wrapped = new Error(reason || 'journeys failed with no output');
    throw wrapped;
  }
}

// Where a person looks afterwards. The assertions prove the words are there;
// only somebody looking at a picture can see that they fit on the screen — which
// is exactly how a doubled system font broke the discovery header while every
// journey stayed green.
const runStamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const runCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim().slice(0, 8);
// This repository is public. Screenshots of a run show the staged demo profiles
// and whatever the phone had on screen, so they go to the private one, next to
// the rest of the evidence: BEKO2210/binder-internal, checked out at
// ~/binder-internal. BINDER_PUBLISH_RUNS=1 puts them under artifacts/ instead,
// for the day that is a deliberate choice.
const INTERNAL_REPO = join(homedir(), 'binder-internal');
const runRoot = process.env.BINDER_PUBLISH_RUNS === '1'
  ? 'artifacts/device-runs'
  : join(INTERNAL_REPO, 'belege/device-runs');
const runDir = `${runRoot}/${runStamp}-${runCommit}`;
// Maestro 2.8 keeps what a flow captured under its own run folder, one level
// deeper than the name in the yaml suggests:
//   ~/.maestro/tests/<run>/<flow name>/takeScreenshot/shots/deck.png
// so the pictures are fetched from there rather than from the working directory.
const MAESTRO_RUNS = join(homedir(), '.maestro/tests');

function newestMaestroRun(since) {
  if (!existsSync(MAESTRO_RUNS)) return null;
  const runs = readdirSync(MAESTRO_RUNS)
    .map((name) => ({ name, at: statSync(join(MAESTRO_RUNS, name)).mtimeMs }))
    .filter((run) => run.at >= since)
    .sort((a, b) => b.at - a.at);
  return runs[0] ? join(MAESTRO_RUNS, runs[0].name) : null;
}

function pngsUnder(directory, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) pngsUnder(path, found);
    else if (entry.name.endsWith('.png')) found.push(path);
  }
  return found;
}

// With two phones running, the newest folder under ~/.maestro/tests belongs to
// whichever run wrote last — not necessarily this one. So each run gets its own
// output folder and reads only from there.
const debugRoot = process.env.BINDER_DEBUG_OUTPUT ?? null;

function collectShots(condition, startedAt) {
  const target = `${runDir}/${condition}`;
  mkdirSync(target, { recursive: true });
  const run = debugRoot && existsSync(debugRoot) ? debugRoot : newestMaestroRun(startedAt);
  if (run) {
    for (const png of pngsUnder(run)) {
      const flow = png.split('/').slice(-4, -3)[0]?.split(' ')[0]?.toLowerCase() ?? 'flow';
      cpSync(png, `${target}/${flow}-${png.split('/').pop()}`);
    }
  }
  // Maestro writes what the flows asked for; the last screen is captured here
  // so a failure leaves a picture of where it stopped.
  try {
    const png = execFileSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
    writeFileSync(`${target}/zz-last-screen.png`, png);
  } catch { /* the phone may be mid-restart */ }
  return readdirSync(target);
}

const wanted = process.argv.slice(2).filter((argument) => argument in CONDITIONS);
const plan = wanted.length > 0 ? wanted : Object.keys(CONDITIONS);
// Samsung Pass offers to save the login the moment a password is typed, and the
// dialog sits on top of the app: every tap after it lands on the wrong window.
// The autofill service is switched off for the run and put back afterwards —
// this is somebody's phone, not a lab device.
const autofillBefore = (() => {
  try { return shell('settings', 'get', 'secure', 'autofill_service'); } catch { return null; }
})();
try { shell('settings', 'put', 'secure', 'autofill_service', 'null'); } catch { /* not every phone has one */ }
process.on('exit', () => {
  if (!autofillBefore || autofillBefore === 'null') return;
  try { shell('settings', 'put', 'secure', 'autofill_service', autofillBefore); } catch { /* the phone may be gone */ }
});

const hardware = device();
const results = [];
// The suite runner may have staged already; a second account would delete the
// first one's demo profiles while the run is using them.
const preStaged = process.env.BINDER_STAGED === '1' && process.env.MAESTRO_EMAIL && process.env.MAESTRO_PASSWORD;
const account = preStaged
  ? { email: process.env.MAESTRO_EMAIL, password: process.env.MAESTRO_PASSWORD }
  : stageOnce();

console.log(`Device: ${hardware.model}, Android ${hardware.android} (API ${hardware.api}), ${hardware.screen} @ ${hardware.density}\n`);

for (const name of plan) {
  const condition = CONDITIONS[name];
  console.log(`── ${name}: ${condition.why} ──`);
  const startedAt = Date.now() - 1000;
  let status = 'PASS';
  let detail = '';
  let retried = false;
  try {
    condition.apply();
    try {
      runJourneys();
    } catch (first) {
      // Maestro's on-device server dies now and then, and the adb connection
      // with it. That is the harness failing, not the app, and recording it as
      // a product failure would teach us to ignore red. One retry after a
      // reset, and the retry is written down.
      retried = true;
      console.log('   harness hiccup — resetting adb and trying this condition once more');
      // Never kill-server here: it takes down the connection to every attached
      // phone, and with two runs in parallel that means killing somebody else's
      // test. Reconnecting this one device does the same job.
      try { execFileSync(adb, ['-s', serial, 'reconnect'], { stdio: 'ignore' }); } catch { /* it may already be gone */ }
      execFileSync('sleep', ['5']);
      runJourneys();
      detail = `passed on the second attempt after ${first instanceof Error ? first.message.split('\n')[0] : 'a harness failure'}`;
    }
  } catch (error) {
    status = 'FAIL';
    detail = error instanceof Error ? error.message.split('\n')[0] : String(error);
  } finally {
    try { condition.reset(); } catch { detail += ' (condition could not be reset)'; }
  }
  const shots = collectShots(name, startedAt);
  results.push({ condition: name, why: condition.why, status, retried, detail, shots });
  console.log(`   ${status} — ${shots.length} screenshot(s)\n`);
}

if (!preStaged) unstageOnce();

mkdirSync('artifacts', { recursive: true });
const evidence = {
  ranAt: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  device: hardware,
  installed: (() => {
    const dump = shell('dumpsys', 'package', 'de.beko2210.binder');
    return {
      versionName: /versionName=(\S+)/.exec(dump)?.[1] ?? null,
      versionCode: Number(/versionCode=(\d+)/.exec(dump)?.[1] ?? 0) || null,
    };
  })(),
  conditions: results,
  status: results.every((result) => result.status === 'PASS') ? 'PASS' : 'FAIL',
};
// One file per phone when several run at once; the merged one is written by the
// parallel runner.
const evidencePath = process.env.BINDER_EVIDENCE_FILE ?? 'artifacts/device-evidence.json';
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

// The page a person opens. Markdown, because GitHub renders it: four
// conditions, the pictures underneath each, and what the machine thought.
const review = [
  `# Gerätelauf ${runStamp} · ${runCommit}`,
  '',
  `${hardware.model}, Android ${hardware.android} (API ${hardware.api}), ${hardware.screen} @ ${hardware.density}`,
  `App: ${evidence.installed.versionName} (${evidence.installed.versionCode}) · Urteil der Maschine: **${evidence.status}**`,
  '',
  'Die Zusicherungen beweisen, dass die Worte da sind. Ob sie auf den Bildschirm',
  'passen, sieht nur ein Mensch — deshalb diese Seite.',
  '',
  ...results.flatMap((result) => [
    `## ${result.condition} — ${result.status}${result.retried ? ' (Wiederholung)' : ''}`,
    '',
    result.why,
    result.detail ? `\n\`${result.detail}\`` : '',
    '',
    ...result.shots.map((shot) => `![${result.condition} ${shot}](${result.condition}/${shot})`),
    '',
  ]),
].join('\n');
writeFileSync(`${runDir}/REVIEW.md`, `${review}\n`);
cpSync(evidencePath, `${runDir}/device-evidence.json`);

console.log(`Device matrix: ${evidence.status} — ${results.filter((r) => r.status === 'PASS').length}/${results.length} conditions`);
console.log('Written to artifacts/device-evidence.json');
console.log(`For a human: ${runDir}/REVIEW.md`);

// The evidence is only useful if somebody can find it later. Committing it to
// the private repository is what turns a folder on one laptop into a record.
if (runRoot.startsWith(INTERNAL_REPO) && existsSync(join(INTERNAL_REPO, '.git'))) {
  try {
    execFileSync('git', ['add', 'belege/device-runs'], { cwd: INTERNAL_REPO, stdio: 'ignore' });
    execFileSync('git', ['-c', 'user.name=Binder device matrix', '-c', 'user.email=nullmesh@protonmail.com',
      'commit', '-m', `Geraetelauf ${runStamp} · ${runCommit} · ${evidence.status}`], { cwd: INTERNAL_REPO, stdio: 'ignore' });
    execFileSync('git', ['push'], { cwd: INTERNAL_REPO, stdio: 'ignore' });
    console.log('Recorded in binder-internal.');
  } catch {
    console.log('Could not record the run in binder-internal — the folder is written, the commit is not.');
  }
}
if (evidence.status !== 'PASS') process.exit(1);

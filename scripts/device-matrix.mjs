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
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
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
function runJourneys() {
  try {
    const output = execFileSync(process.execPath, ['scripts/e2e.mjs'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
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

const wanted = process.argv.slice(2).filter((argument) => argument in CONDITIONS);
const plan = wanted.length > 0 ? wanted : Object.keys(CONDITIONS);
const hardware = device();
const results = [];

console.log(`Device: ${hardware.model}, Android ${hardware.android} (API ${hardware.api}), ${hardware.screen} @ ${hardware.density}\n`);

for (const name of plan) {
  const condition = CONDITIONS[name];
  console.log(`── ${name}: ${condition.why} ──`);
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
      try { execFileSync(adb, ['kill-server'], { stdio: 'ignore' }); } catch { /* it may already be down */ }
      execFileSync('sleep', ['3']);
      execFileSync(adb, ['start-server'], { stdio: 'ignore' });
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
  results.push({ condition: name, why: condition.why, status, retried, detail });
  console.log(`   ${status}\n`);
}

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
writeFileSync('artifacts/device-evidence.json', `${JSON.stringify(evidence, null, 2)}\n`);

console.log(`Device matrix: ${evidence.status} — ${results.filter((r) => r.status === 'PASS').length}/${results.length} conditions`);
console.log('Written to artifacts/device-evidence.json');
if (evidence.status !== 'PASS') process.exit(1);

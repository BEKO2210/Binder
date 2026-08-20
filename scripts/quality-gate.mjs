// One list of checks, for CI and for a release alike.
//
// Until now there were two: the workflow ran about twenty-five things, and the
// production build ran five of them plus the tests. "CI is green" and "this
// candidate was checked" were different sentences, and the shorter list was the
// one standing between a mistake and the Play Store.
//
// So the list lives here, once. CI calls it, the production workflow calls it,
// and scripts/release-build.mjs calls it before it will stage anything. Adding
// a check in one place adds it everywhere by construction.
//
//   node scripts/quality-gate.mjs             the checks that need only Node
//   node scripts/quality-gate.mjs --android   plus prebuild, bundle and size
//   node scripts/quality-gate.mjs --list      what would run, in order
//
// The database suites live in their own workflow because they need Docker; the
// release gate records their result rather than running them here.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPORT = 'artifacts/quality-gate.json';

/** Generators first: several checks compare against what these produce. */
export const PREPARE = [
  ['brand assets', 'npm', ['run', 'brand:assets']],
  ['site assets', 'npm', ['run', 'site:prepare']],
];

export const CHECKS = [
  ['entrypoint', 'node', ['scripts/verify-entrypoint.mjs']],
  ['pinned toolchain', 'node', ['scripts/verify-pinned-toolchain.mjs']],
  ['no credentials in the index', 'node', ['scripts/verify-no-secrets.mjs']],
  ['guards catch their own fixtures', 'node', ['scripts/verify-gate-selftests.mjs']],
  ['native branding', 'npm', ['run', 'verify:brand']],
  ['public site', 'node', ['scripts/verify-site.mjs']],
  ['mail templates', 'npm', ['run', 'verify:mail-templates']],
  ['site language page', 'npm', ['run', 'verify:site-languages']],
  ['site matches templates', 'node', ['scripts/build-site-i18n.mjs', '--check']],
  ['site language switch', 'node', ['scripts/verify-site-language-switch.mjs']],
  ['site download', 'node', ['scripts/verify-site-download.mjs']],
  ['data safety declaration', 'npm', ['run', 'verify:data-safety']],
  ['admin authorization', 'npm', ['run', 'verify:admin']],
  ['safety contract', 'node', ['scripts/verify-safety-contract.mjs']],
  ['beta contract', 'node', ['scripts/verify-phase5-contract.mjs']],
  ['visual system', 'npm', ['run', 'verify:phase6-design']],
  ['settings contract', 'npm', ['run', 'verify:phase6-settings']],
  ['media path', 'npm', ['run', 'verify:phase6-media']],
  ['push and communication', 'npm', ['run', 'verify:phase7-push']],
  ['design contract', 'npm', ['run', 'verify:design-contract']],
  ['worklet contract', 'node', ['scripts/verify-worklet-contract.mjs']],
  ['request deadlines', 'node', ['scripts/verify-request-deadlines.mjs']],
  ['locale registry', 'node', ['scripts/verify-i18n.mjs']],
  ['localization coverage', 'node', ['scripts/verify-i18n-coverage.mjs']],
  ['push copy', 'node', ['scripts/build-push-copy.mjs', '--check']],
  // Behaviour rules only (hooks, shadowing); the four AST verifiers above cover
  // what is specific to Binder, and TypeScript covers types. Warnings do not
  // fail the build, errors do — see eslint.config.mjs for why each rule is on.
  ['lint (behaviour rules)', 'npx', ['eslint', 'src', '--max-warnings=9999']],
  ['typescript (app)', 'npm', ['run', 'typecheck']],
  ['typescript (tests)', 'npm', ['run', 'typecheck:tests']],
  ['unit tests', 'npm', ['test']],
  ['branch coverage floors', 'node', ['scripts/verify-coverage-floors.mjs']],
  // Last, because it reads the numbers the checks above just proved.
  ['readme matches its sources', 'node', ['scripts/build-readme.mjs', '--check']],
];

export const ANDROID_CHECKS = [
  ['android prebuild', 'npx', ['expo', 'prebuild', '--platform', 'android', '--no-install', '--clean']],
  ['android bundle', 'npm', ['run', 'bundlecheck']],
  ['export size budget', 'node', ['scripts/report-bundle-size.mjs']],
];

// scripts/build-readme.mjs imports this list so the README can describe the
// gate that actually runs. Importing must not run it.
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (!invokedDirectly) {
  // Nothing else to do: the lists above are the export.
} else {

const withAndroid = process.argv.includes('--android');
const plan = [...CHECKS, ...(withAndroid ? ANDROID_CHECKS : [])];

if (process.argv.includes('--list')) {
  for (const [name] of [...PREPARE, ...plan]) console.log(name);
  process.exit(0);
}

function run(name, command, args) {
  const started = Date.now();
  try {
    execFileSync(command, args, { stdio: 'inherit' });
    return { name, status: 'PASS', ms: Date.now() - started };
  } catch {
    return { name, status: 'FAIL', ms: Date.now() - started };
  }
}

const results = [];
for (const [name, command, args] of PREPARE) {
  console.log(`\n── ${name} ──`);
  results.push(run(name, command, args));
}
for (const [name, command, args] of plan) {
  console.log(`\n── ${name} ──`);
  results.push(run(name, command, args));
}

const failed = results.filter((result) => result.status === 'FAIL');
const report = {
  ranAt: new Date().toISOString(),
  android: withAndroid,
  status: failed.length === 0 ? 'PASS' : 'FAIL',
  checks: results,
};
mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);

console.log('\n── quality gate ──');
for (const result of results) console.log(`  ${result.status === 'PASS' ? 'ok  ' : 'FAIL'} ${result.name} (${(result.ms / 1000).toFixed(1)}s)`);
console.log(`\n${results.length} checks, ${failed.length} failed. Report: ${REPORT}`);

if (failed.length > 0) process.exit(1);

}

// The README is generated, because the numbers in it were wrong.
//
// It claimed 150+ database assertions while the suites had grown past 390, and
// "sixteen static verifiers" while the gate ran thirty. Nobody lied: a README is
// written once and the repository keeps moving. So every number below is read
// from the thing it describes — the gate list, the test files, the migrations,
// the locale folder, package.json — and README.md is the output.
//
//   node scripts/build-readme.mjs           write README.md
//   node scripts/build-readme.mjs --check    fail if it is out of date
//
// The prose lives in README.template.md with {{placeholders}}. Edit that file,
// never README.md.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ANDROID_CHECKS, CHECKS } from './quality-gate.mjs';

const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

/** How many assertions the pgTAP suites declare they will run. */
function databaseAssertions() {
  let total = 0;
  let files = 0;
  for (const file of readdirSync('supabase/tests')) {
    if (!file.endsWith('.sql')) continue;
    files += 1;
    const sql = readFileSync(join('supabase/tests', file), 'utf8');
    for (const [, count] of sql.matchAll(/\bplan\(\s*(\d+)\s*\)/g)) total += Number(count);
  }
  return { total, files };
}

/** The node suite counts itself: the runner is the only honest source. */
function nodeTests() {
  const output = execFileSync(process.execPath, [
    '--experimental-strip-types', '--test', '--test-reporter=tap',
    ...readdirSync('tests').filter((file) => file.endsWith('.test.ts')).map((file) => join('tests', file)),
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const passing = /^# pass (\d+)$/m.exec(output)?.[1];
  const failing = /^# fail (\d+)$/m.exec(output)?.[1];
  if (!passing || failing !== '0') throw new Error(`the node suite is not green — refusing to write a number into the README (fail ${failing})`);
  return Number(passing);
}

function localeFacts() {
  const files = readdirSync('src/i18n/locales').filter((file) => file.endsWith('.json'));
  const leaves = (object) => Object.values(object).reduce((sum, value) => sum + (value && typeof value === 'object' ? leaves(value) : 1), 0);
  return { languages: files.length, keys: leaves(JSON.parse(readFileSync(join('src/i18n/locales', files[0]), 'utf8'))) };
}

const database = databaseAssertions();
const locales = localeFacts();
const gateNames = [...CHECKS, ...ANDROID_CHECKS].map(([name]) => name);

// The commands a newcomer actually needs, taken from package.json so a renamed
// script cannot leave a dead line in the README.
const COMMANDS = ['start', 'typecheck', 'test', 'lint', 'gate', 'release'];
const commandRows = COMMANDS
  .filter((name) => packageJson.scripts[name])
  .map((name) => `| \`npm run ${name}\` | \`${packageJson.scripts[name]}\` |`)
  .join('\n');

const workflows = readdirSync('.github/workflows')
  .filter((file) => file.endsWith('.yml'))
  .map((file) => `\`${file}\``)
  .join(' · ');

const values = {
  version: app.version,
  versionCode: String(app.android.versionCode),
  androidBadgeVersion: app.version.replace(/-/g, '--'),
  nodeTests: String(nodeTests()),
  databaseAssertions: String(database.total),
  databaseSuites: String(database.files),
  gateChecks: String(gateNames.length),
  gateList: gateNames.map((name) => `\`${name}\``).join(' · '),
  languages: String(locales.languages),
  localeKeys: String(locales.keys),
  migrations: String(readdirSync('supabase/migrations').filter((file) => file.endsWith('.sql')).length),
  libModules: String(readdirSync('src/lib').filter((file) => file.endsWith('.ts')).length),
  expo: packageJson.dependencies.expo.replace('~', ''),
  reactNative: packageJson.dependencies['react-native'],
  commandRows,
  workflows,
};

const template = readFileSync('README.template.md', 'utf8');
const missing = [];
// `{{key}}` appears in the template as an example of the site's own syntax, so
// only names this script actually derives are treated as placeholders.
const rendered = template.replace(/\{\{(\w+)\}\}/g, (whole, name) => {
  if (values[name] !== undefined) return values[name];
  if (name === 'key') return whole;
  missing.push(name);
  return whole;
});
if (missing.length > 0) {
  console.error(`README.template.md asks for values that are not derived: ${[...new Set(missing)].join(', ')}`);
  process.exit(1);
}

if (process.argv.includes('--check')) {
  const current = readFileSync('README.md', 'utf8');
  if (current !== rendered) {
    console.error('README.md is out of date. Run: node scripts/build-readme.mjs');
    process.exit(1);
  }
  console.log(`README matches its sources (${values.gateChecks} checks, ${values.nodeTests} node tests, ${values.databaseAssertions} database assertions).`);
  process.exit(0);
}

writeFileSync('README.md', rendered);
console.log(`README written from ${Object.keys(values).length} derived values.`);

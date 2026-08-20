// The modules that must not get less tested than they are.
//
// Coverage as a headline number says nothing: a hundred percent of the wrong
// lines is still nothing. What matters here is that the handful of modules
// carrying decisions people cannot see — a queue on disk, a retry, a session
// ending, a photo being removed — do not quietly lose the branches somebody
// wrote a test for after a bug.
//
// So there is a floor per module, recorded from a measured run, and a run that
// falls below it fails. Raising a floor is a decision and shows up in a diff;
// lowering one has to be argued for in the same place.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const FLOORS = 'artifacts/coverage-floors.json';

function measure() {
  const output = execFileSync('node', [
    '--experimental-strip-types',
    '--experimental-test-coverage',
    '--test-reporter=lcov',
    '--test-reporter-destination=stdout',
    '--test',
    'tests/*.test.ts',
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

  // lcov: SF:<file> … BRF/BRH are branches found and hit.
  const perFile = new Map();
  let current = null;
  for (const line of output.split('\n')) {
    if (line.startsWith('SF:')) current = { file: line.slice(3).replace(`${process.cwd()}/`, ''), found: 0, hit: 0 };
    else if (line.startsWith('BRF:') && current) current.found = Number(line.slice(4));
    else if (line.startsWith('BRH:') && current) current.hit = Number(line.slice(4));
    else if (line === 'end_of_record' && current) {
      if (current.file.startsWith('src/lib/')) {
        perFile.set(current.file, current.found === 0 ? 100 : Math.round((current.hit / current.found) * 1000) / 10);
      }
      current = null;
    }
  }
  return perFile;
}

const measured = measure();
if (measured.size === 0) {
  console.error('No coverage data was produced. Did the test run fail?');
  process.exit(1);
}

if (process.argv.includes('--record')) {
  const floors = Object.fromEntries([...measured.entries()].sort());
  writeFileSync(FLOORS, `${JSON.stringify(floors, null, 2)}\n`);
  console.log(`Recorded branch coverage floors for ${measured.size} modules in src/lib.`);
  process.exit(0);
}

if (!existsSync(FLOORS)) {
  console.log(`No floors recorded yet. Run with --record. Measured ${measured.size} modules.`);
  process.exit(0);
}

const floors = JSON.parse(readFileSync(FLOORS, 'utf8'));
const regressions = [];
for (const [file, floor] of Object.entries(floors)) {
  const now = measured.get(file);
  if (now === undefined) {
    regressions.push(`${file}: no longer covered at all (was ${floor}% of branches)`);
    continue;
  }
  // A little slack for a branch that moved, not for a test that disappeared.
  if (now + 1 < floor) regressions.push(`${file}: ${floor}% → ${now}% of branches`);
}

if (regressions.length > 0) {
  console.error('Branch coverage went backwards:');
  for (const regression of regressions) console.error(`  ${regression}`);
  console.error('\nAdd the test the change needed, or record a new floor and say why in the commit.');
  process.exit(1);
}

console.log(`Branch coverage holds for ${Object.keys(floors).length} modules in src/lib.`);

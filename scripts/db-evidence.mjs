// Runs the database suites and records that they ran, for this commit.
//
// The release gate reads this file. A run that happened yesterday, or on
// another tree, is not evidence for the artefact being judged today.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
let status = 'PASS';
let output = '';
try {
  output = execFileSync('supabase', ['test', 'db'], { encoding: 'utf8' });
  process.stdout.write(output);
} catch (error) {
  status = 'FAIL';
  output = String(error.stdout ?? '') + String(error.stderr ?? '');
  process.stdout.write(output);
}

const files = [...output.matchAll(/tests\/([\w-]+\.sql)\s+\.+\s+ok/g)].map((match) => match[1]);
mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/database-evidence.json', `${JSON.stringify({
  ranAt: new Date().toISOString(),
  commit,
  status,
  suites: files.length,
  passed: files,
}, null, 2)}\n`);

console.log(`\nDatabase evidence: ${status}, ${files.length} suites — artifacts/database-evidence.json`);
if (status !== 'PASS') process.exit(1);

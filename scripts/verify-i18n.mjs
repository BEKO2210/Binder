// The registry must match what is on disk, and every locale must still parse.
// A build may not ship a language the app cannot actually load.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const before = readFileSync('src/i18n/registry.ts', 'utf8');
execFileSync(process.execPath, ['scripts/i18n-sync.mjs'], { stdio: 'pipe' });
const after = readFileSync('src/i18n/registry.ts', 'utf8');

if (before !== after) {
  console.error('src/i18n/registry.ts is stale — run `npm run i18n:sync` and commit the result.');
  process.exit(1);
}
console.log('Binder locale contract PASS');

// Keep the release folder honest: the newest twenty builds, plus the very
// first one ever made. Everything between them is noise nobody will install
// again, and 130 MB apiece adds up fast.
import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.env.BINDER_RELEASE_DIR ?? `${process.env.HOME}/Binder-Release`;
// Wie viele Fassungen bleiben. Standard zwanzig; beim Aufraeumen des Servers
// laesst sich die Zahl fuer einen Lauf senken, ohne die Vorgabe zu aendern.
const KEEP_NEWEST = Number(process.env.BINDER_KEEP_RELEASES ?? 20);
const dryRun = process.argv.includes('--check');

const versionOf = (name) => Number(name.match(/vc(\d+)/)?.[1] ?? NaN);
const builds = readdirSync(dir)
  .filter((name) => /\.(apk|aab)$/.test(name) && Number.isFinite(versionOf(name)))
  .map((name) => ({ name, version: versionOf(name), path: join(dir, name) }))
  .sort((a, b) => b.version - a.version);

const versions = [...new Set(builds.map((build) => build.version))].sort((a, b) => b - a);
const keep = new Set([...versions.slice(0, KEEP_NEWEST), versions.at(-1)]);
const doomed = builds.filter((build) => !keep.has(build.version));

let freed = 0;
for (const build of doomed) {
  freed += statSync(build.path).size;
  if (!dryRun) unlinkSync(build.path);
}
const label = dryRun ? 'would remove' : 'removed';
console.log(`${label} ${doomed.length} file(s), ${(freed / 1024 / 1024).toFixed(1)} MB — keeping versions ${[...keep].sort((a, b) => a - b).join(', ')}`);

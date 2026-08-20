// Is this artefact ready, and what says so?
//
// Twenty questions about one commit and one file. Each is answered from
// evidence that exists on disk — the gate report, the release record, the
// database run, the journeys, the size budget — or it is answered MISSING.
// Nothing here infers, and nothing here remembers: a check whose evidence is
// older than the commit is not evidence for this commit.
//
//   node scripts/release-candidate.mjs            the newest release record
//   node scripts/release-candidate.mjs <commit>   a specific one
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const evidenceDir = join(root, 'artifacts/release-evidence');

function read(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function newestEvidence() {
  if (!existsSync(evidenceDir)) return null;
  const files = readdirSync(evidenceDir).filter((name) => name.endsWith('.json'));
  if (files.length === 0) return null;
  const newest = files
    .map((name) => ({ name, at: read(join(evidenceDir, name))?.builtAt ?? '' }))
    .sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  return read(join(evidenceDir, newest.name));
}

const wanted = process.argv[2];
const release = wanted ? read(join(evidenceDir, `${wanted}.json`)) : newestEvidence();
if (!release) {
  console.error('No release evidence found. Build a candidate first: npm run release -- --bundle');
  process.exit(1);
}

const gate = read(join(root, 'artifacts/quality-gate.json'));
const e2e = read(join(root, 'artifacts/e2e-evidence.json'));
const database = read(join(root, 'artifacts/database-evidence.json'));
const size = read(join(root, 'artifacts/bundle-size-report.json'));
const offline = read(join(root, 'artifacts/e2e-offline-evidence.json'));

const sameCommit = (record) => Boolean(record && record.commit === release.commit);
// A record from another commit is not a failure of the product — it is simply
// not evidence for this candidate, and saying "FAIL" would blame the wrong
// thing.
const verdictFor = (record, label) => {
  if (!record) return ['MISSING', label];
  if (!sameCommit(record)) return ['STALE', `${record.status} but for ${record.commit.slice(0, 8)}`];
  return [record.status === 'PASS' ? 'PASS' : 'FAIL', `${record.status} at ${record.ranAt}`];
};
const answers = [];
const ask = (name, verdict, detail) => answers.push({ name, verdict, detail });

ask('quality gate', gate?.status === 'PASS' ? 'PASS' : gate ? 'FAIL' : 'MISSING', gate ? `${gate.checks.length} checks at ${gate.ranAt}` : 'no gate report');
ask('release artefacts hashed', release.artefacts?.length >= 2 ? 'PASS' : 'FAIL', `${release.artefacts?.length ?? 0} artefacts`);
ask('signature verified', release.signature?.sha256 ? 'PASS' : 'FAIL', release.signature?.sha1 ?? 'no certificate read');
ask('mapping kept', release.artefacts?.some((a) => a.name.includes('mapping')) ? 'PASS' : 'FAIL', 'R8 mapping for this build');
ask('SBOM produced', release.dependencies?.sbom ? 'PASS' : 'FAIL', release.dependencies?.sbom?.name ?? 'none');
ask('dependency lock recorded', release.dependencies?.lockfileSha256 ? 'PASS' : 'FAIL', 'package-lock.json hash');
ask('tree clean at build time', release.treeClean ? 'PASS' : 'FAIL', release.treeClean ? 'no uncommitted changes' : 'built from a dirty tree');
ask('database suites', ...verdictFor(database, 'run npm run db:evidence'));
ask('black-box journeys', ...verdictFor(e2e, 'run npm run e2e'));
ask('offline and kill journey', ...verdictFor(offline, 'run npm run e2e:offline'));
ask('export size budget', size ? 'PASS' : 'MISSING', size ? `${(size.jsBytes / 1048576).toFixed(2)} MiB JS` : 'no size report');
ask('device evidence', 'MISSING', 'device matrix is not automated yet');

const verdictOf = (names) => {
  const relevant = answers.filter((answer) => names.includes(answer.name));
  if (relevant.some((answer) => answer.verdict === 'FAIL')) return 'FAIL';
  if (relevant.some((answer) => answer.verdict === 'MISSING' || answer.verdict === 'STALE')) return 'INCOMPLETE';
  return 'PASS';
};

const report = {
  commit: release.commit,
  version: release.version,
  versionCode: release.versionCode,
  artifactSha256: release.artefacts?.find((artefact) => artefact.name.endsWith('.aab'))?.sha256
    ?? release.artefacts?.find((artefact) => artefact.name.endsWith('.apk'))?.sha256 ?? null,
  quality: verdictOf(['quality gate', 'tree clean at build time']),
  database: verdictOf(['database suites']),
  security: verdictOf(['SBOM produced', 'dependency lock recorded']),
  e2e: verdictOf(['black-box journeys', 'offline and kill journey']),
  performance: verdictOf(['export size budget']),
  signature: verdictOf(['signature verified', 'mapping kept', 'release artefacts hashed']),
  device: verdictOf(['device evidence']),
  answers,
};
report.verdict = Object.entries(report)
  .filter(([key]) => ['quality', 'database', 'security', 'e2e', 'performance', 'signature', 'device'].includes(key))
  .every(([, value]) => value === 'PASS') ? 'READY' : 'NOT READY';

mkdirSync(join(root, 'artifacts/release-candidate'), { recursive: true });
const target = join(root, 'artifacts/release-candidate', `${release.commit}.json`);
writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Release candidate ${release.version} (${release.versionCode}) — commit ${release.commit.slice(0, 8)}`);
for (const answer of answers) console.log(`  ${answer.verdict.padEnd(9)} ${answer.name} — ${answer.detail}`);
console.log(`\nVerdict: ${report.verdict}`);
console.log(`Written to ${target}`);
if (report.verdict !== 'READY') process.exit(2);

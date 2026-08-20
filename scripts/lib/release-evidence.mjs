// What was actually built, written down where nobody has to remember it.
//
// A green run and a shipped file used to be connected by a story: this commit
// passed CI, that AAB was uploaded, and the link between the two lived in
// somebody's head. Every number here comes out of the artefact or the tree it
// was built from — hashes, the certificate the file is actually signed with,
// the lockfile the dependencies came from, the result of the quality gate that
// ran for this build.
//
// No secrets: fingerprints and hashes identify, they do not unlock.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

export function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function git(args) {
  try { return execFileSync('git', args, { encoding: 'utf8' }).trim(); } catch { return ''; }
}

/** The certificate the file carries, read from the file itself. */
export function certificateOf(apkPath, apksigner, environment) {
  const output = execFileSync(apksigner, ['verify', '--print-certs', apkPath], { encoding: 'utf8', env: environment });
  return {
    sha1: output.match(/certificate SHA-1 digest:\s*([0-9a-f]+)/)?.[1] ?? null,
    sha256: output.match(/certificate SHA-256 digest:\s*([0-9a-f]+)/)?.[1] ?? null,
  };
}

export function writeEvidence({ root, version, versionCode, artefacts, certificate, sbomPath }) {
  const commit = git(['rev-parse', 'HEAD']);
  // The evidence file this build is about to write does not count as a dirty
  // tree — that would make every clean build report itself unclean.
  const dirty = git(['status', '--porcelain'])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.includes('artifacts/'))
    .length > 0;
  const gateReportPath = join(root, 'artifacts/quality-gate.json');
  const gate = existsSync(gateReportPath) ? JSON.parse(readFileSync(gateReportPath, 'utf8')) : null;

  const evidence = {
    commit,
    treeClean: !dirty,
    version,
    versionCode,
    builtAt: new Date().toISOString(),
    node: process.version,
    artefacts: artefacts.filter((path) => existsSync(path)).map((path) => ({
      name: basename(path),
      bytes: statSync(path).size,
      sha256: sha256(path),
    })),
    signature: certificate,
    dependencies: {
      lockfileSha256: existsSync(join(root, 'package-lock.json')) ? sha256(join(root, 'package-lock.json')) : null,
      sbom: sbomPath && existsSync(sbomPath) ? { name: basename(sbomPath), sha256: sha256(sbomPath) } : null,
    },
    qualityGate: gate ? { status: gate.status, checks: gate.checks.length, ranAt: gate.ranAt, android: gate.android } : null,
  };

  const target = join(root, 'artifacts/release-evidence', `${commit || 'unknown'}.json`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(evidence, null, 2)}\n`);
  return { target, evidence };
}

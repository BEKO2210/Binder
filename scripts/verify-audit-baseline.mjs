import { readFileSync } from 'node:fs';

const audit = JSON.parse(readFileSync(process.argv[2] ?? 'npm-audit.json', 'utf8'));
const vulnerabilities = audit.vulnerabilities ?? {};
const allowedAdvisories = new Set([
  'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr',
  'https://github.com/advisories/GHSA-5p2g-fcmc-qvqq',
]);

function leavesFor(name, seen = new Set()) {
  if (seen.has(name)) return new Set();
  seen.add(name);
  const node = vulnerabilities[name];
  if (!node) return new Set([`unresolved:${name}`]);
  const leaves = new Set();
  for (const via of node.via ?? []) {
    if (typeof via === 'string') {
      for (const leaf of leavesFor(via, new Set(seen))) leaves.add(leaf);
    } else if (via?.url) {
      leaves.add(via.url);
    } else {
      leaves.add(`unknown:${name}`);
    }
  }
  return leaves;
}

const failures = [];
const accepted = [];
for (const [name, info] of Object.entries(vulnerabilities)) {
  if (!['high', 'critical'].includes(info.severity)) continue;
  const leaves = leavesFor(name);
  if (leaves.size > 0 && [...leaves].every((leaf) => allowedAdvisories.has(leaf))) {
    accepted.push(`${name}: ${[...leaves].join(', ')}`);
  } else {
    failures.push(`${name} (${info.severity}): ${[...leaves].join(', ') || 'no advisory leaf found'}`);
  }
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
if (packageJson.dependencies?.['image-size'] || packageJson.devDependencies?.['image-size']) {
  failures.push('image-size became a direct Binder dependency; the Metro-only exception is invalid');
}

if (failures.length) {
  console.error('Unapproved high/critical npm audit findings:\n' + failures.join('\n'));
  process.exit(1);
}

console.log(`PASS: no unapproved high/critical runtime audit chains. Known Metro build-tool chain acknowledged (${accepted.length} affected nodes).`);

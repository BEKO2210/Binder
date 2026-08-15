import { readFileSync } from 'node:fs';

const audit = JSON.parse(readFileSync(process.argv[2] ?? 'npm-audit.json', 'utf8'));
const vulnerabilities = audit.vulnerabilities ?? {};
const allowedHighAdvisories = new Set([
  'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr',
  'https://github.com/advisories/GHSA-5p2g-fcmc-qvqq',
]);

function leavesFor(name, seen = new Set()) {
  if (seen.has(name)) return [];
  seen.add(name);
  const node = vulnerabilities[name];
  if (!node) return [{ url: `unresolved:${name}`, severity: 'unknown' }];
  const leaves = [];
  for (const via of node.via ?? []) {
    if (typeof via === 'string') {
      leaves.push(...leavesFor(via, new Set(seen)));
    } else if (via?.url) {
      leaves.push({ url: via.url, severity: via.severity ?? 'unknown' });
    } else {
      leaves.push({ url: `unknown:${name}`, severity: 'unknown' });
    }
  }
  return leaves;
}

const failures = [];
const accepted = [];
for (const [name, info] of Object.entries(vulnerabilities)) {
  if (!['high', 'critical'].includes(info.severity)) continue;
  const leaves = leavesFor(name);
  const dangerousLeaves = leaves.filter((leaf) => ['high', 'critical', 'unknown'].includes(leaf.severity));
  const unapproved = dangerousLeaves.filter((leaf) => !allowedHighAdvisories.has(leaf.url));

  if (unapproved.length > 0) {
    failures.push(`${name} (${info.severity}): ${unapproved.map((leaf) => `${leaf.url} [${leaf.severity}]`).join(', ')}`);
  } else if (dangerousLeaves.length > 0) {
    accepted.push(`${name}: ${dangerousLeaves.map((leaf) => leaf.url).join(', ')}`);
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

console.log(`PASS: no unapproved high/critical advisory leaves. Known Metro image parser advisories acknowledged (${accepted.length} affected dependency nodes).`);

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = process.cwd();
const scanRoots = ['src/screens', 'src/components'];

// LegalGateScreen owns a 24dp checkbox whose 8dp corner is intentional custom
// geometry: it is neither a standard control nor one of the shared surfaces.
// Remove this exception when that checkbox becomes a theme component.
const allowlist = new Map([
  ['src/screens/LegalGateScreen.tsx', [
    { rule: 'literal borderRadius', value: 'borderRadius: 8', reason: '24dp legal-consent checkbox geometry' },
  ]],
  ['src/components/ui/BinderBrand.tsx', [
    { rule: 'literal borderRadius', value: 'borderRadius: compact ? 11 : 13', reason: 'radii are intrinsic to the two exported bitmap mark sizes' },
  ]],
]);

const rules = [
  { name: 'literal colour', pattern: /#[\da-f]{6}\b|rgba\s*\(/gi },
  { name: 'literal fontSize', pattern: /\bfontSize\s*:[^,\n}]*\b\d+(?:\.\d+)?\b/g },
  { name: 'literal borderRadius', pattern: /\bborderRadius\s*:[^,\n}]*\b\d+(?:\.\d+)?\b/g },
  { name: 'literal animation duration', pattern: /(?:\bduration\s*:\s*|\.duration\(\s*)\d+(?:\.\d+)?\b/g },
];

function filesUnder(directory) {
  return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, directory, entry.name);
    return entry.isDirectory() ? filesUnder(relative(root, path)) : statSync(path).isFile() && /\.[jt]sx?$/.test(path) ? [path] : [];
  });
}

const failures = [];
const usedAllowlist = new Set();
for (const path of scanRoots.flatMap(filesUnder)) {
  const file = relative(root, path);
  const source = readFileSync(path, 'utf8');
  for (const rule of rules) {
    for (const match of source.matchAll(rule.pattern)) {
      const value = match[0];
      const exception = (allowlist.get(file) ?? []).find((item) => item.rule === rule.name && item.value === value);
      if (exception) {
        usedAllowlist.add(`${file}:${exception.rule}:${exception.value}`);
        continue;
      }
      const line = source.slice(0, match.index).split('\n').length;
      failures.push(`${file}:${line}: ${rule.name} ${JSON.stringify(value)}`);
    }
  }
}

for (const [file, exceptions] of allowlist) {
  for (const exception of exceptions) {
    const key = `${file}:${exception.rule}:${exception.value}`;
    if (!usedAllowlist.has(key)) failures.push(`stale allowlist entry: ${key} (${exception.reason})`);
  }
}

if (failures.length > 0) {
  console.error(`Design contract violations:\n${failures.join('\n')}`);
  process.exit(1);
}

console.log(`Design contract PASS (${usedAllowlist.size} documented exception)`);

import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = 'dist';
const phase5JsBaselineMiB = 2.39;
const maxJsMiB = 2.75;
// Phase 6 measured 3.44 MiB after adopting one canonical Expo Symbols family.
// 0.92 MiB of that export is the Material Symbols font asset; the JS/Hermes
// payload is still 2.52 MiB. Keep separate budgets so future JS growth cannot
// hide behind an approved, measured visual-system asset.
const phase6TotalBaselineMiB = 3.44;
const maxTotalMiB = 3.65;
let total = 0;
const files = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path);
    else {
      total += stat.size;
      files.push({ path: relative(root, path), bytes: stat.size });
    }
  }
}

walk(root);
files.sort((a, b) => b.bytes - a.bytes);
const js = files.filter((file) => /\.(js|hbc)$/.test(file.path)).reduce((sum, file) => sum + file.bytes, 0);
const toMiB = (bytes) => bytes / 1024 / 1024;
const mb = (bytes) => toMiB(bytes).toFixed(2);

console.log(`Binder Android export total: ${mb(total)} MiB`);
console.log(`Binder JS/Hermes payload: ${mb(js)} MiB`);
console.log(`Phase 5 JS baseline: ${phase5JsBaselineMiB.toFixed(2)} MiB`);
console.log(`Phase 6 measured total baseline: ${phase6TotalBaselineMiB.toFixed(2)} MiB`);
console.log(`JS/Hermes hard budget: ${maxJsMiB.toFixed(2)} MiB`);
console.log(`Total export hard budget: ${maxTotalMiB.toFixed(2)} MiB`);
console.log('Largest export files:');
for (const file of files.slice(0, 8)) console.log(`${mb(file.bytes)} MiB  ${file.path}`);

if (toMiB(js) > maxJsMiB) {
  console.error(`JS/Hermes budget exceeded: ${mb(js)} MiB > ${maxJsMiB.toFixed(2)} MiB.`);
  process.exit(1);
}

if (toMiB(total) > maxTotalMiB) {
  console.error(`Android export budget exceeded: ${mb(total)} MiB > ${maxTotalMiB.toFixed(2)} MiB.`);
  process.exit(1);
}

console.log('Binder Android export budgets PASS');

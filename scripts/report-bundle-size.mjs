import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = 'dist';
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
const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2);

console.log(`Binder Android export total: ${mb(total)} MiB`);
console.log(`Binder JS/Hermes payload: ${mb(js)} MiB`);
console.log('Largest export files:');
for (const file of files.slice(0, 8)) console.log(`${mb(file.bytes)} MiB  ${file.path}`);

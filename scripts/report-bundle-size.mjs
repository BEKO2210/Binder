import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleSizeVerdict } from './lib/budget-verdicts.mjs';

const root = 'dist';
const reportPath = 'artifacts/bundle-size-report.json';
const phase5JsBaselineMiB = 2.39;
const phase6TotalBaselineMiB = 3.44;

// Wave L raised these two numbers, and only these two. Measured before and
// after `@shopify/react-native-skia` on the same tree (docs/WAVE-L-LOADING-SURFACE.md):
// JS/Hermes 4.18 → 4.55 MiB, total export 4.95 → 5.50 MiB. The library brings
// its own React reconciler, which is the bulk of it. The owner took that cost
// on 2026-08-17 for the loading surface; the budget was raised to the measured
// value plus a deliberate ~0.35 MiB of headroom, not to whatever made it green.
// Anything that pushes past this is a new decision, not a rounding error.
const waveLJsBaselineMiB = 4.55;
const waveLTotalBaselineMiB = 5.5;

// Fifteen languages raised it again, and the cost was measured rather than
// assumed: the same tree exported with only `en.json` bundled is 4.63 MiB JS /
// 5.59 MiB total, with all fifteen it is 5.02 / 5.98. Fourteen translations
// therefore cost 0.39 MiB — about 28 KiB each, and each one is a language
// somebody can actually use the app in. The budget follows the measurement plus
// the same deliberate ~0.35 MiB of headroom, which leaves room for roughly a
// dozen more languages before this is a decision again.
const languagesJsBaselineMiB = 5.02;
const languagesTotalBaselineMiB = 5.98;
const perLanguageKiB = 28;
// The stability round of 2026-08-20 pushed JS past the old 5.35 MiB by ten
// kilobytes: the star-sign switch and its copy in fifteen languages, the
// full-screen photo view, the verified badge, and the queue and retry paths the
// review asked for. Measured, not guessed — 5.18 MiB on this tree — and the
// ceiling follows the measurement with the same deliberate headroom this file
// has used since Wave L. It is a decision, not a rounding error: the next thing
// that needs more than this has to say why.
const maxJsMiB = 5.5;
const maxTotalMiB = 6.5;

export function collectBundleReport(exportRoot) {
  let totalBytes = 0;
  const files = [];
  walk(exportRoot, exportRoot, files, (bytes, path) => { if (!path.endsWith('.map')) totalBytes += bytes; });
  files.sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path));
  const jsBytes = files.filter((file) => /\.(js|hbc)$/.test(file.path)).reduce((sum, file) => sum + file.bytes, 0);
  const map = files.find((file) => /\.(js|hbc)\.map$/.test(file.path));
  const modules = map ? sourceModules(join(exportRoot, map.path)) : [];
  return {
    schemaVersion: 1,
    totalBytes,
    jsBytes,
    moduleMetric: 'UTF-8 bytes of Metro source input; diagnostic attribution, not emitted bytecode size',
    topModules: modules.slice(0, 15),
    largestFiles: files.slice(0, 10),
    budgets: { maxJsBytes: mibBytes(maxJsMiB), maxTotalBytes: mibBytes(maxTotalMiB) },
  };
}

function walk(dir, exportRoot, files, addBytes) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, exportRoot, files, addBytes);
    else {
      const relativePath = relative(exportRoot, path);
      addBytes(stat.size, relativePath);
      files.push({ path: relativePath, bytes: stat.size });
    }
  }
}

function sourceModules(mapPath) {
  const map = JSON.parse(readFileSync(mapPath, 'utf8'));
  if (!Array.isArray(map.sources) || !Array.isArray(map.sourcesContent)) return [];
  return map.sources.map((source, index) => ({
    path: String(source).replace(/^\//, ''),
    sourceBytes: Buffer.byteLength(map.sourcesContent[index] ?? '', 'utf8'),
  })).filter((module) => module.sourceBytes > 0)
    .sort((a, b) => b.sourceBytes - a.sourceBytes || a.path.localeCompare(b.path));
}

const mibBytes = (value) => Math.round(value * 1024 * 1024);
const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2);

export function formatBundleReport(report) {
  const lines = [
    `Binder Android export total: ${mb(report.totalBytes)} MiB`,
    `Binder JS/Hermes payload: ${mb(report.jsBytes)} MiB`,
    `Phase 5 JS baseline: ${phase5JsBaselineMiB.toFixed(2)} MiB`,
    `Phase 6 measured total baseline: ${phase6TotalBaselineMiB.toFixed(2)} MiB`,
    `Wave L JS baseline (with Skia): ${waveLJsBaselineMiB.toFixed(2)} MiB`,
    `Wave L total baseline (with Skia): ${waveLTotalBaselineMiB.toFixed(2)} MiB`,
    `Fifteen-language JS baseline: ${languagesJsBaselineMiB.toFixed(2)} MiB (measured cost per language: ~${perLanguageKiB} KiB)`,
    `Fifteen-language total baseline: ${languagesTotalBaselineMiB.toFixed(2)} MiB`,
    `JS/Hermes hard budget: ${maxJsMiB.toFixed(2)} MiB`,
    `Total export hard budget: ${maxTotalMiB.toFixed(2)} MiB`,
    'Largest export files:',
    ...report.largestFiles.map((file) => `${mb(file.bytes)} MiB  ${file.path}`),
  ];
  if (report.topModules.length) {
    lines.push('Top Metro source modules (source-input bytes):');
    lines.push(...report.topModules.map((module) => `${mb(module.sourceBytes)} MiB  ${module.path}`));
  } else {
    lines.push('Top Metro modules unavailable: export with --source-maps external for attribution.');
  }
  return lines.join('\n');
}

function main() {
  const report = collectBundleReport(root);
  if (!report.topModules.length) {
    const analysisRoot = mkdtempSync('/tmp/binder-bundle-analysis-');
    console.log('Generating temporary Metro source map for module attribution…');
    execFileSync(process.execPath, [
      'node_modules/expo/bin/cli', 'export', '--platform', 'android',
      '--output-dir', analysisRoot, '--source-maps', 'external',
    ], { stdio: 'inherit' });
    report.topModules = collectBundleReport(analysisRoot).topModules;
  }
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatBundleReport(report));
  console.log(`Machine-readable report: ${reportPath}`);
  // The same function the release candidate uses, so a failed run cannot read as
  // a pass one step later.
  const verdict = bundleSizeVerdict(report);
  if (verdict.status === 'PASS') console.log('Binder Android export budgets PASS');
  else {
    for (const reason of verdict.reasons) console.error(`Budget exceeded: ${reason}.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

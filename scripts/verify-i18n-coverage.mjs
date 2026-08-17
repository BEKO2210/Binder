// "100 % mapped" has to be measurable, or it drifts back the moment somebody
// adds a screen. This finds user-visible English still baked into the source:
// text between JSX tags, and string literals passed to the props that reach a
// user's eyes or a screen reader.
//
// It reports a number so a migration can be tracked run by run, and it fails
// the build once a file that is already migrated regresses.
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = process.cwd();
const scanRoots = ['src/screens', 'src/components'];
const budgetPath = 'artifacts/i18n-coverage.json';

// Props whose string value is shown or read out.
const userFacingProps = [
  'label', 'title', 'message', 'copy', 'eyebrow', 'placeholder', 'helper', 'error',
  'accessibilityLabel', 'accessibilityHint', 'actionLabel', 'secondaryActionLabel',
  'detail', 'text', 'confirmLabel', 'cancelLabel',
];

// Strings that are not language: identifiers, codes, tokens, formats.
const notLanguage = /^(?:[a-z0-9_.-]+|[A-Z0-9_]+|%s|\d+|[^\p{L}]*)$/u;
// The German Impressum is law, not interface copy: § 5 DDG requires it in
// German regardless of the language the app is running in, so it stays in the
// screen and out of the translator's way.
const legalExceptions = new Set(['src/screens/AboutScreen.tsx']);
// Fragments of code that a text scan picks up between braces: ternaries,
// generics, template expressions. Prose does not contain these.
const looksLikeCode = /[=;{}$()<>[\]]|\?|::|\s\?\s|=>|\bconst\b|\buseState\b|\buseRef\b|\bPromise\b|\bPartial\b|\bRecord\b|\bvoid\b/;

function filesUnder(directory) {
  const path = resolve(root, directory);
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) return filesUnder(relative(root, child));
    return statSync(child).isFile() && /\.tsx$/.test(child) ? [child] : [];
  });
}

function findingsIn(source) {
  const findings = [];
  // <Tag ...>Some words</Tag>
  for (const match of source.matchAll(/>([^<>{}\n]{2,})</g)) {
    const text = match[1].trim();
    if (!text || notLanguage.test(text) || !/\p{L}/u.test(text) || looksLikeCode.test(text)) continue;
    if (!/^\p{L}/u.test(text)) continue;
    findings.push(text);
  }
  // prop="Some words"
  const propPattern = new RegExp(`\\b(${userFacingProps.join('|')})=\\{?["'\`]([^"'\`\\n]{2,})["'\`]`, 'g');
  for (const match of source.matchAll(propPattern)) {
    const text = match[2].trim();
    if (!text || notLanguage.test(text) || !/\p{L}/u.test(text) || text.includes('${')) continue;
    findings.push(text);
  }
  return findings;
}

const perFile = new Map();
for (const file of scanRoots.flatMap(filesUnder)) {
  const source = readFileSync(file, 'utf8');
  const findings = legalExceptions.has(relative(root, file)) ? [] : findingsIn(source);
  if (findings.length) perFile.set(relative(root, file), findings.length);
}

const total = [...perFile.values()].reduce((sum, count) => sum + count, 0);
const previous = existsSync(budgetPath) ? JSON.parse(readFileSync(budgetPath, 'utf8')) : null;
const report = { total, perFile: Object.fromEntries([...perFile.entries()].sort((a, b) => b[1] - a[1])) };

if (process.argv.includes('--record')) {
  writeFileSync(budgetPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Recorded ${total} untranslated user-facing strings across ${perFile.size} files.`);
  process.exit(0);
}

if (!previous) {
  console.log(`No baseline yet. ${total} untranslated strings; run with --record to set the baseline.`);
  process.exit(0);
}

const regressions = [];
for (const [file, count] of perFile) {
  const before = previous.perFile[file] ?? 0;
  if (count > before) regressions.push(`${file}: ${before} → ${count} untranslated strings`);
}
for (const [file, before] of Object.entries(previous.perFile)) {
  if (!perFile.has(file) && before > 0) continue; // fully migrated, good
}

if (regressions.length) {
  console.error(`Localization coverage went backwards:\n${regressions.join('\n')}\nRun \`npm run i18n:coverage -- --record\` only when the increase is intended.`);
  process.exit(1);
}

const migrated = previous.total - total;
console.log(`Localization coverage: ${total} untranslated strings left (${migrated >= 0 ? `${migrated} fewer` : `${-migrated} more`} than the baseline of ${previous.total}).`);

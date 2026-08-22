// Makes the locale files on disk visible to the app, and refuses to register a
// file that would show a user something broken.
//
// Adding German is: copy src/i18n/locales/en.json, translate the values, save it
// as src/i18n/locales/de.json, run `npm run i18n:sync`. The language then
// appears in App settings by itself.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const localesDir = 'src/i18n/locales';
const registryPath = 'src/i18n/registry.ts';
const source = 'en';

const files = readdirSync(localesDir).filter((name) => name.endsWith('.json')).sort();
const codes = files.map((name) => name.replace(/\.json$/, ''));
if (!codes.includes(source)) {
  console.error(`${localesDir}/${source}.json is the source of truth and must exist.`);
  process.exit(1);
}

function flatten(value, prefix = '', out = new Map()) {
  for (const [key, child] of Object.entries(value)) {
    if (key === '$meta') continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, path, out);
    else out.set(path, child);
  }
  return out;
}

const dictionaries = new Map(codes.map((code) => [code, JSON.parse(readFileSync(join(localesDir, `${code}.json`), 'utf8'))]));
const sourceKeys = flatten(dictionaries.get(source));

// A count is not the same shape in every language. Polish has a form for 2–4,
// Arabic has six including one for nothing at all — so a plural group is the
// one place where a translation carries keys English does not have, and has to.
const pluralCategories = ['zero', 'one', 'two', 'few', 'many', 'other'];

/** Groups in the source whose children are all plural categories. */
function pluralGroupsIn(value, prefix = '', out = new Set()) {
  for (const [key, child] of Object.entries(value)) {
    if (key === '$meta' || !child || typeof child !== 'object' || Array.isArray(child)) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    const names = Object.keys(child);
    if (names.length > 0 && names.every((name) => pluralCategories.includes(name)) && names.includes('other')) out.add(path);
    else pluralGroupsIn(child, path, out);
  }
  return out;
}

const pluralGroups = pluralGroupsIn(dictionaries.get(source));

function categoriesNeededBy(code) {
  try {
    const categories = new Intl.PluralRules(code).resolvedOptions().pluralCategories;
    return categories.filter((category) => pluralCategories.includes(category));
  } catch {
    return ['one', 'other'];
  }
}

const problems = [];
const report = [];
for (const code of codes) {
  if (code === source) continue;
  const dictionary = dictionaries.get(code);
  const meta = dictionary.$meta ?? {};
  if (!meta.endonym) problems.push(`${code}.json: $meta.endonym is missing — the picker needs the language's own name.`);
  const keys = flatten(dictionary);
  const missing = [...sourceKeys.keys()].filter((key) => !keys.has(key) || String(keys.get(key)).trim() === '');
  const unknown = [...keys.keys()].filter((key) => {
    if (sourceKeys.has(key)) return false;
    const group = key.slice(0, key.lastIndexOf('.'));
    const category = key.slice(key.lastIndexOf('.') + 1);
    // A plural form this language needs and English does not is the point.
    return !(pluralGroups.has(group) && pluralCategories.includes(category));
  });
  const untouched = [...keys.entries()].filter(([key, value]) => sourceKeys.get(key) === value).length;
  if (unknown.length) problems.push(`${code}.json: ${unknown.length} key(s) that do not exist in ${source}.json: ${unknown.slice(0, 5).join(', ')}`);
  // Missing prose falls back to English and degrades. A missing plural form
  // does not degrade — it reads as the wrong number, in a language where the
  // difference between two and five is a different sentence.
  const needed = categoriesNeededBy(code);
  const missingForms = [];
  for (const group of pluralGroups) {
    for (const category of needed) {
      const key = `${group}.${category}`;
      if (!keys.has(key) || String(keys.get(key)).trim() === '') missingForms.push(key);
    }
  }
  if (missingForms.length) problems.push(`${code}.json: ${missingForms.length} plural form(s) missing for a language that needs ${needed.join('/')}: ${missingForms.slice(0, 5).join(', ')}`);
  // Missing keys are allowed: they fall back to English rather than breaking.
  report.push(`${code}: ${keys.size - missing.length}/${sourceKeys.size} translated, ${missing.length} falling back to English, ${untouched} still identical to English`);
}

if (problems.length) {
  console.error(`Locale problems:\n${problems.join('\n')}`);
  process.exit(1);
}

const translations = codes.filter((code) => code !== source);
// The import attribute is required by node:test's loader and accepted by Metro,
// so the generated file works in the app and in the test runner alike.
// A region code like pt-BR is a valid file name and an invalid identifier, so
// the generated module binds a safe name and keys the map with the real code.
const identifier = (code) => `locale_${code.replace(/[^a-zA-Z0-9]/g, '_')}`;
const imports = translations.map((code) => `import ${identifier(code)} from './locales/${code}.json' with { type: 'json' };`).join('\n');
const entries = translations.map((code) => `  '${code}': ${identifier(code)} as Record<string, unknown>,`).join('\n');

writeFileSync(registryPath, `// Generated by \`npm run i18n:sync\` — do not edit by hand.
//
// Metro cannot read a directory at runtime, so the locale files that exist on
// disk are listed here. Adding a translation is: copy \`locales/en.json\`,
// translate the values, save it as \`locales/<code>.json\`, run \`npm run i18n:sync\`.
${imports ? `${imports}\n` : ''}
export type LocaleCode = ${codes.map((code) => `'${code}'`).join(' | ')};

export const registeredLocales: Record<string, Record<string, unknown>> = {${translations.length ? `\n${entries}\n` : ''}};
`);

console.log(`Registered locales: ${codes.join(', ')}`);
for (const line of report) console.log(`  ${line}`);

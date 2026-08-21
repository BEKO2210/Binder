// The website may not lie about the languages Binder ships.
//
// The pages themselves are rendered by `build-site-i18n.mjs` from the app's own
// locale files, so this script no longer writes anything. What is left is the
// promise, checked on every build and in CI: every generated page lists exactly
// the locales in `src/i18n/locales` — same codes, same endonyms, same count in
// the sentence — and no locale that does not exist.
//
//   node scripts/build-site-languages.mjs [--check]     (both only check)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const localesDir = 'src/i18n/locales';
const siteDir = 'site';
const source = 'en';

function flatten(value, prefix = '', out = new Map()) {
  for (const [key, child] of Object.entries(value)) {
    if (key === '$meta') continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, path, out);
    else out.set(path, child);
  }
  return out;
}

const codes = readdirSync(localesDir)
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.replace(/\.json$/, ''))
  .sort();
const dictionaries = new Map(codes.map((code) => [code, JSON.parse(readFileSync(join(localesDir, `${code}.json`), 'utf8'))]));
const sourceKeys = flatten(dictionaries.get(source));

const languages = codes.map((code) => {
  const dictionary = dictionaries.get(code);
  const meta = dictionary.$meta ?? {};
  const keys = flatten(dictionary);
  const translated = [...sourceKeys.keys()].filter((key) => keys.has(key) && String(keys.get(key)).trim() !== '').length;
  return {
    code,
    name: meta.name ?? code,
    endonym: meta.endonym ?? meta.name ?? code,
    translated,
    total: sourceKeys.size,
  };
});
const complete = languages.filter((language) => language.translated === language.total).length;

// Which site languages exist: `site/index.html` plus one folder per translation
// the site is written in (`site/i18n`), not every folder that happens to be there.
const siteLocales = ['', ...readdirSync('site/i18n')
  .filter((name) => name.endsWith('.json') && !name.endsWith('.context.json'))
  .map((name) => name.replace(/\.json$/, ''))
  .filter((code) => code !== source)];

const problems = [];

for (const locale of siteLocales) {
  const label = locale || source;
  const page = join(siteDir, locale, 'languages.html');
  const home = join(siteDir, locale, 'index.html');
  if (!existsSync(page) || !existsSync(home)) {
    problems.push(`${label}: languages.html or index.html is missing — run \`npm run site:i18n\`.`);
    continue;
  }
  const languagesHtml = readFileSync(page, 'utf8');
  const homeHtml = readFileSync(home, 'utf8');

  for (const language of languages) {
    if (!languagesHtml.includes(`<code>${language.code}</code>`)) problems.push(`${label}/languages.html does not list ${language.code}.`);
    if (!languagesHtml.includes(language.endonym)) problems.push(`${label}/languages.html is missing the endonym ${language.endonym} (${language.code}).`);
  }

  // Die Startseite zeigt eine Auswahl, nicht die Liste — fuenfzehn Flaggen
  // lesen sich als Dekoration. Geprueft wird deshalb nicht Vollstaendigkeit
  // (die gehoert auf languages.html und steht direkt darueber), sondern dass
  // die Auswahl nichts erfindet, hoechstens fuenf zeigt und mit der Sprache
  // der Seite beginnt: das ist die, nach der ein Besucher sucht.
  const strip = homeHtml.slice(homeHtml.indexOf('<ul class="langstrip"'), homeHtml.indexOf('</ul>', homeHtml.indexOf('<ul class="langstrip"')));
  const gezeigt = [...strip.matchAll(/lang="([A-Za-z-]+)"/g)].map((treffer) => treffer[1]);
  if (gezeigt.length === 0) problems.push(`${label}/index.html has no language strip at all.`);
  if (gezeigt.length > 5) problems.push(`${label}/index.html shows ${gezeigt.length} languages on the home page; five is the limit.`);
  for (const code of gezeigt) {
    if (!codes.includes(code)) problems.push(`${label}/index.html advertises ${code}, which is not a locale that ships.`);
  }
  const eigene = locale || source;
  if (gezeigt.length && gezeigt[0] !== eigene) problems.push(`${label}/index.html starts its language strip with ${gezeigt[0]} instead of ${eigene}.`);

  // Nothing invented: every code in the list has to be a locale that ships.
  // Only the list — the prose quotes tags like `de-DE` as examples.
  const grid = languagesHtml.slice(languagesHtml.indexOf('<ul class="langgrid"'), languagesHtml.indexOf('</ul>', languagesHtml.indexOf('<ul class="langgrid"')));
  for (const shown of grid.matchAll(/<code>([a-z]{2}(?:-[A-Za-z]{2,4})?)<\/code>/g)) {
    if (!codes.includes(shown[1])) problems.push(`${label}/languages.html shows ${shown[1]}, which is not in ${localesDir}.`);
  }

  // The sentence carries the count, so the count is checked too.
  const claimed = languagesHtml.match(/(\d+)\s*(?:of|von)\s*(\d+)/);
  if (!claimed) problems.push(`${label}/languages.html no longer states how many languages are complete.`);
  else if (Number(claimed[1]) !== complete || Number(claimed[2]) !== languages.length) {
    problems.push(`${label}/languages.html claims ${claimed[1]} of ${claimed[2]}, the locale files say ${complete} of ${languages.length}.`);
  }
}

if (problems.length) {
  for (const problem of problems) console.error(problem);
  console.error(`\nThe language pages disagree with ${localesDir}. Run \`npm run site:i18n\` and check the translations.`);
  process.exit(1);
}

console.log(`Site language content matches ${languages.length} bundled locales (${complete} complete) across ${siteLocales.length} site languages.`);

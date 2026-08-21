// Builds the public site from templates plus one language file per language.
//
//   node scripts/build-site-i18n.mjs          # write the pages
//   node scripts/build-site-i18n.mjs --check  # fail if the pages have drifted
//
// Adding a language is: copy site/i18n/en.json, translate the values, save it as
// site/i18n/<code>.json with its own $meta block, run this. Nothing else — the
// canonical link, the hreflang alternates, the footer switcher and the sitemap
// are all generated, because a translator who has to keep a list of URLs in step
// will eventually not.
//
// A missing key falls back to English and is reported. A half-finished
// translation degrades; it does not break a page.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = process.cwd();
const templateDir = join(root, 'site/templates');
const localeDir = join(root, 'site/i18n');
const siteDir = join(root, 'site');
const baseUrl = 'https://beko2210.github.io/Binder/';
const checkOnly = process.argv.includes('--check');
// Touching this file, a template or a language file is what makes the workflow
// in .github/workflows/site-i18n.yml rebuild and commit the pages.

// Which template becomes which file. The English pages keep the URLs the site
// has always had; a language folder mirrors them.
const PAGES = [
  { id: 'home', file: 'index.html', priority: '1.0' },
  { id: 'privacy', file: 'privacy.html', priority: '0.5' },
  { id: 'terms', file: 'terms.html', priority: '0.5' },
  { id: 'safety', file: 'safety-standards.html', priority: '0.6' },
  { id: 'delete-account', file: 'delete-account.html', priority: '0.6' },
  { id: 'languages', file: 'languages.html', priority: '0.4' },
  // Noindex, and therefore out of the sitemap: a legal notice is for the
  // reader who looks for it, not for search results.
  { id: 'impressum', file: 'impressum.html', noindex: true },
];
const SOURCE_LOCALE = 'en';

const locales = readdirSync(localeDir)
  .filter((name) => name.endsWith('.json') && !name.endsWith('.context.json'))
  .map((name) => name.replace('.json', ''))
  .sort((left, right) => (left === SOURCE_LOCALE ? -1 : right === SOURCE_LOCALE ? 1 : left.localeCompare(right)));

const dictionaries = Object.fromEntries(locales.map((code) => [code, JSON.parse(readFileSync(join(localeDir, `${code}.json`), 'utf8'))]));

// A key literally named "undefined" once sat in de.json holding the English
// switcher label, and nothing noticed for weeks. It can only come from a
// generator that stringified a missing value, so it is a build error, not a
// translation to fix later.
for (const [code, dictionary] of Object.entries(dictionaries)) {
  for (const key of Object.keys(dictionary)) {
    if (key === 'undefined' || key.includes('undefined')) {
      console.error(`${code}.json: key "${key}" comes from a stringified missing value`);
      process.exit(1);
    }
  }
}
const missing = [];

// The language page is built from the app's own locale files, so it cannot
// claim a language Binder does not ship or a coverage number nobody measured.
const appLocaleDir = join(root, 'src/i18n/locales');
const appLocales = readdirSync(appLocaleDir)
  .filter((name) => name.endsWith('.json'))
  .map((name) => {
    const data = JSON.parse(readFileSync(join(appLocaleDir, name), 'utf8'));
    return { code: name.replace('.json', ''), meta: data.$meta ?? {}, data };
  });

function countStrings(value, seen = 0) {
  for (const [key, child] of Object.entries(value)) {
    if (key === '$meta') continue;
    seen = child && typeof child === 'object' && !Array.isArray(child) ? countStrings(child, seen) : seen + 1;
  }
  return seen;
}

const englishStrings = countStrings(appLocales.find((entry) => entry.code === 'en')?.data ?? {});

const completeLocales = appLocales.filter((entry) => countStrings(entry.data) >= englishStrings).length;

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]);
}

function languageTable(locale) {
  const words = dictionaries[locale];
  const full = words['languages.@full'] ?? 'Fully translated';
  const partial = words['languages.@partial'] ?? 'Partly translated';
  const source = words['languages.@source'] ?? 'Source language';
  const rtl = words['languages.@rtl'] ?? 'Right-to-left · layout not mirrored yet';
  const cards = appLocales
    .slice()
    .sort((left, right) => (left.code === 'en' ? -1 : right.code === 'en' ? 1 : (left.meta.endonym ?? left.code).localeCompare(right.meta.endonym ?? right.code)))
    .map((entry) => {
      const strings = countStrings(entry.data);
      const complete = strings >= englishStrings;
      const badge = entry.code === 'en' ? source : complete ? full : `${partial} · ${strings}/${englishStrings}`;
      const direction = entry.meta.dir === 'rtl' ? `<span class="langtag note">${escapeHtml(rtl)}</span>` : '';
      return `<li class="langcard"><span class="langflag" aria-hidden="true">${escapeHtml(entry.meta.flag ?? '')}</span><span class="langbody"><strong lang="${escapeHtml(entry.code)}">${escapeHtml(entry.meta.endonym ?? entry.code)}</strong><span class="langname">${escapeHtml(entry.meta.name ?? entry.code)} · <code>${escapeHtml(entry.code)}</code></span><span class="langtag ${entry.code === 'en' ? 'source' : complete ? 'full' : 'partial'}">${escapeHtml(badge)}</span>${direction}</span></li>`;
    })
    .join('');
  return `<ul class="langgrid">${cards}</ul>`;
}

// The short strip on the home page is a sample, not the list. Fifteen flags
// read as a wall of decoration; six read as a fact, and the button underneath
// leads to all of them. The visitor's own language comes first — that is the
// one they check for — then the widest-reaching of the rest.
const STRIP_PRIORITAET = ['en', 'es', 'fr', 'it', 'tr', 'de'];
const STRIP_MAX = 6;

function stripAuswahl(locale) {
  const nachCode = new Map(appLocales.map((entry) => [entry.code, entry]));
  const gewaehlt = [];
  for (const code of [locale, ...STRIP_PRIORITAET]) {
    const entry = nachCode.get(code);
    if (entry && !gewaehlt.includes(entry)) gewaehlt.push(entry);
    if (gewaehlt.length === STRIP_MAX) break;
  }
  return gewaehlt;
}

function languageStrip(locale) {
  const items = stripAuswahl(locale)
    .map((entry) => `<li class="lang"><span class="lang-flag" aria-hidden="true">${escapeHtml(entry.meta.flag ?? '')}</span><span class="lang-name" lang="${escapeHtml(entry.code)}">${escapeHtml(entry.meta.endonym ?? entry.code)}</span></li>`)
    .join('');
  return `<ul class="langstrip">${items}</ul>`;
}

// The FAQ people read and the FAQ search engines read are the same text, taken
// from the same source: the structured data block. Google only honours FAQ
// markup whose answers are visible on the page, and a second copy of these
// sentences in the locale files would drift apart within two edits.
// The number of database assertions is measured, not maintained: every pgTAP
// file declares its own plan, so the sum is the count the suite actually runs.
// A hand-written "150+" in a locale file was already three years of work out of
// date in the wrong direction.
function databaseAssertions() {
  let total = 0;
  for (const file of readdirSync('supabase/tests')) {
    if (!file.endsWith('.sql')) continue;
    const sql = readFileSync(join('supabase/tests', file), 'utf8');
    for (const [, count] of sql.matchAll(/\bplan\(\s*(\d+)\s*\)/g)) total += Number(count);
  }
  if (!total) throw new Error('no pgTAP plans found — the proof number would be a guess');
  // Rounded down to the nearest ten and marked as a floor: the page claims at
  // least this many, which stays true between two test edits.
  return `${Math.floor(total / 10) * 10}+`;
}

function faqSection(dictionary) {
  const block = ['home.jsonld-1', 'home.jsonld-2']
    .map((key) => dictionary[key])
    .find((value) => typeof value === 'string' && value.includes('"FAQPage"'));
  if (!block) return '';
  const entries = JSON.parse(block).mainEntity ?? [];
  const escape = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const items = entries
    .map((entry) => `<details class="faqitem"><summary>${escape(entry.name)}</summary><p>${escape(entry.acceptedAnswer.text)}</p></details>`)
    .join('');
  return `<div class="faqlist">${items}</div>`;
}

function pageUrl(locale, file) {
  const path = file === 'index.html' ? '' : file;
  return locale === SOURCE_LOCALE ? `${baseUrl}${path}` : `${baseUrl}${locale}/${path}`;
}

function alternatesFor(file) {
  const lines = locales.map((code) => `  <link rel="alternate" hreflang="${code}" href="${pageUrl(code, file)}">`);
  lines.push(`  <link rel="alternate" hreflang="x-default" href="${pageUrl(SOURCE_LOCALE, file)}">`);
  return lines.join('\n');
}

function switcherFor(locale, file) {
  return locales
    .filter((code) => code !== locale)
    .map((code) => {
      const meta = dictionaries[code].$meta ?? {};
      const href = code === SOURCE_LOCALE
        ? (locale === SOURCE_LOCALE ? './' : `../${file === 'index.html' ? '' : file}`)
        : (locale === SOURCE_LOCALE ? `${code}/${file === 'index.html' ? '' : file}` : `../${code}/${file === 'index.html' ? '' : file}`);
      // data-binder-lang: clicking the switcher is the visitor choosing, and
      // language.js remembers it so the automatic redirect never argues.
      return `<a href="${href}" hreflang="${code}" lang="${code}" data-binder-lang="${code}">${meta.endonym ?? code}</a>`;
    })
    .join('');
}

// Anything that is not one of the five pages lives one level up from a language
// folder: the stylesheet, the assets, the media, the language list, the
// Impressum. Rewriting the paths here is what lets one template serve both.
const pageFiles = new Set(PAGES.map((page) => page.file));
function localisePaths(html, locale) {
  if (locale === SOURCE_LOCALE) return html;
  return html.replace(/(href|src)="([^"#][^":]*?)"/g, (whole, attr, value) => {
    if (value.startsWith('http') || value.startsWith('/') || value.startsWith('..') || value.startsWith('mailto:') || value === './') return whole;
    if (pageFiles.has(value)) return whole;
    return `${attr}="../${value}"`;
  });
}

function render(locale, page) {
  const template = readFileSync(join(templateDir, `${page.id}.html`), 'utf8');
  const dictionary = dictionaries[locale];
  const source = dictionaries[SOURCE_LOCALE];
  const meta = dictionary.$meta ?? {};

  let html = template.replace(/\{\{([^}]+)\}\}/g, (whole, rawKey) => {
    const key = rawKey.trim();
    if (key === '@alternates') return alternatesFor(page.file) + `\n  <link rel="canonical" href="${pageUrl(locale, page.file)}">`;
    if (key === '@og-url') return `<meta property="og:url" content="${pageUrl(locale, page.file)}">`;
    if (key === '@faq') return faqSection(dictionary);
    if (key === '@db-assertions') return databaseAssertions();
    // A German visitor got an English draft in their mail app. Subject and body
    // are locale text like everything else, encoded here so the template stays
    // readable.
    if (key === '@deletion-mailto') {
      const subject = encodeURIComponent(dictionary['delete-account.mailto-subject'] ?? source['delete-account.mailto-subject']);
      const body = encodeURIComponent(dictionary['delete-account.mailto-body'] ?? source['delete-account.mailto-body']);
      return `mailto:nullmesh@protonmail.com?subject=${subject}&amp;body=${body}`;
    }
    if (key === '@language-switcher') return switcherFor(locale, page.file);
    if (key === '@language-table') return languageTable(locale);
    if (key === '@language-strip') return languageStrip(locale);
    if (key === '@language-count') return String(appLocales.length);
    if (dictionary[key] !== undefined) return dictionary[key];
    missing.push(`${locale}/${page.id}: ${key}`);
    return source[key] ?? '';
  });

  // Counts live in the translated sentences, so the sentence cannot claim a
  // number the locale folder does not back up.
  html = html.replace(/\{\{@language-(count|complete)\}\}/g, (whole, kind) =>
    String(kind === 'count' ? appLocales.length : completeLocales));

  // One WebSite node per page, in the page's own language: without it the two
  // language trees look like unrelated documents that happen to share a host.
  const site = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Binder',
    url: pageUrl(locale, 'index.html'),
    inLanguage: meta.htmlLang ?? locale,
    publisher: { '@type': 'Person', name: 'Belkis Aslani' },
  };
  html = html.replace('</head>', `  <script type="application/ld+json">\n${JSON.stringify(site, null, 2)}\n  </script>\n</head>`);

  // Structured data is hand-maintained text in a locale file, so a stray comma
  // in a translation would ship silently broken markup. Parsing it here turns
  // that into a build failure.
  for (const [, block] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(block);
    } catch (error) {
      console.error(`${locale}/${page.id}: structured data is not valid JSON — ${error.message}`);
      process.exit(1);
    }
  }

  // The two weights used above the fold are fetched in parallel with the
  // stylesheet instead of after it — otherwise the first paint waits for CSS to
  // parse before it even learns the fonts exist.
  const preload = ['Manrope-Regular', 'Manrope-ExtraBold']
    .map((font) => `  <link rel="preload" as="font" type="font/woff2" href="assets/${font}.woff2" crossorigin>\n`)
    .join('');
  html = html.replace('  <link rel="stylesheet"', `${preload}  <link rel="stylesheet"`);

  // The legal pages carried no preview card, so a link to them in a chat came
  // up as a bare URL while the home page came up with a picture. The card is
  // built from the page's own title and description, which are already
  // translated — no second set of keys to keep in sync.
  if (!html.includes('property="og:title"')) {
    const escape = (value) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '';
    const description = /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? '';
    const image = `${baseUrl}media/og-image.jpg`;
    const card = [
      `  <meta property="og:title" content="${escape(title)}">`,
      `  <meta property="og:description" content="${escape(description)}">`,
      '  <meta property="og:type" content="website">',
      `  <meta property="og:url" content="${pageUrl(locale, page.file)}">`,
      `  <meta property="og:image" content="${image}">`,
      '  <meta property="og:image:width" content="1280">',
      '  <meta property="og:image:height" content="640">',
      `  <meta property="og:locale" content="${meta.htmlLang ?? locale}">`,
      '  <meta name="twitter:card" content="summary_large_image">',
      `  <meta name="twitter:title" content="${escape(title)}">`,
      `  <meta name="twitter:description" content="${escape(description)}">`,
      `  <meta name="twitter:image" content="${image}">`,
      '',
    ].join('\n');
    html = html.replace('</head>', `${card}</head>`);
  }

  html = html.replace(/<html lang="[^"]*"/, `<html lang="${meta.htmlLang ?? locale}"${meta.dir === 'rtl' ? ' dir="rtl"' : ''}`);

  // The page tells the script which languages exist and which page this is, so
  // the script itself stays free of anything generated.
  const languageScript = `<script>window.binderLanguages=${JSON.stringify({ available: locales, source: SOURCE_LOCALE, page: page.file === 'index.html' ? '' : page.file })}</script>\n<script src="assets/language.js" defer></script>`;
  html = html.replace('</body>', `${languageScript}\n</body>`);

  return localisePaths(html, locale);
}

function sitemap() {
  // The date a page last changed, taken from the history of the files it is
  // made of. Stamping today on every URL at every deploy taught search engines
  // that this signal means nothing here, which is worse than sending none.
  const lastChanged = (id) => {
    try {
      // The page's own template, not the whole locale folder: every page
      // shares that folder, so including it would give them all the same date
      // again — which is the signal this replaces.
      const output = execFileSync('git', ['log', '-1', '--format=%cs', '--', `site/templates/${id}.html`], { encoding: 'utf8' }).trim();
      return output || null;
    } catch { return null; }
  };
  const entries = PAGES.filter((page) => !page.noindex).flatMap((page) => locales.map((locale) => {
    const changed = lastChanged(page.id) ?? new Date().toISOString().slice(0, 10);
    const alternates = locales
      .map((code) => `    <xhtml:link rel="alternate" hreflang="${code}" href="${pageUrl(code, page.file)}"/>`)
      .join('\n');
    return `  <url>
    <loc>${pageUrl(locale, page.file)}</loc>
${alternates}
    <xhtml:link rel="alternate" hreflang="x-default" href="${pageUrl(SOURCE_LOCALE, page.file)}"/>
    <lastmod>${changed}</lastmod>
    <priority>${page.priority}</priority>
  </url>`;
  }));
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join('\n')}
</urlset>
`;
}

const written = [];
const drifted = [];

function emit(path, contents) {
  const full = join(siteDir, path);
  if (checkOnly) {
    const current = existsSync(full) ? readFileSync(full, 'utf8') : '';
    // The sitemap carries today's date; comparing it would fail every night.
    const normalise = (value) => value.replace(/<lastmod>[^<]*<\/lastmod>/g, '');
    if (normalise(current) !== normalise(contents)) drifted.push(path);
    return;
  }
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, contents);
  written.push(path);
}

for (const locale of locales) {
  for (const page of PAGES) {
    emit(locale === SOURCE_LOCALE ? page.file : `${locale}/${page.file}`, render(locale, page));
  }
}
emit('sitemap.xml', sitemap());

if (checkOnly) {
  if (drifted.length > 0) {
    console.error(`The site has drifted from its templates and language files (${drifted.length}):`);
    for (const path of drifted) console.error(`  site/${path}`);
    console.error('\nRun: npm run site:i18n');
    process.exit(1);
  }
  console.log(`Site matches its templates for ${locales.length} languages.`);
} else {
  console.log(`Wrote ${written.length} files for ${locales.length} languages: ${locales.join(', ')}.`);
}

if (missing.length > 0) {
  const byLocale = missing.reduce((counts, entry) => {
    const locale = entry.split('/')[0];
    counts[locale] = (counts[locale] ?? 0) + 1;
    return counts;
  }, {});
  for (const [locale, count] of Object.entries(byLocale)) {
    console.warn(`${locale}: ${count} strings still fall back to English`);
  }
}

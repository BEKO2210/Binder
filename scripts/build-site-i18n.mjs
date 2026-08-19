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
];
const SOURCE_LOCALE = 'en';

const locales = readdirSync(localeDir)
  .filter((name) => name.endsWith('.json') && !name.endsWith('.context.json'))
  .map((name) => name.replace('.json', ''))
  .sort((left, right) => (left === SOURCE_LOCALE ? -1 : right === SOURCE_LOCALE ? 1 : left.localeCompare(right)));

const dictionaries = Object.fromEntries(locales.map((code) => [code, JSON.parse(readFileSync(join(localeDir, `${code}.json`), 'utf8'))]));
const missing = [];

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
      return `<a href="${href}" hreflang="${code}" lang="${code}">${meta.endonym ?? code}</a>`;
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
    if (key === '@language-switcher') return switcherFor(locale, page.file);
    if (dictionary[key] !== undefined) return dictionary[key];
    missing.push(`${locale}/${page.id}: ${key}`);
    return source[key] ?? '';
  });

  html = html.replace(/<html lang="[^"]*"/, `<html lang="${meta.htmlLang ?? locale}"${meta.dir === 'rtl' ? ' dir="rtl"' : ''}`);
  return localisePaths(html, locale);
}

function sitemap() {
  const today = new Date().toISOString().slice(0, 10);
  const entries = PAGES.flatMap((page) => locales.map((locale) => {
    const alternates = locales
      .map((code) => `    <xhtml:link rel="alternate" hreflang="${code}" href="${pageUrl(code, page.file)}"/>`)
      .join('\n');
    return `  <url>
    <loc>${pageUrl(locale, page.file)}</loc>
${alternates}
    <xhtml:link rel="alternate" hreflang="x-default" href="${pageUrl(SOURCE_LOCALE, page.file)}"/>
    <lastmod>${today}</lastmod>
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

// The website's language page is generated from the locale files themselves, so
// it cannot claim a language Binder does not ship or a coverage number nobody
// measured.
//
//   node scripts/build-site-languages.mjs          writes site/languages.html
//   node scripts/build-site-languages.mjs --check   fails if the page is stale
//
// The same run refreshes the short language block on the home page, between the
// markers below. Nothing outside those markers is touched.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const localesDir = 'src/i18n/locales';
const pagePath = 'site/languages.html';
const homePath = 'site/index.html';
const startMarker = '<!-- languages:start -->';
const endMarker = '<!-- languages:end -->';
const source = 'en';
const check = process.argv.includes('--check');

function flatten(value, prefix = '', out = new Map()) {
  for (const [key, child] of Object.entries(value)) {
    if (key === '$meta') continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, path, out);
    else out.set(path, child);
  }
  return out;
}

const escape = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const codes = readdirSync(localesDir).filter((name) => name.endsWith('.json')).map((name) => name.replace(/\.json$/, '')).sort();
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
    flag: meta.flag ?? '🌐',
    translated,
    total: sourceKeys.size,
    rtl: meta.rtl === true || code === 'ar',
  };
}).sort((first, second) => (first.code === source ? -1 : second.code === source ? 1 : first.name.localeCompare(second.name)));

const complete = languages.filter((language) => language.translated === language.total).length;

const rows = languages.map((language) => {
  const percent = Math.round((language.translated / language.total) * 100);
  const state = language.code === source
    ? '<span class="langtag source">Source language</span>'
    : percent === 100
      ? '<span class="langtag full">Fully translated</span>'
      : `<span class="langtag partial">${percent}% translated · rest falls back to English</span>`;
  const script = language.rtl ? '<span class="langtag note">Right-to-left · layout not mirrored yet</span>' : '';
  return `  <li class="langcard"><span class="langflag" aria-hidden="true">${language.flag}</span><span class="langbody"><strong lang="${escape(language.code)}">${escape(language.endonym)}</strong><span class="langname">${escape(language.name)} · <code>${escape(language.code)}</code></span>${state}${script}</span></li>`;
}).join('\n');

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#090A0F">
  <meta name="description" content="Binder speaks ${languages.length} languages, including ${languages.slice(0, 6).map((language) => language.name).join(', ')}. Every language is complete before it ships, and Binder follows your phone's language by itself.">
  <link rel="canonical" href="https://beko2210.github.io/Binder/languages.html">
  <meta property="og:title" content="Binder in ${languages.length} languages">
  <meta property="og:description" content="Binder follows your phone's language. ${complete} of ${languages.length} languages are translated in full — no half-finished screens.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://beko2210.github.io/Binder/languages.html">
  <meta property="og:image" content="https://beko2210.github.io/Binder/media/og-image.jpg">
  <title>Languages — Binder speaks ${languages.length}</title>
  <link rel="icon" type="image/png" href="assets/binder-icon.png">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
<header class="nav"><div class="wrap navin"><a class="brand" href="./" aria-label="Binder home"><img src="assets/binder-icon.png" alt="" width="36" height="36"><span class="brand-word">BINDER</span></a><nav class="links" aria-label="Primary"><a class="navlink" href="./#principles">How it works</a><a class="navlink" href="./#safety">Safety</a><a class="navlink" href="privacy.html">Privacy</a><a class="btn secondary" href="delete-account.html">Account control</a></nav></div></header>
<main class="legal langpage">
  <div class="kicker">Languages</div>
  <h1>Binder speaks ${languages.length} languages.</h1>
  <p class="intro">Binder follows the language your phone is already set to. If that language is bundled, the app is in it the first time you open it — no setting to find, nothing to download. You can override it at any time under <strong>Settings → App settings → Language</strong>.</p>
  <p class="meta">${complete} of ${languages.length} translated in full · generated from the shipping locale files</p>

  <ul class="langgrid">
${rows}
  </ul>

  <h2>How Binder picks your language</h2>
  <p>Your phone reports a language tag such as <code>de-DE</code> or <code>pt-PT</code>. Binder looks for that exact tag first, then for another region of the same language, then for the bare language. Portuguese from Portugal therefore lands on the Brazilian file rather than on English. If nothing matches, the interface stays English instead of showing you a half-empty screen.</p>

  <h2>Nothing ships half-finished</h2>
  <p>A language is only listed here once every string in it exists. Where a string is genuinely missing — because the app grew after the translation was written — that single line falls back to English rather than appearing blank, and the gap is visible above rather than hidden.</p>

  <h2>Arabic and right-to-left</h2>
  <p>Arabic text renders correctly, but the layout still runs left to right. Mirroring the interface properly is its own piece of work and is not done yet. It is written down as open, not quietly skipped.</p>

  <h2>Want Binder in your language?</h2>
  <p>Translating Binder is one file. Take <code>en.json</code> from the repository, translate the values — never the keys — and send it back. It becomes a language in the app, with its own name and flag in the picker.</p>
  <p><a class="btn secondary" href="https://github.com/BEKO2210/Binder/tree/main/src/i18n/locales">See the locale files on GitHub</a></p>
  <p class="tiny">Languages are bundled into the app, so a new language arrives with an app update rather than instantly.</p>
</main>
<footer class="footer"><div class="wrap footerin"><span>© 2026 Binder · Independent product</span><div class="footlinks"><a href="./">Home</a><a href="languages.html">Languages</a><a href="privacy.html">Privacy</a><a href="terms.html">Terms</a><a href="safety-standards.html">Child safety</a><a href="delete-account.html">Delete account</a><a href="impressum.html">Impressum</a><a href="mailto:nullmesh@protonmail.com">Contact</a></div></div></footer>
</body>
</html>
`;

const strip = languages.map((language) => `<li><span aria-hidden="true">${language.flag}</span><span lang="${escape(language.code)}">${escape(language.endonym)}</span></li>`).join('');
const homeBlock = `${startMarker}
<section class="section" id="languages"><div class="wrap"><div class="sectionhead"><div class="kicker">${languages.length} languages</div><h2>In your language, from the first screen.</h2><p>Binder follows the language your phone is already set to — ${complete} of ${languages.length} languages are translated in full, and you can override the choice at any time in the app.</p></div><ul class="langstrip">${strip}</ul><div class="actions"><a class="btn secondary" href="languages.html">All languages and how they are chosen</a></div></div></section>
${endMarker}`;

const home = readFileSync(homePath, 'utf8');
const startIndex = home.indexOf(startMarker);
const endIndex = home.indexOf(endMarker);
if (startIndex === -1 || endIndex === -1) {
  console.error(`${homePath} needs a ${startMarker} … ${endMarker} block for the generated language section.`);
  process.exit(1);
}
const nextHome = `${home.slice(0, startIndex)}${homeBlock}${home.slice(endIndex + endMarker.length)}`;

if (check) {
  const stale = [];
  if (readFileSync(pagePath, 'utf8') !== page) stale.push(pagePath);
  if (home !== nextHome) stale.push(homePath);
  if (stale.length) {
    console.error(`Stale generated language content: ${stale.join(', ')}. Run \`npm run site:languages\`.`);
    process.exit(1);
  }
  console.log(`Site language content matches ${languages.length} bundled locales.`);
} else {
  writeFileSync(pagePath, page);
  writeFileSync(homePath, nextHome);
  console.log(`Wrote ${pagePath} and refreshed the home page block: ${languages.length} languages, ${complete} complete.`);
}

// Turns a finished HTML page into a template plus a language file.
//
// The site was written twice — once in English, once in German — and a third
// language would have meant writing it a third time. This reads a page, pulls
// every piece of text a reader sees into `site/i18n/<code>.json`, and leaves a
// template behind with `{{key}}` where the text was. The generator
// (build-site-i18n.mjs) puts the two back together.
//
//   node scripts/site-i18n-extract.mjs en site/index.html home
//   node scripts/site-i18n-extract.mjs de site/de/index.html home   # same keys
//
// The second call reads the German page against the SAME structure, so the keys
// line up by position. If a page's structure differs the run says so instead of
// writing a file that silently mismatches.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [locale, pagePath, pageId] = process.argv.slice(2);
if (!locale || !pagePath || !pageId) {
  console.error('usage: site-i18n-extract.mjs <locale> <html-file> <page-id>');
  process.exit(2);
}

const root = process.cwd();
const html = readFileSync(pagePath, 'utf8');

// Attributes whose value a reader can see or hear.
const TRANSLATABLE_ATTRS = new Set(['content', 'alt', 'title', 'aria-label', 'placeholder']);
// <meta> attributes that are machinery, not copy.
const META_SKIP = new Set(['charset', 'viewport', 'theme-color', 'og:type', 'og:url', 'og:image', 'og:image:width', 'og:image:height', 'twitter:card', 'twitter:image']);

function slug(text) {
  return text.toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[c])
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .split('-').slice(0, 5).join('-');
}

const entries = [];
const usedKeys = new Set();
function keyFor(hint) {
  const base = `${pageId}.${slug(hint) || 'text'}`;
  let key = base;
  let suffix = 2;
  while (usedKeys.has(key)) key = `${base}-${suffix++}`;
  usedKeys.add(key);
  return key;
}

let out = '';
let cursor = 0;
let skipDepth = 0; // inside <script>/<style>
let lastOpenTag = 'root';
const tagPattern = /<\/?([a-zA-Z0-9-]+)([^>]*)>/g;
let match;

while ((match = tagPattern.exec(html)) !== null) {
  const [tag, name, attrs] = match;
  const before = html.slice(cursor, match.index);

  // A doctype or a comment is markup, not copy.
  const isMarkupOnly = before.trim().startsWith('<!');
  if (before.trim().length > 0 && skipDepth === 0 && !isMarkupOnly) {
    const leading = before.match(/^\s*/)[0];
    const trailing = before.match(/\s*$/)[0];
    const text = before.trim();
    const key = keyFor(text);
    entries.push({ key, value: text, ctx: `text:${lastOpenTag}` });
    out += `${leading}{{${key}}}${trailing}`;
  } else {
    out += before;
  }
  cursor = match.index + tag.length;

  const lower = name.toLowerCase();
  if (!tag.startsWith('</')) lastOpenTag = lower;
  if (tag.startsWith('</')) {
    if (lower === 'script' || lower === 'style') skipDepth = Math.max(0, skipDepth - 1);
    out += tag;
    continue;
  }

  // A JSON-LD block is copy too, but it is one blob: key the whole thing.
  const isJsonLd = lower === 'script' && /type="application\/ld\+json"/.test(attrs);
  if (lower === 'script' || lower === 'style') skipDepth += 1;

  if (isJsonLd) {
    const closing = html.indexOf('</script>', cursor);
    const body = html.slice(cursor, closing);
    const key = keyFor(`jsonld-${entries.filter((entry) => entry.key.includes('jsonld')).length + 1}`);
    entries.push({ key, value: body.trim(), ctx: 'jsonld' });
    out += `${tag}\n{{${key}}}\n`;
    cursor = closing;
    continue;
  }

  // Rewrite translatable attributes.
  let rewritten = attrs;
  const attrPattern = /([a-zA-Z-]+)="([^"]*)"/g;
  let attrMatch;
  const replacements = [];
  while ((attrMatch = attrPattern.exec(attrs)) !== null) {
    const [whole, attrName, value] = attrMatch;
    if (!TRANSLATABLE_ATTRS.has(attrName) || value.trim().length === 0) continue;
    if (lower === 'meta') {
      const nameAttr = /(?:name|property)="([^"]+)"/.exec(attrs)?.[1] ?? '';
      if (META_SKIP.has(nameAttr)) continue;
    }
    if (lower === 'link' || value.startsWith('http') || value.startsWith('/')) continue;
    const nameHint = lower === 'meta' ? (/(?:name|property)="([^"]+)"/.exec(attrs)?.[1] ?? 'meta') : `${lower}-${attrName}`;
    const key = keyFor(`${nameHint}-${value}`);
    entries.push({ key, value, ctx: `attr:${lower}:${attrName}` });
    replacements.push([whole, `${attrName}="{{${key}}}"`]);
  }
  for (const [from, to] of replacements) rewritten = rewritten.replace(from, to);
  out += `<${tag.startsWith('</') ? '/' : ''}${name}${rewritten}>`;
}
out += html.slice(cursor);

// Canonical, alternates and the footer switcher are generated per language:
// a translator must never have to keep a list of URLs in step.
out = out
  .replace(/\n?\s*<link rel="canonical"[^>]*>/g, '')
  .replace(/\n?\s*<link rel="alternate" hreflang="[^"]*"[^>]*>/g, '')
  .replace(/<meta property="og:url" content="[^"]*">/, '{{@og-url}}')
  .replace(/<title>/, '{{@alternates}}\n  <title>')
  .replace(/<a href="(?:de\/|\.\.\/)"[^>]*>[^<]*<\/a>/, '{{@language-switcher}}');

const templatePath = join(root, 'site/templates', `${pageId}.html`);
const localePath = join(root, 'site/i18n', `${locale}.json`);
mkdirSync(dirname(templatePath), { recursive: true });
mkdirSync(dirname(localePath), { recursive: true });

const existing = existsSync(localePath) ? JSON.parse(readFileSync(localePath, 'utf8')) : {};

if (locale === 'en') {
  for (const { key, value } of entries) existing[key] = value;
} else {
  // A translation keeps the source language's keys: the same position in the
  // same template is the same string, whatever it says. Naming a key after the
  // German words would give two files that never meet.
  if (!existsSync(templatePath)) {
    console.error(`No template for ${pageId} — extract the English page first.`);
    process.exit(1);
  }
  const templateKeys = [...readFileSync(templatePath, 'utf8').matchAll(/\{\{([^}@]+)\}\}/g)].map((entry) => entry[1]);
  const sourceEntries = JSON.parse(readFileSync(join(root, 'site/i18n/en.context.json'), 'utf8'))[pageId];
  // Two pages that say the same thing can still differ by a paragraph. Align
  // the two sequences by the shape of the markup around each string — a
  // longest common subsequence over the contexts — instead of demanding that
  // the counts match. What does not align stays untranslated and says so.
  const left = sourceEntries.map((entry) => entry.ctx);
  const right = entries.map((entry) => entry.ctx);
  const table = Array.from({ length: left.length + 1 }, () => new Array(right.length + 1).fill(0));
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  let matched = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      existing[templateKeys[i]] = entries[j].value;
      matched += 1;
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) i += 1;
    else j += 1;
  }
  const missing = templateKeys.length - matched;
  if (missing > 0) console.warn(`${locale}/${pageId}: ${missing} of ${templateKeys.length} strings have no translation yet and fall back to English`);
}

writeFileSync(localePath, `${JSON.stringify(existing, null, 2)}\n`);

// The template is written from the source language only; a translation must not
// change the markup, or the pages would drift apart again.
if (locale === 'en') {
  writeFileSync(templatePath, out);
  const contextPath = join(root, 'site/i18n/en.context.json');
  const contexts = existsSync(contextPath) ? JSON.parse(readFileSync(contextPath, 'utf8')) : {};
  contexts[pageId] = entries.map(({ key, ctx }) => ({ key, ctx }));
  writeFileSync(contextPath, `${JSON.stringify(contexts, null, 2)}\n`);
}

console.log(`${pageId} (${locale}): ${entries.length} strings -> site/i18n/${locale}.json${locale === 'en' ? `, template site/templates/${pageId}.html` : ''}`);

// The language switch, checked without a browser.
//
// site/assets/language.js decides which language a visitor lands in, and it can
// only be wrong in ways that are painful: a redirect loop, a page that ignores
// the switcher, or one that follows a language the site does not have. So it
// runs here in a tiny fake window, once per rule.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const script = readFileSync('site/assets/language.js', 'utf8');

function run({ lang, languages, search = '', stored = null, available = ['en', 'de'], page = '' }) {
  let replaced = null;
  const store = new Map(stored ? [['binder:language', stored]] : []);
  const context = {
    document: {
      documentElement: { getAttribute: () => lang },
      querySelectorAll: () => [],
    },
    window: {
      binderLanguages: { available, source: 'en', page },
      location: { search, replace: (url) => { replaced = url; } },
    },
    navigator: { languages, language: languages[0] },
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
    },
    URLSearchParams,
  };
  context.window.localStorage = context.localStorage;
  vm.createContext(context);
  vm.runInContext(script, context);
  return { replaced, stored: store.get('binder:language') ?? null };
}

const cases = [
  ['German device on the English page goes to /de/', run({ lang: 'en', languages: ['de-DE', 'en'] }).replaced === 'de/'],
  ['German device already on /de/ stays', run({ lang: 'de', languages: ['de-DE'] }).replaced === null],
  ['English device on /de/ goes back to the source', run({ lang: 'de', languages: ['en-GB'] }).replaced === '../'],
  ['A language the site does not have is ignored', run({ lang: 'en', languages: ['fr-FR'] }).replaced === null],
  ['A stored choice beats the device', run({ lang: 'en', languages: ['de-DE'], stored: 'en' }).replaced === null],
  ['?lang=de forces and remembers', (() => { const r = run({ lang: 'en', languages: ['en'], search: '?lang=de' }); return r.replaced === 'de/' && r.stored === 'de'; })()],
  ['A subpage keeps its file name', run({ lang: 'en', languages: ['de-DE'], page: 'privacy.html' }).replaced === 'de/privacy.html'],
];

let failed = 0;
for (const [name, ok] of cases) {
  if (!ok) {
    console.error(`FAIL ${name}`);
    failed += 1;
  }
}
if (failed > 0) {
  console.error(`\nThe site's language switch is broken in ${failed} of ${cases.length} cases.`);
  process.exit(1);
}
console.log(`The site's language switch behaves in all ${cases.length} cases.`);

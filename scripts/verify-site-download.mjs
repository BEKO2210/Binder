// Runs download.js against a fake window: the dialog must come before the
// download, the newest release must decide the version, and a failed lookup
// must not leave a button that promises a file.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('site/assets/download.js', 'utf8');

function element(attributes = {}) {
  return {
    attributes,
    hidden: false,
    textContent: '',
    listeners: {},
    style: {},
    getAttribute: (name) => attributes[name] ?? null,
    setAttribute: (name, value) => { attributes[name] = value; },
    addEventListener(event, handler) { (this.listeners[event] ??= []).push(handler); },
    focus() {},
    click() { this.clicked = true; },
    querySelector(selector) { return this.children?.[selector] ?? null; },
  };
}

function run({ release, fails = false }) {
  const button = element();
  const meta = element({ 'data-template': '{version} · {size} MB · {date}', 'data-fallback': 'kein Download' });
  const fallbackLink = element();
  fallbackLink.hidden = true;
  const box = element();
  const checksumRow = element();
  checksumRow.hidden = true;
  const checksumValue = element();
  box.children = {
    '[data-download-button]': button,
    '[data-download-meta]': meta,
    '[data-download-fallback-link]': fallbackLink,
    '[data-download-checksum]': checksumRow,
    '[data-download-checksum-value]': checksumValue,
  };
  const confirmButton = element();
  const cancelButton = element();
  const dialog = element();
  dialog.hidden = true;
  dialog.children = { '[data-download-confirm]': confirmButton, '[data-download-cancel]': cancelButton };

  const created = [];
  const context = {
    document: {
      documentElement: { lang: 'de' },
      activeElement: null,
      body: { style: {}, appendChild() {}, removeChild() {} },
      querySelector: (selector) => (selector === '[data-download]' ? box : selector === '[data-download-dialog]' ? dialog : null),
      createElement: () => { const node = element(); created.push(node); return node; },
      addEventListener() {},
    },
    fetch: () => (fails
      ? Promise.reject(new Error('offline'))
      : Promise.resolve({ ok: true, json: () => Promise.resolve(release) })),
    Date,
    isNaN,
    Error,
    console,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { button, meta, dialog, confirmButton, created, checksumRow, checksumValue };
}

const release = {
  tag_name: 'v1.0.1',
  published_at: '2026-08-20T00:00:00Z',
  assets: [
    { name: 'mapping.txt', size: 10, browser_download_url: 'https://example.invalid/mapping.txt' },
    { name: 'Binder-v1.0.1-vc98.apk', size: 127146638, digest: 'sha256:2f1c9a', browser_download_url: 'https://example.invalid/binder.apk' },
  ],
};

const settle = () => new Promise((resolve) => setImmediate(resolve));

const ok = [];
{
  const { button, meta } = run({ release });
  await settle();
  ok.push(['The page shows the newest release instead of a typed version', button.hidden === false && /v1\.0\.1/.test(meta.textContent) && /121\.3 MB/.test(meta.textContent)]);
}

{
  // The copy calls the file signed; the digest is what makes that checkable.
  const { checksumRow, checksumValue } = run({ release });
  await settle();
  ok.push(['The page shows the release checksum when the release carries one', checksumRow.hidden === false && checksumValue.textContent === '2f1c9a']);
}

{
  const { button, dialog, confirmButton, created } = run({ release });
  await settle();
  button.listeners.click[0]({ preventDefault() {} });
  const warned = dialog.hidden === false && created.length === 0;
  confirmButton.listeners.click[0]();
  ok.push(['The warning comes before the file', warned]);
  ok.push(['Confirming starts exactly one download, of the apk', dialog.hidden === true && created.length === 1 && created[0].href === 'https://example.invalid/binder.apk']);
}
{
  const { button, meta } = run({ release, fails: true });
  await settle();
  ok.push(['A failed lookup leaves no button promising a file', button.hidden === true && meta.textContent === 'kein Download']);
}
{
  const { button } = run({ release: { tag_name: 'v1.0.1', published_at: '2026-08-20T00:00:00Z', assets: [{ name: 'x.aab', size: 1, browser_download_url: 'u' }] } });
  await settle();
  ok.push(['A release without an apk counts as no download', button.hidden === true]);
}

let failed = 0;
for (const [name, passed] of ok) {
  if (!passed) {
    console.error(`FAIL ${name}`);
    failed += 1;
  }
}
if (failed > 0) {
  console.error(`\nThe download on the site is broken in ${failed} of ${ok.length} cases.`);
  process.exit(1);
}
console.log(`The site's download behaves in all ${ok.length} cases.`);

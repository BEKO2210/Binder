import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const pages = ['site/index.html', 'site/privacy.html', 'site/terms.html', 'site/delete-account.html'];
const siteAssets = [
  'site/assets/binder-icon.png',
  'site/assets/Manrope-Regular.ttf',
  'site/assets/Manrope-Bold.ttf',
  'site/assets/Manrope-ExtraBold.ttf',
];
const forbidden = [/google-analytics/i, /googletagmanager/i, /facebook\.net/i, /segment\.com/i, /hotjar/i];
let failures = [];

for (const file of siteAssets) {
  if (!existsSync(file) || statSync(file).size < 1024) failures.push(`${file}: required prepared brand asset missing or empty`);
}

for (const file of pages) {
  if (!existsSync(file)) {
    failures.push(`${file}: missing`);
    continue;
  }
  const html = readFileSync(file, 'utf8');
  if (!html.includes('<meta name="viewport"')) failures.push(`${file}: viewport meta missing`);
  if (!html.includes('styles.css')) failures.push(`${file}: shared stylesheet missing`);
  if (!html.includes('assets/binder-icon.png')) failures.push(`${file}: Binder production mark missing`);
  for (const pattern of forbidden) if (pattern.test(html)) failures.push(`${file}: tracking dependency ${pattern}`);
  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const href = match[1];
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('http://') || href.startsWith('https://')) continue;
    const clean = href.split('#')[0].split('?')[0];
    if (!clean || clean === './') continue;
    const target = resolve(dirname(file), clean);
    if (!existsSync(target)) failures.push(`${file}: broken local link ${href}`);
  }
}

const css = readFileSync('site/styles.css', 'utf8');
for (const required of ['BinderManrope', 'assets/Manrope-Regular.ttf', 'assets/Manrope-ExtraBold.ttf', '.brand img']) {
  if (!css.includes(required)) failures.push(`styles.css: Binder visual-system contract missing: ${required}`);
}

const home = readFileSync('site/index.html', 'utf8').toLowerCase();
if (!home.includes('no paid tier')) failures.push('index.html: free-product promise missing');
if (/monetization comes later|future monetization/.test(home)) failures.push('index.html: stale monetization roadmap language present');

const deletion = readFileSync('site/delete-account.html', 'utf8');
if (!deletion.includes('nullmesh@protonmail.com')) failures.push('delete-account.html: deletion contact missing');
if (!deletion.includes('Request account deletion')) failures.push('delete-account.html: visible deletion action missing');
if (!deletion.includes('subject=Binder%20account%20deletion%20request')) failures.push('delete-account.html: explicit encoded deletion subject missing');

const terms = readFileSync('site/terms.html', 'utf8');
for (const required of ['18+ only', 'harass', 'minors', 'block', 'report']) {
  if (!terms.toLowerCase().includes(required.toLowerCase())) failures.push(`terms.html: required safety concept missing: ${required}`);
}
if (/future monetization/i.test(terms)) failures.push('terms.html: stale monetization language present');

const privacy = readFileSync('site/privacy.html', 'utf8').toLowerCase();
for (const required of ['beta ranking measurement', '10-km distance bucket', 'optional client diagnostics', '30 days', '90 days']) {
  if (!privacy.includes(required)) failures.push(`privacy.html: Phase 5 disclosure missing: ${required}`);
}
if (!privacy.includes('start disabled')) failures.push('privacy.html: optional diagnostics default-off disclosure missing');
if (!privacy.includes('deletes the existing optional client-diagnostic rows')) failures.push('privacy.html: diagnostics opt-out deletion disclosure missing');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Binder public site + branding contract PASS');

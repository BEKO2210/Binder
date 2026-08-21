// The guards are checked against defects planted on purpose.
//
// Every gate in this repository is a claim about the code. A claim nobody tests
// is a claim that quietly stops being true: the deadline gate matched on the
// spelling of a function, so renaming it in the import walked straight past —
// and nothing noticed, because the gate was green either way.
//
// So each fixture under scripts/gate-fixtures contains a real defect, and this
// file asserts two things about it: the gate finds it, and the legitimate
// variants beside it stay clean. A gate that stops catching its own fixture
// fails here, loudly, before it can hand out false confidence.
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { findViolations } from './lib/deadline-gate.mjs';

const cases = [];

function check(name, condition) {
  cases.push([name, Boolean(condition)]);
}

// ── The deadline gate ────────────────────────────────────────────────────────
const deadlineDir = 'scripts/gate-fixtures/deadlines';
for (const fixture of readdirSync(deadlineDir).filter((entry) => entry.endsWith('.tsx'))) {
  const path = join(deadlineDir, fixture);
  const violations = findViolations([path]);
  if (fixture.includes('.bad.')) {
    check(`deadline gate catches ${fixture}`, violations.length > 0);
  } else {
    check(`deadline gate leaves ${fixture} alone`, violations.length === 0);
  }
}

// The set of network functions is derived from src/lib rather than typed out,
// so a wrapper nobody remembered to list still counts.
const { networkFunctionNames } = await import('./lib/network-calls.mjs');
const network = networkFunctionNames();
check('network functions are discovered, not listed', network.size > 20);
check('a chat transport counts as network', network.has('sendMessage'));
check('a wrapper around one counts too', network.has('sendVoiceMessage'));
check('a pure helper does not', !network.has('formatVoiceDuration'));

// ── The worklet gate ─────────────────────────────────────────────────────────
const { findViolations: workletViolations, workletNames } = await import('./lib/worklet-gate.mjs');
const { filesUnder } = await import('./lib/network-calls.mjs');
const projectFiles = ['src/lib', 'src/components', 'src/screens', 'src/theme'].flatMap((root) => filesUnder(root));
const knownWorklets = workletNames(projectFiles);

const workletDir = 'scripts/gate-fixtures/worklets';
for (const fixture of readdirSync(workletDir).filter((entry) => entry.endsWith('.tsx'))) {
  const path = join(workletDir, fixture);
  const found = workletViolations([path], { workletNames: knownWorklets });
  if (fixture.includes('.bad.')) check(`worklet gate catches ${fixture}`, found.length > 0);
  else check(`worklet gate leaves ${fixture} alone`, found.length === 0);
}

// And the real thing it protects: the two functions whose absence caused the
// crashes this gate exists for are recognised as worklets.
check('a marked worklet is recognised', knownWorklets.has('resistedTranslation'));
check('the chat padding is a worklet', knownWorklets.has('conversationKeyboardPadding'));

// ── The i18n gate ────────────────────────────────────────────────────────────
const { findEnglish } = await import('./lib/i18n-gate.mjs');
const i18nDir = 'scripts/gate-fixtures/i18n';
for (const fixture of readdirSync(i18nDir).filter((entry) => entry.endsWith('.tsx'))) {
  const found = findEnglish(join(i18nDir, fixture));
  if (fixture.includes('.bad.')) check(`i18n gate catches ${fixture}`, found.length > 0);
  else check(`i18n gate leaves ${fixture} alone`, found.length === 0);
}

// ── The design gate ──────────────────────────────────────────────────────────
// The colour rule lives inside the verifier, so it is read back from there
// rather than copied — a copy would drift and this file would stop meaning
// anything.
const designSource = readFileSync('scripts/verify-design-contract.mjs', 'utf8');
const colourRule = designSource.slice(designSource.indexOf("name: 'literal colour'"), designSource.indexOf("{ name: 'literal fontSize'"));
check('the colour rule knows rgb()', /rgba\?/.test(colourRule));
check('the colour rule knows short hex', /3,8/.test(colourRule));
check('the colour rule knows named colours', /NAMED_COLOURS/.test(colourRule));
for (const fixture of readdirSync('scripts/gate-fixtures/design').filter((entry) => entry.endsWith('.tsx'))) {
  const text = readFileSync(join('scripts/gate-fixtures/design', fixture), 'utf8');
  const pattern = new RegExp(
    String.raw`#[\da-f]{3,8}\b|\b(?:rgba?|hsla?)\s*\(|(?:color|Color)\s*:[^,\n}]*['"\`](?:white|black|lime|transparent)['"\`]`,
    'gi',
  );
  const hits = [...text.matchAll(pattern)].length;
  if (fixture.includes('.bad.')) check(`design gate catches ${fixture}`, hits > 0);
  else check(`design gate leaves ${fixture} alone`, hits === 0);
}

// ── The secret gate ──────────────────────────────────────────────────────────
// The samples are assembled here rather than stored: a file full of
// credential-shaped strings is exactly what should not live in a repository,
// even when every value in it is invented. None of these unlock anything.
const { scan, isSkipped } = await import('./verify-no-secrets.mjs');
const planted = [
  ['private key block', ['-----BEGIN', 'PRIVATE KEY-----'].join(' ') + '\nMIIEvQIBADANBgkqhkiG9w0BAQ\n'],
  ['Google API key', 'GOOGLE_KEY=' + 'AIza' + 'Sy' + 'D'.repeat(35 - 2)],
  ['GitHub token', 'token=' + 'gh' + 'p_' + 'A'.repeat(36)],
  ['Stripe live key', 'stripe=' + 'sk_' + 'live_' + 'B'.repeat(24)],
  ['Supabase secret key', 'key=' + 'sb_' + 'secret_' + 'C'.repeat(24)],
  ['assigned secret', "password: '" + 'D'.repeat(32) + "'"],
];
const temporary = mkdtempSync(join(tmpdir(), 'binder-secret-gate-'));
for (const [name, sample] of planted) {
  const file = join(temporary, `${name.replace(/\W+/g, '-')}.txt`);
  writeFileSync(file, sample);
  check(`secret gate catches a planted ${name}`, scan([file]).length > 0);
}
// And the things that are meant to be public stay quiet.
const publicFile = join(temporary, 'public.txt');
writeFileSync(publicFile, [
  'EXPO_PUBLIC_SUPABASE_URL=https://example.supabase.co',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=' + 'sb_' + 'publishable_EXAMPLE',
  'GOOGLE_WEB_CLIENT_ID=1234567890-abcdefg.apps.googleusercontent.com',
  "password: '<set in the vault>'",
].join('\n'));
check('secret gate leaves public identifiers alone', scan([publicFile]).length === 0);

// The scanner skipped whole directories, and `assets/` was one of them. A file
// is skipped for what it is — generated, or binary — never for where it lives.
const assetLike = 'assets/planted-config.json';
writeFileSync(join(temporary, 'planted-config.json'), '{"api_key": "' + 'E'.repeat(32) + '"}');
check(
  'secret gate reads a config under assets/ instead of skipping the folder',
  scan([join(temporary, 'planted-config.json')]).length > 0 && !isSkipped(assetLike),
);
rmSync(temporary, { recursive: true, force: true });

let failed = 0;
for (const [name, passed] of cases) {
  if (!passed) {
    console.error(`FAIL ${name}`);
    failed += 1;
  }
}
if (failed > 0) {
  console.error(`\n${failed} of ${cases.length} guard self-tests failed. A gate that cannot catch its own fixture is not a gate.`);
  process.exit(1);
}
console.log(`Guards caught every planted defect (${cases.length} self-tests).`);

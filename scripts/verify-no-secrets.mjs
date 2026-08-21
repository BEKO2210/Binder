// Nothing that unlocks anything belongs in this repository.
//
// It has happened once already: a firebase-debug.log rode along into a public
// repository carrying the owner's address and every project id on the account.
// No credential that time — but nothing stopped it either, and the next file
// might carry one.
//
// The shapes that unlock things are scanned for on every commit in CI and
// before every release. The scanner itself is checked against planted samples,
// which scripts/verify-gate-selftests.mjs assembles at runtime rather than
// storing: a file full of credential-shaped strings is exactly what should not
// live in a repository, even when every value in it is invented.
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const PATTERNS = [
  { name: 'private key block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'service-role JWT', pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]*(?:c2VydmljZV9yb2xl|role"\s*:\s*"service_role)/ },
  { name: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'AWS secret access key', pattern: /\baws_secret_access_key\s*[:=]\s*['"]?[A-Za-z0-9/+=]{40}\b/i },
  { name: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { name: 'Slack token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Stripe live key', pattern: /\bsk_live_[A-Za-z0-9]{16,}\b/ },
  { name: 'Supabase secret key', pattern: /\bsb_secret_[A-Za-z0-9_-]{16,}\b/ },
  // The name may carry its own quotes ("api_key": "…" in JSON), and the value
  // may carry none at all (API_KEY=… in an env file). Both were invisible while
  // this pattern insisted on a bare name and a quoted value.
  { name: 'assigned secret', pattern: /\b(?:api[_-]?key|secret|token|password)["']?\s*[:=]\s*['"]?[A-Za-z0-9/+_-]{24,}['"]?/i },
];

// Values that are meant to be public, each with the reason it is not a secret.
// An allowlist without a reason is how a real key gets waved through, so the
// reason is required to be here in writing.
const ALLOWED = new Map([
  ['google-services.json:Google API key', 'Firebase Android client key. It ships inside the APK by design and is restricted to the package name and signing certificate; Google documents it as non-secret. Anyone can extract it from any published build.'],
]);

// Generated trees and binaries: nothing here is authored, and a keystore is
// meant to be a key — it is kept out of the index by .gitignore, not by this.
//
// `assets/` used to be on this list, and it did not belong there. The folder is
// mostly images, which the binary filter already skips, but it is also a place
// where a JSON or a config file can quietly appear — and a scanner that skips a
// whole directory is a scanner that says "clean" about files it never opened.
const SKIP = /^(?:node_modules|android|ios|artifacts|graphify-out)\//;
const BINARY = /\.(png|jpg|jpeg|webp|mp3|mp4|ttf|otf|zip|jks|keystore|aab|apk|pdf|ico)$/i;

/** Exported so the self-test can prove which paths are skipped and which are read. */
export function isSkipped(file) {
  return SKIP.test(file) || BINARY.test(file);
}

export function scan(files) {
  const findings = [];
  for (const file of files) {
    if (isSkipped(file)) continue;
    let text;
    try {
      if (statSync(file).size > 2_000_000) continue;
      text = readFileSync(file, 'utf8');
    } catch { continue; }
    for (const { name, pattern } of PATTERNS) {
      const match = pattern.exec(text);
      if (!match) continue;
      if (ALLOWED.has(`${file}:${name}`)) continue;
      const line = text.slice(0, match.index).split('\n').length;
      findings.push({ file, line, name });
    }
  }
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const findings = scan(tracked);
  if (findings.length > 0) {
    console.error('Possible credentials in tracked files:');
    for (const finding of findings) console.error(`  ${finding.file}:${finding.line}  ${finding.name}`);
    console.error('\nRemove it from the index and rotate it. A value that reached git history has leaked.');
    process.exit(1);
  }
  console.log(`No credential shapes in ${tracked.length} tracked files.`);
}

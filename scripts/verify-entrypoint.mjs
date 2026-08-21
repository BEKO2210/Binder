// Whatever Android starts has to be src/Root, because Root is where the session
// check, the legal gate and onboarding live. A different component in that spot
// is an app without a front door.
//
// This check used to read App.tsx and nothing else. But package.json says
// `"main": "index.ts"`, and index.ts calls registerRootComponent itself — so the
// file that actually starts the app was the one file nobody looked at. Pointing
// it at any other component, or pointing `main` at a third file, passed.
//
// Three things are checked now: what `main` names, that the named file starts
// Root, and that App.tsx — the Expo convention entry, still resolved by tooling —
// has not been turned into a second, different door.
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const failures = [];

const ENTRY = 'index.ts';
if (packageJson.main !== ENTRY) {
  failures.push(`package.json main is "${packageJson.main}" — this check knows how to guard ${ENTRY}. Point it back, or teach this file about the new entry.`);
}

const expected = {
  'index.ts': [
    /import\s+\{\s*registerRootComponent\s*\}\s+from\s+'expo';/,
    /import\s+Root\s+from\s+'\.\/src\/Root';/,
    /registerRootComponent\(Root\);/,
  ],
  'App.tsx': [
    /^export \{ default \} from '\.\/src\/Root';$/,
  ],
};

for (const [file, patterns] of Object.entries(expected)) {
  let source;
  try {
    source = (await readFile(new URL(`../${file}`, import.meta.url), 'utf8')).trim();
  } catch {
    failures.push(`${file} is missing — the app has no entry that this check can prove.`);
    continue;
  }
  for (const pattern of patterns) {
    if (!pattern.test(source)) failures.push(`${file} does not route through src/Root (${pattern}).`);
  }
  // registerRootComponent takes exactly one component, and Root is it.
  const registrations = source.match(/registerRootComponent\(([^)]*)\)/g) ?? [];
  for (const registration of registrations) {
    if (registration !== 'registerRootComponent(Root)') {
      failures.push(`${file} registers something other than Root: ${registration}`);
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  console.error('\nAuth, the legal gate and onboarding live in src/Root. An entry that skips it ships an app without them.');
  process.exit(1);
}

console.log(`PASS: ${ENTRY} and App.tsx both start src/Root.`);

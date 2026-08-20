// A build may not depend on what somebody published this morning.
//
// The production workflow used `eas-cli@latest`. That means the artefact people
// install was produced by whichever version happened to be current when the
// job ran — not something anybody chose, and not something a diff would show.
// The same argument applies to every action a workflow trusts: a moving tag can
// be repointed at other code by anyone who controls it.
//
// So: build tools carry an exact version, and actions carry a commit. Raising
// either is a decision, and a decision belongs in a diff.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const workflows = readdirSync('.github/workflows').filter((name) => name.endsWith('.yml'));
const problems = [];

for (const name of workflows) {
  const text = readFileSync(join('.github/workflows', name), 'utf8');

  for (const match of text.matchAll(/uses:\s*([^\s#]+)/g)) {
    const reference = match[1];
    if (reference.startsWith('./')) continue;
    const [, version] = reference.split('@');
    if (!version || !/^[0-9a-f]{40}$/.test(version)) {
      problems.push(`${name}: ${reference} is not pinned to a commit`);
    }
  }

  for (const match of text.matchAll(/(\S+)@latest/g)) {
    problems.push(`${name}: ${match[1]}@latest — a release must not depend on the day it was built`);
  }

  // `with: version: latest` is the same problem wearing a different hat.
  for (const match of text.matchAll(/version:\s*latest/g)) {
    problems.push(`${name}: "version: latest" at offset ${match.index} — pin the tool`);
  }
}

if (problems.length > 0) {
  console.error('Unpinned build toolchain:');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error('\nPin actions to a commit SHA (keep the tag as a comment) and tools to an exact version.');
  process.exit(1);
}

console.log(`Build toolchain is pinned across ${workflows.length} workflows.`);

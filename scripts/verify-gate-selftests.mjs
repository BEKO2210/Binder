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
import { readdirSync } from 'node:fs';
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

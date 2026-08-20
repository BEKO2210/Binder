// A request that never answers is worse than one that fails. A failure reaches
// the screen; silence keeps a loading state, a spinning button or a disabled
// control on screen forever, and every one of those was found that way on the
// device rather than in a test: the deck's "Wird gespeichert…" for seventy
// seconds, the celebration's CTA, the legal gate before that.
//
// So: every awaited network call inside a screen or a component carries a
// deadline. A call that deliberately does not may say so on the line above with
//
//   // no-deadline: <reason>
//
// which is a decision somebody wrote down, not an omission.
//
// The rule is read from the syntax tree. The line-based version this replaces
// could be walked past by renaming a function in its import, and the set of
// network functions was a hand-written list that a new wrapper in src/lib was
// invisible to. Both are fixtures now, under scripts/gate-fixtures/deadlines,
// and scripts/verify-gate-selftests.mjs proves this gate catches them.
import { findViolations, filesUnder } from './lib/deadline-gate.mjs';

const ROOTS = ['src/screens', 'src/components'];
const files = ROOTS.flatMap((root) => filesUnder(root));
const violations = findViolations(files);

if (violations.length > 0) {
  console.error(`Requests without a deadline (${violations.length}):`);
  for (const violation of violations) console.error(`  ${violation.file}:${violation.line}  ${violation.name}()`);
  console.error('\nWrap the call in withDeadline(...), or write "// no-deadline: <reason>" above it.');
  process.exit(1);
}

console.log(`Every awaited request in a screen or component carries a deadline (${files.length} files).`);

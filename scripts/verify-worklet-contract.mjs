// A worklet that calls a plain function kills the app.
//
// Reanimated runs gesture callbacks and animated styles on the UI runtime. A
// function marked 'worklet' may only call other worklets; calling a JS-runtime
// function from there throws "Tried to synchronously call a Remote Function"
// and takes the process down. It has cost two crashes here: the photo pager's
// clampPhotoIndex, and the chat's keyboard padding after it moved into src/lib.
//
// This reads the syntax tree. The text-based version it replaces resolved named
// imports only, so `import * as helpers` and `helpers.resolveSpring()` inside a
// gesture callback was invisible to it — fixture
// scripts/gate-fixtures/worklets/namespace.bad.tsx, which the old rule called
// clean. scripts/verify-gate-selftests.mjs keeps that honest.
import { filesUnder } from './lib/network-calls.mjs';
import { findViolations, workletNames } from './lib/worklet-gate.mjs';

const ROOTS = ['src/lib', 'src/components', 'src/screens', 'src/theme'];
const files = ROOTS.flatMap((root) => filesUnder(root));
const violations = findViolations(files, { workletNames: workletNames(files) });

if (violations.length > 0) {
  console.error('Worklet contract violations:');
  for (const violation of violations) {
    console.error(`  ${violation.file}:${violation.line}: ${violation.why} calls ${violation.name}(), which runs on the JS runtime`);
  }
  console.error("\nMark it 'worklet', resolve it outside the worklet, or wrap it in runOnJS.");
  process.exit(1);
}

console.log(`Binder worklet contract PASS (${files.length} files).`);

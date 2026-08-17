// A worklet that calls a plain function kills the app.
//
// Reanimated runs gesture callbacks on the UI runtime. A function marked
// 'worklet' may only call other worklets; calling a JS-runtime function from
// there throws "Tried to synchronously call a Remote Function" and takes the
// process down. It cost a crash in the photo pager once — nextPhotoPage was a
// worklet, clampPhotoIndex was not — so it is a gate now.
//
// The check is deliberately narrow: within one file, every function a worklet
// calls must itself be a worklet.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = process.cwd();
const scanRoots = ['src/lib', 'src/components', 'src/screens', 'src/theme'];

// Reanimated and gesture-handler primitives are worklet-safe by construction,
// as are the JS built-ins a worklet may use.
const workletSafe = new Set([
  'withTiming', 'withSpring', 'withDecay', 'withRepeat', 'withDelay', 'withSequence',
  'runOnJS', 'runOnUI', 'interpolate', 'interpolateColor', 'clamp', 'cancelAnimation',
  'Math', 'Number', 'Array', 'Object', 'String', 'Boolean', 'JSON', 'Date', 'isNaN',
  'parseFloat', 'parseInt', 'if', 'for', 'while', 'switch', 'catch', 'return', 'function',
]);

function filesUnder(directory) {
  const path = resolve(root, directory);
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) return filesUnder(relative(root, child));
    return statSync(child).isFile() && /\.[jt]sx?$/.test(child) ? [child] : [];
  });
}

// Function bodies, roughly: name plus the source between its braces.
function functionsIn(source) {
  const found = [];
  const pattern = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*(?:<[^>]*>)?\s*\(/g;
  for (const match of source.matchAll(pattern)) {
    const open = source.indexOf('{', match.index + match[0].length - 1);
    if (open < 0) continue;
    let depth = 0;
    let end = open;
    for (; end < source.length; end += 1) {
      if (source[end] === '{') depth += 1;
      else if (source[end] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    found.push({ name: match[1], body: source.slice(open, end + 1), index: match.index });
  }
  return found;
}

const failures = [];
for (const file of scanRoots.flatMap(filesUnder)) {
  const source = readFileSync(file, 'utf8');
  if (!source.includes("'worklet'")) continue;
  const relativePath = relative(root, file);
  const functions = functionsIn(source);
  const worklets = new Set(functions.filter((entry) => /^\s*\{\s*(?:\/\/[^\n]*\n\s*)*(?:\/\*[\s\S]*?\*\/\s*)*'worklet';/.test(entry.body)).map((entry) => entry.name));
  const declared = new Set(functions.map((entry) => entry.name));

  for (const entry of functions) {
    if (!worklets.has(entry.name)) continue;
    for (const call of entry.body.matchAll(/(?<![.\w$])([A-Za-z0-9_$]+)\s*\(/g)) {
      const callee = call[1];
      if (callee === entry.name || workletSafe.has(callee) || !declared.has(callee)) continue;
      if (!worklets.has(callee)) {
        const line = source.slice(0, entry.index).split('\n').length;
        failures.push(`${relativePath}:${line}: worklet ${entry.name}() calls ${callee}(), which is not a worklet`);
      }
    }
  }
}

if (failures.length) {
  console.error(`Worklet contract violations:\n${[...new Set(failures)].join('\n')}`);
  process.exit(1);
}

console.log('Binder worklet contract PASS');

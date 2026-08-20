// The worklet rule, read from the syntax tree.
//
// Reanimated runs gesture callbacks and animated styles on the UI runtime. A
// function marked 'worklet' may only call other worklets; calling a plain JS
// function from there throws "Tried to synchronously call a Remote Function"
// and takes the process down. It has happened twice in this repository — once
// in the photo pager, once when the chat's keyboard padding moved into src/lib.
//
// The text-based version of this check resolved named imports only, so
// `import * as helpers` and then `helpers.resolveSpring()` inside a gesture
// callback was invisible to it. That is fixture
// scripts/gate-fixtures/worklets/namespace.bad.tsx, and the old rule called it
// clean. It also counted `useAnimatedStyle(` itself as a suspicious call, which
// is the other half of the same problem: a check that reads letters instead of
// structure is wrong in both directions.
import ts from 'typescript';
import { calleeName, importBindings, parse } from './network-calls.mjs';

const GESTURE_CALLBACKS = new Set(['onStart', 'onBegin', 'onUpdate', 'onChange', 'onEnd', 'onFinalize', 'onTouchesDown', 'onTouchesMove', 'onTouchesUp']);
const ANIMATED_HOOKS = new Set(['useAnimatedStyle', 'useAnimatedProps', 'useDerivedValue', 'useAnimatedReaction', 'useAnimatedScrollHandler', 'useFrameCallback']);

// Primitives that are safe on the UI runtime by construction, plus the JS
// built-ins a worklet may use.
const SAFE = new Set([
  'withTiming', 'withSpring', 'withDecay', 'withRepeat', 'withDelay', 'withSequence',
  'runOnJS', 'runOnUI', 'interpolate', 'interpolateColor', 'clamp', 'cancelAnimation',
  'Math', 'Number', 'Array', 'Object', 'String', 'Boolean', 'JSON', 'Date', 'isNaN',
  'parseFloat', 'parseInt', 'Set', 'Map',
  ...ANIMATED_HOOKS,
]);

function hasWorkletDirective(node) {
  const body = node.body;
  if (!body || !ts.isBlock(body)) return false;
  const first = body.statements[0];
  return Boolean(first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === 'worklet');
}

/** Every function marked 'worklet', by name, across the files given. */
export function workletNames(files) {
  const names = new Set();
  for (const file of files) {
    const source = parse(file);
    const visit = (node) => {
      if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) && hasWorkletDirective(node)) {
        if (ts.isFunctionDeclaration(node) && node.name) names.add(node.name.text);
        const declaration = ts.findAncestor(node, ts.isVariableDeclaration);
        if (declaration && ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return names;
}

function workletBodies(source) {
  const bodies = [];
  const visit = (node) => {
    // Explicit: a function that says so.
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) && hasWorkletDirective(node)) {
      bodies.push({ node, why: 'marked worklet' });
    }
    // Implicit: the callbacks Reanimated runs on the UI runtime whether or not
    // anybody wrote the directive.
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && GESTURE_CALLBACKS.has(node.expression.name.text)) {
      for (const argument of node.arguments) {
        if (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)) bodies.push({ node: argument, why: `gesture ${node.expression.name.text}` });
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ANIMATED_HOOKS.has(node.expression.text)) {
      for (const argument of node.arguments) {
        if (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)) bodies.push({ node: argument, why: node.expression.text });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return bodies;
}

export function findViolations(files, options = {}) {
  const worklets = options.workletNames ?? workletNames(files);
  const violations = [];

  for (const file of files) {
    const source = parse(file);
    const bindings = importBindings(source);
    // A local plain function is as fatal as an imported one, so both count;
    // what matters is whether it carries the directive.
    const localFunctions = new Set();
    const collectLocals = (node) => {
      if (ts.isFunctionDeclaration(node) && node.name && !hasWorkletDirective(node)) localFunctions.add(node.name.text);
      ts.forEachChild(node, collectLocals);
    };
    collectLocals(source);

    for (const { node, why } of workletBodies(source)) {
      const calls = [];
      const collect = (inner) => {
        if (ts.isCallExpression(inner)) calls.push(inner);
        ts.forEachChild(inner, collect);
      };
      ts.forEachChild(node, collect);

      const bodyText = node.getText(source);
      for (const call of calls) {
        const name = calleeName(call, bindings);
        if (!name || SAFE.has(name)) continue;
        // Property access on a value (event.translationX etc.) is not a
        // function this rule can judge; only resolved names are.
        if (name.includes('.')) continue;
        if (worklets.has(name)) continue;
        const importedOrLocal = bindings.named.has(name) || [...bindings.namespaces].length > 0 || localFunctions.has(name);
        if (!importedOrLocal) continue;
        if (new RegExp(`runOnJS\\(\\s*${name}\\s*\\)`).test(bodyText)) continue;
        const { line } = source.getLineAndCharacterOfPosition(call.getStart(source));
        violations.push({ file, line: line + 1, name, why });
      }
    }
  }
  return violations;
}

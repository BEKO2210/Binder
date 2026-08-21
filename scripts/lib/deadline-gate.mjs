// The deadline rule, read from the syntax tree instead of the text.
//
// A request that never answers is worse than one that fails: the failure
// reaches the screen, the silence leaves a spinner and a dead button. So every
// awaited network call inside a screen or component is wrapped in
// `withDeadline`, and a call that deliberately is not says so above itself:
//
//   // no-deadline: <reason>
//
// The line-based version of this check could be walked past by renaming the
// function in the import. That is not a hypothetical — it is fixture
// `scripts/gate-fixtures/deadlines/alias.bad.tsx`, and the old rule called it
// clean.
import ts from 'typescript';
import { calleeName, filesUnder, importBindings, networkFunctionNames, parse } from './network-calls.mjs';

const SUPABASE_DIRECT = /^supabase\.(from|rpc|auth|storage|functions|channel|removeChannel)$/;

function hasExemption(node, source) {
  const text = source.getFullText();
  const comments = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];
  return comments.some((range) => text.slice(range.pos, range.end).includes('no-deadline:'));
}

/** Walks outwards: is this call already inside a withDeadline(...) argument? */
function insideDeadline(node) {
  let current = node.parent;
  while (current) {
    if (ts.isCallExpression(current)) {
      const name = ts.isIdentifier(current.expression) ? current.expression.text
        : ts.isPropertyAccessExpression(current.expression) ? current.expression.name.text : '';
      // Only wrappers that create a time limit count. `withRetry` retries a
      // call that settles — a first attempt that never settles is never retried
      // — and `abortable` without a signal returns the promise unchanged. Both
      // were accepted here, which made two ways to look protected while nothing
      // ever ended the wait.
      if (name === 'withDeadline') return true;
    }
    current = current.parent;
  }
  return false;
}

export function findViolations(files, options = {}) {
  const network = options.networkNames ?? networkFunctionNames(options.libDirectory);
  const violations = [];

  for (const file of files) {
    const source = parse(file);
    const bindings = importBindings(source);

    // A request needs an end whether it is awaited or handed to .then(). The
    // scan used to start at `await`, so `getBetaSettings().then(…).finally(…)`
    // was invisible — and that is exactly how a settings screen kept a spinner
    // on screen forever when the answer never came.
    const seen = new Set();
    const report = (call, exempt) => {
      const name = calleeName(call, bindings);
      if (!name) return;
      const isNetwork = SUPABASE_DIRECT.test(name) || network.has(name);
      if (!isNetwork) return;
      if (insideDeadline(call)) return;
      if (exempt) return;
      const start = call.getStart(source);
      if (seen.has(start)) return;
      seen.add(start);
      const { line } = source.getLineAndCharacterOfPosition(start);
      violations.push({ file, line: line + 1, name });
    };

    const exemptAt = (node) => {
      const statement = ts.findAncestor(node, (candidate) => ts.isStatement(candidate)) ?? node;
      return hasExemption(statement, source) || hasExemption(node, source);
    };

    const visit = (node) => {
      if (ts.isAwaitExpression(node)) {
        const exempt = exemptAt(node);
        const collect = (inner) => {
          if (ts.isCallExpression(inner)) report(inner, exempt);
          ts.forEachChild(inner, collect);
        };
        collect(node.expression);
      }

      // The head of a promise chain: `request().then(…)`, `.catch(…)`,
      // `.finally(…)`, `void request().then(…)`.
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
          && ['then', 'catch', 'finally'].includes(node.expression.name.text)) {
        let head = node.expression.expression;
        while (ts.isCallExpression(head) && ts.isPropertyAccessExpression(head.expression)
               && ['then', 'catch', 'finally'].includes(head.expression.name.text)) {
          head = head.expression.expression;
        }
        if (ts.isCallExpression(head)) report(head, exemptAt(node));
      }

      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return violations;
}

export { filesUnder };

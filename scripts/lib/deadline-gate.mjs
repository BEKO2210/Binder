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
      if (name === 'withDeadline' || name === 'withRetry' || name === 'abortable') return true;
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

    const visit = (node) => {
      if (ts.isAwaitExpression(node)) {
        const statement = ts.findAncestor(node, (candidate) => ts.isStatement(candidate)) ?? node;
        const exempt = hasExemption(statement, source) || hasExemption(node, source);
        const calls = [];
        const collect = (inner) => {
          if (ts.isCallExpression(inner)) calls.push(inner);
          ts.forEachChild(inner, collect);
        };
        collect(node.expression);

        for (const call of calls) {
          const name = calleeName(call, bindings);
          if (!name) continue;
          const isNetwork = SUPABASE_DIRECT.test(name) || network.has(name);
          if (!isNetwork) continue;
          if (insideDeadline(call)) continue;
          if (exempt) continue;
          const { line } = source.getLineAndCharacterOfPosition(call.getStart(source));
          violations.push({ file, line: line + 1, name });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return violations;
}

export { filesUnder };

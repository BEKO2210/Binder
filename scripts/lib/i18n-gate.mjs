// User-facing English, found in the syntax tree.
//
// The text version of this rule looked for a string literal sitting directly in
// a JSX attribute. Moving the same sentence one line up —
//
//   const deleteLabel = 'Delete account';
//   <BinderButton label={deleteLabel} />
//
// — hid it completely, and so did putting it in a ternary inside the attribute.
// Both are fixtures under scripts/gate-fixtures/i18n, and both were green under
// the old rule. A reader in one of fifteen languages would have seen English.
import ts from 'typescript';
import { parse } from './network-calls.mjs';

const USER_FACING_PROPS = new Set([
  'label', 'title', 'message', 'copy', 'eyebrow', 'placeholder', 'helper', 'error',
  'accessibilityLabel', 'accessibilityHint', 'actionLabel', 'secondaryActionLabel',
  'detail', 'text', 'confirmLabel', 'cancelLabel', 'destructiveText', 'cancelText',
]);

// Identifiers, codes, tokens, formats — not language.
const NOT_LANGUAGE = /^(?:[a-z0-9_.:/-]+|[A-Z0-9_]+|%s|\d+|[^\p{L}]*)$/u;

function isProse(value) {
  const text = value.trim();
  if (!text || text.length < 2) return false;
  if (NOT_LANGUAGE.test(text)) return false;
  if (!/\p{L}/u.test(text)) return false;
  // A key like 'chat.actions.retry' is a reference, not a sentence.
  if (/^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/.test(text)) return false;
  return /^\p{L}/u.test(text);
}

/** const label = 'Delete account'  →  label */
function literalBindings(source) {
  const bindings = new Map();
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (ts.isStringLiteral(node.initializer)) bindings.set(node.name.text, node.initializer.text);
      if (ts.isNoSubstitutionTemplateLiteral(node.initializer)) bindings.set(node.name.text, node.initializer.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return bindings;
}

/** Every string this expression can evaluate to, as far as it can be followed. */
function stringsFrom(expression, bindings) {
  if (!expression) return [];
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return [expression.text];
  if (ts.isIdentifier(expression)) {
    const value = bindings.get(expression.text);
    return value === undefined ? [] : [value];
  }
  if (ts.isConditionalExpression(expression)) {
    return [...stringsFrom(expression.whenTrue, bindings), ...stringsFrom(expression.whenFalse, bindings)];
  }
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
    return [...stringsFrom(expression.left, bindings), ...stringsFrom(expression.right, bindings)];
  }
  if (ts.isParenthesizedExpression(expression)) return stringsFrom(expression.expression, bindings);
  return [];
}

export function findEnglish(file) {
  const source = parse(file);
  const bindings = literalBindings(source);
  const findings = [];

  const visit = (node) => {
    // <Tag>Some words</Tag>
    if (ts.isJsxText(node)) {
      const text = node.text.trim();
      if (isProse(text)) findings.push({ text, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
    }
    // prop="Some words" / prop={label} / prop={busy ? 'a' : 'b'}
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && USER_FACING_PROPS.has(node.name.text)) {
      const initializer = node.initializer;
      const expression = initializer && ts.isJsxExpression(initializer) ? initializer.expression : initializer;
      for (const value of stringsFrom(expression, bindings)) {
        if (isProse(value)) findings.push({ text: value, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

// Which functions actually leave the phone — read from the code, not from a list.
//
// The old gate carried a hand-written list of function names. Two things go
// wrong with that: a rename in an import (`sendMessage as transmitMessage`)
// walks straight past it, and a new wrapper in src/lib is invisible until
// somebody remembers to add it. Both were demonstrated on fixtures before this
// file existed.
//
// So the set is derived: every exported function in src/lib whose body mentions
// the Supabase client, plus anything that calls such a function. Two passes are
// enough for this codebase and the result is checked — a name that stops being
// a network call simply drops out.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

export function parse(file, text = readFileSync(file, 'utf8')) {
  return ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

export function filesUnder(directory, extensions = ['.ts', '.tsx']) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return filesUnder(path, extensions);
    return extensions.some((extension) => path.endsWith(extension)) ? [path] : [];
  });
}

/** Every function name declared in a file, with the source text of its body. */
function exportedFunctions(source) {
  const found = new Map();
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) found.set(node.name.text, node.getText(source));
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer
          && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) {
          found.set(declaration.name.text, declaration.initializer.getText(source));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const TOUCHES_SUPABASE = /\bsupabase\s*\.\s*(from|rpc|auth|storage|functions|channel|removeChannel)\b|\bphase6Rpc\s*\(|\bfetch\s*\(/;

/**
 * @returns Set of function names in `src/lib` that reach the network, directly
 *   or through another such function.
 */
export function networkFunctionNames(libDirectory = 'src/lib') {
  const bodies = new Map();
  for (const file of filesUnder(libDirectory)) {
    const source = parse(file);
    for (const [name, body] of exportedFunctions(source)) bodies.set(name, body);
  }

  const network = new Set();
  for (const [name, body] of bodies) if (TOUCHES_SUPABASE.test(body)) network.add(name);

  // A wrapper around a network function is a network call too.
  for (let pass = 0; pass < 3; pass += 1) {
    let grew = false;
    for (const [name, body] of bodies) {
      if (network.has(name)) continue;
      for (const known of network) {
        if (new RegExp(`\\b${known}\\s*\\(`).test(body)) { network.add(name); grew = true; break; }
      }
    }
    if (!grew) break;
  }
  return network;
}

/**
 * Local name → what it really is.
 *
 * `import { sendMessage as transmitMessage }` binds `transmitMessage` to the
 * exported name `sendMessage`; `import * as conversation` binds a namespace, so
 * `conversation.sendMessage(...)` has to be resolved through its member name.
 */
export function importBindings(source) {
  const named = new Map();
  const namespaces = new Set();
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && node.importClause) {
      const clause = node.importClause;
      if (clause.name) named.set(clause.name.text, clause.name.text);
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          named.set(element.name.text, (element.propertyName ?? element.name).text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { named, namespaces };
}

/** The name a call expression really invokes, seen through imports. */
export function calleeName(call, bindings) {
  const expression = call.expression;
  if (ts.isIdentifier(expression)) return bindings.named.get(expression.text) ?? expression.text;
  if (ts.isPropertyAccessExpression(expression)) {
    const object = expression.expression;
    if (ts.isIdentifier(object) && bindings.namespaces.has(object.text)) return expression.name.text;
    return `${object.getText()}.${expression.name.text}`;
  }
  return null;
}

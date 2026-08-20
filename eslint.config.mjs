// Evaluated against the gates this repo already has (Phase 10 of the hardening
// mandate). The four AST verifiers cover what is specific to Binder — deadlines
// on every network call, worklets, user-facing strings, design tokens — and
// TypeScript covers types. What neither sees is the ordinary JavaScript class of
// mistake: a hook called conditionally, a variable that shadows another. That is
// what this config is for, and nothing else: no style rules, no formatting, no
// opinions the type checker already enforces.
//
// It deliberately does not use eslint-config-expo. That config pulls in
// eslint-plugin-import-x → unrs-resolver, whose optional WASM bindings resolve
// to different versions under npm 10 and npm 11 — which broke `npm ci` in every
// workflow, the public site included. A linter is not worth a build that only
// installs on the machine that wrote the lockfile.
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['node_modules/**', 'android/**', 'site/**', 'artifacts/**', 'dist/**', '.expo/**', 'scripts/gate-fixtures/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // Unused names and explicit `any` are style, and TypeScript already sees
      // both. Only rules that catch behaviour stay at error.
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'no-empty': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-shadow': 'error',
      'no-return-await': 'error',
      // Off with a reason, not because it was loud: every hit is the lock idiom
      // `if (ref.current) return; ref.current = true; …await…; ref.current =
      // false`. The rule cannot see the guard that makes the second write safe,
      // and JavaScript here is single-threaded, so the interleaving it warns
      // about cannot happen.
      'require-atomic-updates': 'off',
    },
  },
];

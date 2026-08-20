// Evaluated against the gates this repo already has (Phase 10 of the hardening
// mandate). The four AST verifiers cover the rules that are specific to Binder —
// deadlines on every network call, worklets, user-facing strings, design tokens.
// What they cannot see is the ordinary JavaScript class of mistake: a hook
// called conditionally, a variable that shadows another, an await that is not
// awaited. That is what this config is for, and nothing else: no style rules,
// no formatting, no opinions the type checker already enforces.
import expo from 'eslint-config-expo/flat.js';

export default [
  ...expo,
  {
    ignores: ['node_modules/**', 'android/**', 'site/**', 'artifacts/**', 'dist/**', '.expo/**', 'scripts/gate-fixtures/**'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Formatting and naming are not defects; TypeScript already refuses the
      // type errors. These are the rules that catch behaviour.
      'no-unused-vars': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-shadow': 'error',
      'no-return-await': 'error',
      // Off with a reason, not because it was loud: every hit is the
      // lock idiom `if (ref.current) return; ref.current = true; …await…;
      // ref.current = false`. The rule cannot see the guard that makes the
      // second write safe, and JavaScript here is single-threaded, so the
      // interleaving it warns about cannot happen. Blocking uploads is what
      // the lock is for; deleting it to satisfy a linter would reintroduce
      // the double-upload this repo already fixed once.
      'require-atomic-updates': 'off',
    },
  },
];

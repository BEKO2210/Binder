# Enterprise hardening

The single list for this phase. Nothing here is finished because code was
written; an entry becomes `[x] PROVEN` when the protection was executed and
observed doing its job — usually by breaking something on purpose and watching
the gate go red.

## Status key

| Mark | Meaning |
|---|---|
| `[ ] OPEN` | Not started |
| `[~] ACTIVE` | In progress |
| `[x] PROVEN` | Protection exists **and** was demonstrated against a deliberate defect |
| `[!] BLOCKED_OWNER` | Needs a decision only the owner can make (money, production, privacy, store) |

## Baseline

- Commit at the start of this phase: `cbd67925` (Binder 1.0.4, versionCode 101)
- Graph: 1351 nodes, 2974 edges, built from the same commit
- Unit tests: 247 passing
- Verifiers: 19 scripts, all green (`verify-audit-baseline` needs `npm-audit.json`, which CI generates)
- pgTAP: 17 suites, green
- CI workflows: ci, database-tests, eas-preview-build, eas-production-build, pages, scheduled-health, site-i18n

---

## P0

### [x] The guards need guards of their own — PROVEN

An external review found that several verifiers check a spelling rather than a
fact. A gate that can be walked past with a rename is worse than no gate: it
buys confidence that is not there.

Method for each one: write a fixture that contains the real defect, prove the
current gate calls it clean, replace the check with one that reads the code
instead of the text, prove the same fixture now fails, and prove legitimate code
still passes.

- [x] PROVEN — `verify-request-deadlines.mjs`
  - Risk: a network call without a deadline hangs a screen forever behind its
    own loading state; that is how the deck once sat under a spinner with no way
    out.
  - Invariant: every awaited network call inside a screen or component is
    wrapped in `withDeadline`.
  - Reproducible defect: a multi-line `await sendMessage(\n  matchId,\n  text,\n)`,
    or `import { sendMessage as transmitMessage }` and then `await transmitMessage(...)`.
  - Protection: AST, import bindings resolved, `AwaitExpression` inspected, and
    the set of network functions derived from `src/lib` instead of typed out.
  - Evidence: `scripts/gate-fixtures/deadlines/*.bad.tsx` — the old rule called
    `alias.bad.tsx` clean, the new one fails it; `wrapped.good.tsx` and
    `documented.good.tsx` stay green. Running the new rule on the app found
    **sixteen real awaited requests without a ceiling**, all fixed in the same
    commit. `scripts/verify-gate-selftests.mjs` runs the fixtures in CI.
  - Commit: `ac93e02`

- [x] PROVEN — `verify-worklet-contract.mjs`
  - Risk: a worklet calling a JS-runtime function kills the process. It has done
    so twice in this repository.
  - Invariant: everything a worklet calls is itself a worklet.
  - Reproducible defect: `import * as helpers from '../lib/motionPolicy';` then
    `helpers.resolveSpring()` inside a gesture callback or `useAnimatedStyle`.
  - Protection: AST; worklet bodies found by directive and by the callbacks
    Reanimated runs on the UI runtime; named, aliased and namespace imports
    resolved.
  - Evidence: `namespace.bad.tsx` was green under the old rule and fails now;
    the old rule also flagged `useAnimatedStyle(` itself, which the new one does
    not. `resolved-outside.good.tsx` stays green.
  - Commit: `969a43c`

- [x] PROVEN — `verify-i18n-coverage.mjs`
  - Risk: an English sentence reaches a reader in one of fifteen languages.
  - Invariant: user-facing text comes from the locale files.
  - Reproducible defect: `const deleteLabel = 'Delete account';` passed to a
    component prop.
  - Protection: AST; local literal bindings, ternaries and `??` chains followed
    into user-facing props.
  - Evidence: `binding.bad.tsx` and `conditional.bad.tsx` were both green under
    the old rule and fail now; `translated.good.tsx` stays green.
  - Commit: `7310598`

- [x] PROVEN — `verify-design-contract.mjs`
  - Risk: a colour that ignores the theme, so light mode or high contrast breaks
    in one corner nobody looks at.
  - Invariant: user-facing colour comes from tokens.
  - Reproducible defect: `rgb(255,255,255)`, `#fff`, `'white'`.
  - Protection: `#rgb`…`#rrggbbaa`, `rgb()`, `rgba()`, `hsl()`, `hsla()`, and
    named colours where a colour is expected — a theme id called `'lime'` is not
    a paint.
  - Evidence: `rgb.bad.tsx`, `shorthex.bad.tsx`, `named.bad.tsx` were all green
    under the old rule and fail now; `token.good.tsx` stays green. Four
    hand-written `'transparent'` values became tokens.
  - Commit: `7310598`

### [ ] OPEN — One release gate

Risk: "CI is green" and "this artefact was checked" are two different sentences
today. Two lists drift.
Invariant: production and CI run the same checks from one definition.
Evidence: —

### [ ] OPEN — A build that does not depend on the day

Risk: `eas-cli@latest` means a production build depends on what was published
this morning.
Invariant: build tooling is pinned and verifiable.
Evidence: —

### [ ] OPEN — The artefact is the evidence

Risk: a green commit and a shipped file are only connected by a story.
Invariant: commit, version, versionCode, artefact SHA-256, signing certificate,
mapping, lock hash and test evidence sit in one machine-readable record.
Evidence: —

---

## P1

- [ ] OPEN — CodeQL and dependency review
- [ ] OPEN — Secret scanning that catches a planted test secret
- [ ] OPEN — Black-box E2E on the built release candidate (Maestro)
- [ ] OPEN — Failure, kill and offline journeys
- [ ] OPEN — Adversarial RLS matrix (anon, A, B, blocked, former match, active match, moderator, admin, service role)

## P2

- [ ] OPEN — Android MASVS matrix with evidence per item
- [ ] OPEN — Performance regression gates from measured baselines
- [ ] OPEN — Device matrix
- [ ] OPEN — Branch coverage floors for the critical modules

## P3

- [ ] OPEN — Controlled decoupling of the four orchestrators
- [ ] OPEN — Observability decision (`[!] BLOCKED_OWNER` before any telemetry SDK)

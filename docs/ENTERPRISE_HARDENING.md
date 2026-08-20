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

### [x] PROVEN — One release gate

Risk: "CI is green" and "this artefact was checked" were two different
sentences. CI ran about twenty-five checks; the production build ran five plus
the tests, and the shorter list was the one standing between a mistake and the
store.
Invariant: production and CI run the same checks from one definition.
Protection: `scripts/quality-gate.mjs` — 29 checks in one ordered list, called
by `ci.yml`, by `eas-production-build.yml` and by `scripts/release-build.mjs`
before it stages anything.
Evidence: full run green locally (29/29) and in CI on `236b2d2`; the release
build refuses to stage without it, and its result is recorded in the release
evidence file.
Commit: `73215be`

### [x] PROVEN — A build that does not depend on the day

Risk: `eas-cli@latest` meant the artefact people install was built by whichever
version npm served that morning — not chosen, not visible in a diff. A moving
action tag has the same problem: it can be repointed at other code.
Invariant: build tooling is pinned and verifiable.
Protection: eas-cli pinned to 16.19.3; all seven workflows use action commits
with the tag as a comment; `scripts/verify-pinned-toolchain.mjs` fails on any
`@latest` or non-commit `uses:` and runs inside the quality gate.
Evidence: gate green with the check in place; CI green on `236b2d2`.
Commit: `73215be`

### [x] PROVEN — The artefact is the evidence

Risk: a green commit and a shipped file were connected by a story.
Invariant: commit, version, versionCode, artefact SHA-256, signing certificate,
mapping, lock hash, SBOM and gate result sit in one machine-readable record.
Protection: `scripts/lib/release-evidence.mjs`, written by every release into
`artifacts/release-evidence/<commit>.json`; `npm sbom` produces a CycloneDX list
of 507 components per build, hashed into the same record. Signature verification
already runs before anything is staged and fails closed without apksigner.
Evidence: `artifacts/release-evidence/73215bec…json` from a real build — four
artefacts hashed, certificate `16dfdf3e…` read out of the file, gate PASS across
29 checks, and the record correctly reporting an unclean tree.
Commit: `236b2d2`

---

## P1

- [x] PROVEN — CodeQL and dependency review
  - Protection: `.github/workflows/security.yml` — CodeQL over
    JavaScript/TypeScript with `security-extended`, dependency review on pull
    requests failing at high severity, weekly schedule so an advisory published
    after a merge still lands.
  - Evidence: workflow green on `1799ed9`; every action pinned to a commit.
  - Commit: `0e5ea72`, `1799ed9`

- [x] PROVEN — Secret scanning that catches a planted test secret
  - Risk: a firebase-debug log has already ridden into the public repository
    carrying the owner's address and every project id on the account.
  - Protection: `scripts/verify-no-secrets.mjs` over every tracked file, part of
    the quality gate and of the security workflow.
  - Evidence: six planted shapes — private key block, Google API key, GitHub
    token, Stripe live key, Supabase secret key, an assigned secret — are all
    caught, and public identifiers stay quiet. The samples are assembled at
    runtime, never stored, because a file full of credential-shaped strings is
    the thing this gate exists to prevent. One real finding: the Firebase client
    key in `google-services.json`, allowlisted with its reason (it ships inside
    every APK by design and is restricted to package and certificate).
  - Commit: `0e5ea72`
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

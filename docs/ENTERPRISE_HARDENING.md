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
- [x] PROVEN — Black-box E2E on the built release candidate (Maestro)
  - Protection: `.maestro/` — four journeys driven by `scripts/e2e.mjs`, which
    stages a labelled account, a demo deck and one conversation and removes all
    three afterwards. Maestro 2.8.0, pinned; credentials passed through the
    environment.
  - Evidence: all four green against 1.0.4 on the Galaxy A15 — sign in and the
    deck arriving, sign out, a bind surviving a process restart, a message the
    app confirms as sent.
  - Commit: `180fce0`

- [x] PROVEN — Failure, kill and offline journeys
  - Reproducible defect: the failure this app was rebuilt around — a message
    typed with no signal and an app closed before the signal came back.
  - Protection: `scripts/e2e-offline.mjs` owns the sequence Maestro cannot:
    sign in online, open the conversation, cut wifi and mobile data, write and
    send, force-stop the process while the message is still waiting, restore the
    network, relaunch.
  - Evidence: run on the device — "Warten auf Verbindung" observed while
    offline, and after the kill and reconnect the same text appeared as
    "Gesendet" without anybody tapping retry.
  - Observation for the owner: launching with **no** network lands on a
    full-screen offline state, so existing conversations cannot be reached at
    all. Defensible; worth a decision rather than a discovery.
  - Commit: `180fce0`

- [x] PROVEN — Adversarial RLS matrix
  - Protection: `supabase/tests/phase12_rls_matrix_test.sql` — 26 questions
    asked as somebody trying: anon, an active match, somebody who unmatched,
    somebody who blocked, and the blocked person from the other side.
  - Evidence: green in the pgTAP suite. Two assertions had to be rewritten to
    stay honest — an UPDATE a policy filters away raises nothing, so it is
    asserted on the row afterwards; and `authenticated` genuinely needs USAGE on
    the private schema, so the assertion is that no private table answers.
  - The last assumption — that PostgREST does not serve that schema — is now
    asked over HTTP by `scripts/verify-api-surface.mjs` in the database
    workflow: three private helpers unreachable, seven tables silent for anon.
  - Commit: `6b4a05a`

## P2

- [ ] OPEN — Android MASVS matrix with evidence per item
- [ ] OPEN — Performance regression gates from measured baselines
- [ ] OPEN — Device matrix
- [ ] OPEN — Branch coverage floors for the critical modules

## P3

- [~] ACTIVE — Controlled decoupling of the four orchestrators
  - First one done, as the pattern for the rest: the decision table left
    `DiscoveryScreen` for `src/lib/decisionOutcome.ts`. Five outcomes —
    confirmed, matched, no network, session gone, refused — each with an answer
    to "does the card leave", "does anything get stored", "does the deck
    reload", "is the person told". Seven tests, 100% of branches; the screen
    keeps the effects.
  - Why this one first: both bugs this path ever had were in the table, not in
    the animation, and both were invisible while the two were tangled.
  - Evidence that nothing changed: journeys and the offline-and-kill scenario
    pass on the rebuilt app, the source-level order test still guards that the
    write happens before the dismissal, coverage floors hold, and the graph
    shows no new import cycles (1688 nodes, 3371 edges).
  - Commit: `eeb38b0`
  - Next, in order: ChatScreen's transport and retry, Root's session and route
    state, ProfileSettings' media pipeline.
- [ ] OPEN — Observability decision (`[!] BLOCKED_OWNER` before any telemetry SDK)

---

## The first READY

Commit `ad69dec3`, Binder 1.0.4 (versionCode 101), AAB `c2804702cb7049c7…` —
every answer PASS, each from a record written for that commit:

```json
{"quality":"PASS","database":"PASS","security":"PASS","e2e":"PASS",
 "performance":"PASS","signature":"PASS","device":"PASS","verdict":"READY"}
```

It took four attempts to get there, and none of them involved lowering a bar:
the first build came from a dirty tree, the second had no database record, the
third had journeys from a neighbouring commit. Evidence that does not belong to
the artefact being judged reads STALE and the verdict falls back.

## The release candidate gate

`npm run release:candidate` answers twelve questions about one commit and one
file, each from a record on disk, and refuses to guess. Evidence from another
commit is `STALE`, evidence that does not exist is `MISSING`, and either one
makes the verdict `NOT READY`.

Proven on commit `79497ae0` (1.0.4, versionCode 101, AAB
`80bfd5ed3520294e…`):

| Answer | From |
|---|---|
| quality gate PASS | 30 checks, one list shared by CI, the production workflow and the release script |
| artefacts hashed, signature, mapping, SBOM, lock | the release record written by the build itself |
| tree clean | `git status` at build time |
| database PASS | 18 pgTAP suites, recorded for this commit |
| journeys PASS | three black-box flows on the installed build |
| offline and kill PASS | message written with no network, process killed, delivered after reconnect |
| export size PASS | 5.18 MiB JS against the 5.5 MiB ceiling |
| device evidence MISSING | no device matrix yet |

Verdict: **NOT READY**, for one honest reason. That is the gate working: it
names what is missing instead of rounding up.

## Still open

- [x] PROVEN — Device matrix
  - Protection: `scripts/device-matrix.mjs` — every condition set through adb,
    the journeys run against the installed build, the result written per
    condition. A harness failure gets one retry after an adb reset and the
    retry is recorded rather than hidden.
  - Evidence: PASS on all four conditions (light, dark, 200% font, animations
    off) on the Galaxy A15 under Android 16, three journeys each.
  - Commit: `ad69dec`

- [x] PROVEN — Branch coverage floors
  - Evidence: 44 modules in `src/lib` carry a floor measured from a real run;
    decisionQueue, sessionEnd and photoPager at 100% of branches. Part of the
    quality gate.
  - Commit: `4d6a0cb`

- [x] PROVEN — Android security posture (`docs/ANDROID_SECURITY.md`)
  - Evidence: flags read out of the shipped AAB rather than the source —
    `allowBackup=false`, no debuggable flag, R8 on, no cleartext, one deep-link
    scheme with `autoVerify` off, no `console.log` in `src/`. Three controls
    deliberately not added, each with its reason.
  - Commit: `c4f41e7`
- [x] PROVEN — Performance regression gates
  - Protection: `scripts/performance.mjs` — cold start as the median of five
    force-stopped launches, frame statistics from `gfxinfo` while Maestro moves
    the deck and the photo pager, and total PSS after ten photos have been
    decoded. Budgets are the measured baseline plus a margin for a busier phone.
  - Evidence: baseline on the Galaxy A15 under Android 16 — 980 ms, 0.61% janky
    frames of 8851, 338.7 MB. A second run measured 0.66% and 345.8 MB and
    passed: that is what noise looks like, and a regression looks different.
  - Commit: `87168f2`
- [x] PROVEN — Branch coverage floors for the critical modules
  - Evidence: 48 modules in `src/lib` carry a floor measured from a real run.
    The modules pulled out of the orchestrators sit at 100% of branches:
    `decisionOutcome`, `messageOutcome`, `identityReset`, `photoGallery`,
    `photoCrop`. `scripts/verify-coverage-floors.mjs` is check 30 of the gate
    and fails on a floor that drops by more than a point.
  - Commit: `bb7e6f6`

- [x] PROVEN — Controlled decoupling of the four orchestrators
  - Protection: each screen kept its rules in its handlers, where they drifted
    apart. The decisions now live in pure modules that import nothing and are
    tested directly: `decisionOutcome` (DiscoveryScreen), `messageOutcome`
    (ChatScreen), `identityReset` (Root), `photoGallery` and `photoCrop`
    (ProfileSettingsScreen and the partner profile).
  - Evidence: every one at 100% of branches, and two defects fell out of the
    move — the gallery guards were not the same shape between add, move and
    replace, and the card crop centred what it kept, cutting heads off portraits.
  - Commit: `bb7e6f6`

- [x] PROVEN — Lint for the ordinary mistake (Phase 10)
  - Protection: `eslint.config.mjs` runs behaviour rules only — hooks and
    shadowing — because the four AST verifiers cover what is specific to Binder
    and TypeScript covers types. `eslint-config-expo` is deliberately not used:
    it pulls `unrs-resolver`, whose optional WASM bindings resolve differently
    under npm 10 and npm 11 and broke `npm ci` in every workflow.
  - Evidence: four real shadowing defects fixed (Root, DiscoveryScreen,
    ProfileScreen); 0 errors, 32 warnings; check 26 of the gate.
  - Commit: `3ec24f7`
### Decided — observability without a new data recipient

No third-party telemetry SDK. Sentry or Crashlytics would mean stack traces,
device identifiers, breadcrumbs and an IP address leaving the phone to a company
that is not us, for a dating app, requiring a processing agreement, an entry in
the privacy policy and a new answer in the Play data safety form — in exchange
for crash reports.

Google Play already provides those. Android Vitals reports crashes and ANRs for
every published build, with deobfuscated stack traces from the mapping file each
release already uploads, and it collects nothing the store does not collect
anyway. That is the better trade, not the easier one: the same signal, no new
data flow, nothing to declare, nothing to explain to a user.

Revisit only if Vitals proves too coarse for a specific fault, and then with a
named question rather than an SDK.

### Decided — device coverage on hardware we own

Firebase Test Lab's free tier is real but small (a handful of device-minutes a
day, and the physical devices are the part that runs out first), and beyond it
it is billed per device-hour. The matrix that matters — light, dark, doubled
font, reduced motion, offline, killed process — runs on the Galaxy A15 here for
nothing and on every commit we choose. Test Lab is worth revisiting when there
is a *specific* device we suspect, not as a subscription to breadth.

## Product observations — both decided and done

- Launching with no network showed a full-screen offline state, so a
  conversation already on the phone could not be opened. Fixed: the acceptance
  this phone already gave is remembered and used while nobody answers, so the
  app opens and each screen says for itself what it cannot reach. New terms
  still stop everything, and a server answer always wins. (`45f6b0d`)
- `zz_chat_backup` is dropped — six message bodies, outside every policy that
  protects the real table and outside account deletion, read by nothing.
  (`45f6b0d`)

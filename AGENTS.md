# AGENTS.md — working agreement for Binder

Read this first. It replaces re-mapping the repository and encodes the rules
every agent session must follow. Human owner: Belkis (GitHub `BEKO2210`).

## Non-negotiable rules

1. **Binder stays one free product.** No Pro/Premium/Boost/paywall/paid feature,
   ever. Do not add monetization surfaces or copy that hints at them.
2. **Never weaken a gate.** CI steps, verifiers (`scripts/verify-*.mjs`),
   pgTAP/concurrency suites and `npm test` may become stricter, never removed,
   bypassed or softened to get green.
3. **No secrets in repo, logs or chat.** FCM service-account JSON, Expo tokens,
   dispatch secrets, DB passwords: never print, never commit. The only
   committed credential-like file is `google-services.json` (public by design).
   GitHub Actions secret: `EXPO_TOKEN`. Edge Function secret:
   `BINDER_PUSH_DISPATCH_SECRET` (value held in Supabase + Vault only).
4. **Production Supabase** (`sbohsxtzitqhyswznhec`, PG17, eu-central-1) is
   changed only with the owner's explicit GO and only after all gates are green
   on the exact candidate commit. Never delete outbox/delivery rows (audit
   trail). Migration bookkeeping is synchronized — plain `supabase db push`
   works; never repair history without checking `supabase migration list`.
5. **Never claim something passed that was not executed.** Device rows in
   `docs/PHASE7-DEVICE-MATRIX.md` are recorded only with real evidence.
6. **UI discipline:** design tokens only (no raw hex in `src/screens|components`
   — CI enforces), warning/destructive colors never restyled, 48dp touch
   targets, Reduce Motion respected via `src/lib/motionPolicy.ts`, no
   competitor names in product copy, all user-visible copy production-quality.
7. **Server truth:** destructive/social actions only look successful after the
   server confirms (decisions, sends, deletions). Client never invents state.

## How work runs

- Work directly on `main` (owner decision since 2026-08-16). One concern per
  commit series; run gates before every push:
  `npm run typecheck && npm test` plus the relevant `verify:*` scripts.
- Commit messages: meaningful prose (why + what), no emoji.
- Research before building bigger UX: `docs/UIUX-PROGRAM.md` holds the
  research findings, phase plan and defect log — extend it, don't fork it.
- Every fix/feature that has pure logic gets a node:test file under `tests/`
  (`npm test`, Node --experimental-strip-types; test files import from `src`
  with explicit `.ts` extension; `tests/` is excluded from tsc).
- On-device proof: EAS preview build via
  `gh workflow run eas-preview-build.yml --ref main`, install on the connected
  device (`adb`), screenshot the touched states. Local native compile check:
  `npx expo prebuild --platform android --no-install` then
  `cd android && JAVA_HOME=$HOME/.local/jdk17 ./gradlew assembleDebug`.

## Environment facts (lenovo dev node)

- JDK for Gradle: `~/.local/jdk17` (Temurin 17). Do NOT use the Android Studio
  JBR 25 — a Gradle-provisioned JDK 25 breaks AGP's prefab step, and
  `~/.gradle/gradle.properties` pins auto-download off.
- `android/` is generated (`expo prebuild`) and gitignored. `--clean` wipes
  `android/local.properties` (recreate with `sdk.dir=/home/belkis/Android/Sdk`)
  and regenerates `android/gradle/gradle-daemon-jvm.properties` with
  `toolchainVersion=25` — set it back to 17 after every `--clean`.
- `expo prebuild` rewrites `package.json` start scripts; revert that hunk, keep
  real dependency changes. Repo intentionally commits no `package-lock.json`.
- Supabase CLI: `~/.local/bin/supabase`, logged in, project linked.
- Devices: Samsung S23 Ultra (SM-S918B, Android 16) + Tab S9 Ultra (SM-X910,
  Android 16), USB debugging; installs via the Expo build page → pull APK →
  `adb install -r`.

## Key identifiers

- Android package: `de.beko2210.binder`
- EAS project: `167de5e7-e72f-4fcd-bc7c-379513ff2b21` (account `beko2210s-team`)
- Firebase project: `binder-90d33` (FCM v1 key lives in EAS credentials)
- Public site: `https://beko2210.github.io/Binder/` (privacy, terms,
  delete-account, impressum, safety-standards)
- Contact/operator: Belkis Aslani, Vogelsangstraße 32, 71691 Freiberg am
  Neckar — Impressum in app (`src/screens/AboutScreen.tsx`) and site.

## State (2026-08-16)

- Phases 1–7 live on `main`; Phase-7 push runs in production end-to-end
  (migration applied, `dispatch-push` deployed, per-minute cron via Vault
  secret, real deliveries with Expo receipts proven on device).
- UI/UX program P0–P7 complete (see `docs/UIUX-PROGRAM.md`): keyboard
  (react-native-keyboard-controller), safe-area choke point in `src/Root.tsx`,
  gesture deck (Reanimated), match celebration, birthday input, chat timeline,
  partner profile page, About/Impressum, full-photo viewer, Higgsfield brand
  mark (masters in `assets/brand-src/`, pipeline copies them).
- Play Console in progress: closed-testing track, listing assets in
  `~/Desktop/binder-playstore/`, CSAE page live. Reviewer account
  `play.review@binder-review.de` exists in Auth but still needs onboarding
  completion (photo upload to bucket + SQL for legal/onboarding/location).
- Open: remaining device-matrix rows (quiet hours, categories, vibration,
  block/unmatch-after-enqueue, rotation, reinstall), P8 full audit with a
  fresh account, staged store screenshots before public launch.

## Test accounts (production, test data only)

- Belkis Aslani `b4b3a5d3-ccde-4d7c-8e97-b8b512fecf4f` (Tab S9)
- Renate Lerch `63ef837a-c98c-4163-bb22-f37aa3d70a64` (S23)
- Re-match reset: delete their `public.matches` row and both
  `public.decisions` rows (`actor_id`/`target_id`), then Refresh nearby.
- Photo moderation approval (operator path):
  `select private.moderate_case(c.id, 'approve_media', 'belkis-operator', '<note>') from private.moderation_cases c where c.source_type = 'photo_review' and c.status in ('open','reviewing');`

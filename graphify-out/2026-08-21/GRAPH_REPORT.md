# Graph Report - Binder  (2026-08-20)

## Corpus Check
- 363 files · ~323,316 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1688 nodes · 3371 edges · 125 communities (97 shown, 28 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.59)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `eeb38b0a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ThemeProvider.tsx
- ChatScreen.tsx
- ProfileSettingsScreen.tsx
- DiscoveryFilterSheet.tsx
- dependencies
- scripts
- InterestPicker.tsx
- format.ts
- AppSettingsScreen.tsx
- admin.js
- index.ts
- expo
- ui-crawl.py
- Root.tsx
- AGENTS.md — the working agreement for Binder
- PartnerProfileScreen.tsx
- BinderDial.tsx
- safety.ts
- index.ts
- notifications.ts
- useBinderTheme
- reliability.ts
- release-build.mjs
- beta.ts
- DiscoveryScreen.tsx
- store-assets.py
- build-site-languages.mjs
- ProfileScreen.tsx
- i18n-sync.mjs
- header-art.js
- verify-i18n-coverage.mjs
- verify-phase7-push.mjs
- DiscoveryPreferences.tsx
- discoveryDeck.ts
- googleAuth.ts
- stage-demo-profiles.mjs
- verify-phase5-contract.mjs
- verify-site.mjs
- MatchCelebration.tsx
- BinderText
- deepLinks.ts
- supabase.ts
- database.ts
- report-bundle-size.mjs
- verify-brand-assets.mjs
- verify-worklet-contract.mjs
- AuthScreen.tsx
- verify-design-contract.mjs
- verify-safety-contract.mjs
- tsconfig.tests.json
- prune-releases.mjs
- verify-audit-baseline.mjs
- LiquidHeart.tsx
- compilerOptions
- verify-phase6-design.mjs
- build-email-templates.mjs
- build-push-copy.mjs
- measure-gallery-memory.sh
- index.ts
- phase2_concurrency.sh
- generate-demo-portraits.mjs
- materialize-brand-assets.mjs
- Reciprocal Constellation
- deno.json
- deno.json
- deno.json
- phase3_concurrency.sh
- phase4_delete_account_integration.sh
- phase6_media_concurrency.sh
- accentContrast.test.ts
- measure-interaction-frames.sh
- verify-admin-dashboard.mjs
- verify-i18n.mjs
- verify-phase6-settings.mjs
- matchCelebrationAssets.ts
- expo-symbols-internals.d.ts
- phase3_rate_concurrency.sh
- phase7_push_concurrency.sh
- README.md
- as-test-user.sh
- .tmp-create-de.mjs
- verify-entrypoint.mjs
- verify-phase6-media.mjs
- aes-js.d.ts
- googleAuth.test.ts
- birthdate.ts
- images.ts
- supabase
- verify-data-safety.mjs
- confirmDestructive.ts
- BinderErrorBoundary
- verify-site-language-switch.mjs
- conversationKeyboardPadding
- presetChips.test.ts
- discoveryScreenReader.test.ts
- BinderButton
- header-art.js
- MatchesScreen.tsx
- motionPolicy.ts
- ChatScreen
- chatTimeline.ts
- verify-site-download.mjs
- package.json
- devDependencies
- menuSessionEnd.test.ts
- mediaRemoval.test.ts
- discoveryDecisionOrder.test.ts
- releaseSignatureGate.test.ts
- verify-coverage-floors.mjs
- verify-no-secrets.mjs
- conversationKeyboardPadding
- db-evidence.mjs
- stage-test-match.mjs
- verify-pinned-toolchain.mjs

## God Nodes (most connected - your core abstractions)
1. `useBinderTheme()` - 109 edges
2. `scripts` - 52 edges
3. `BinderText()` - 40 edges
4. `BinderApp()` - 26 edges
5. `withDeadline()` - 25 edges
6. `DiscoveryScreen()` - 24 edges
7. `BinderButton()` - 23 edges
8. `MotionPressable()` - 23 edges
9. `classifyError()` - 22 edges
10. `useBinderHaptics()` - 22 edges

## Surprising Connections (you probably didn't know these)
- `filesUnder()` --indirect_call--> `entry()`  [INFERRED]
  scripts/lib/network-calls.mjs → src/lib/interestCatalog.ts
- `refreshDiscoveryLocation()` --indirect_call--> `position()`  [INFERRED]
  src/lib/discovery.ts → site/header-art.js
- `makeGesture()` --calls--> `resolveSpring()`  [EXTRACTED]
  scripts/gate-fixtures/worklets/resolved-outside.good.tsx → src/lib/motionPolicy.ts
- `PhotoPager()` --indirect_call--> `position()`  [INFERRED]
  src/components/PhotoPager.tsx → site/header-art.js
- `TopInset()` --calls--> `useBinderTheme()`  [EXTRACTED]
  src/Root.tsx → src/theme/ThemeProvider.tsx

## Import Cycles
- None detected.

## Communities (125 total, 28 thin omitted)

### Community 0 - "ThemeProvider.tsx"
Cohesion: 0.05
Nodes (53): swipe, makeGesture(), auroraSource, DiscoveryLoading(), MatchCelebration(), Portrait(), Props, DiscoveryProfile (+45 more)

### Community 1 - "ChatScreen.tsx"
Cohesion: 0.14
Nodes (19): createClientMessageId(), fetchMessages(), fetchMessagesPage(), markMatchRead(), MatchSummary, Message, MessagePage, ReportReason (+11 more)

### Community 2 - "ProfileSettingsScreen.tsx"
Cohesion: 0.10
Nodes (20): artefacts, builtAt, commit, dependencies, lockfileSha256, sbom, node, qualityGate (+12 more)

### Community 3 - "DiscoveryFilterSheet.tsx"
Cohesion: 0.06
Nodes (60): AttributeEditor(), Props, AttributeFilterSection(), Props, CountConsequence(), DiscoveryFilterSheet(), GroupErrors, LoadedProfile (+52 more)

### Community 4 - "dependencies"
Cohesion: 0.05
Nodes (42): author, dependencies, aes-js, expo, expo-audio, expo-build-properties, expo-constants, expo-crypto (+34 more)

### Community 5 - "scripts"
Cohesion: 0.04
Nodes (52): scripts, android, brand:assets, bundlecheck, coverage, coverage:record, db:evidence, device:matrix (+44 more)

### Community 6 - "InterestPicker.tsx"
Cohesion: 0.09
Nodes (37): InterestPicker(), knownIds, labelOfKnown(), Props, availableLocales(), dictionaries, Dictionary, hasTranslations() (+29 more)

### Community 7 - "format.ts"
Cohesion: 0.33
Nodes (10): previewTimeLabel(), DayLabel, formatCount(), formatDayLabel(), formatDistanceKm(), formatTime(), resolvedLocale(), startOfLocalDay() (+2 more)

### Community 8 - "AppSettingsScreen.tsx"
Cohesion: 0.14
Nodes (19): BetaEventName, BetaFeedbackCategory, BetaOutcome, BetaSettings, BetaSurface, BINDER_APP_VERSION, getBetaSettings(), initializeBetaDiagnostics() (+11 more)

### Community 9 - "admin.js"
Cohesion: 0.23
Nodes (31): actionButton(), allowedTabs(), attachProtectedImage(), authorizeSession(), bindEvents(), configurePermissions(), empty(), evidenceBlock() (+23 more)

### Community 10 - "index.ts"
Cohesion: 0.18
Nodes (15): BinderCard(), BinderChip(), BinderInput(), ScreenState(), Props, SectionHeader(), Props, VerifiedBadge() (+7 more)

### Community 11 - "expo"
Cohesion: 0.07
Nodes (29): backgroundColor, foregroundImage, monochromeImage, adaptiveIcon, allowBackup, blockedPermissions, googleServicesFile, icon (+21 more)

### Community 12 - "ui-crawl.py"
Cohesion: 0.15
Nodes (24): Path, adb(), adb_raw(), audit(), crawl(), devices(), dump(), dump_settled() (+16 more)

### Community 13 - "Root.tsx"
Cohesion: 0.09
Nodes (24): sessionIdentityChanged(), acceptanceApplies(), CachedAcceptance, forgetAcceptance(), recallAcceptance(), rememberAcceptance(), consumeIntentionalSignOut(), forgetIntentionalSignOut() (+16 more)

### Community 14 - "AGENTS.md — the working agreement for Binder"
Cohesion: 0.12
Nodes (15): AGENTS.md — how work is done in this repository, Gates — all of them, before every push, How work runs, Languages, Lessons that cost real time, Non-negotiable rules, Push, and what has to be true before it is on, The public site (+7 more)

### Community 15 - "PartnerProfileScreen.tsx"
Cohesion: 0.15
Nodes (26): animate(), curve(), dot(), eventStrength(), makeSignals(), mulberry32(), position(), render() (+18 more)

### Community 16 - "BinderDial.tsx"
Cohesion: 0.17
Nodes (23): BinderDial(), BinderDialProps, CommonProps, DialTick, nearestIndex(), RangeProps, SingleProps, StepButton() (+15 more)

### Community 17 - "safety.ts"
Cohesion: 0.11
Nodes (25): alternatesFor(), appLocaleDir, appLocales, checkOnly, countStrings(), dictionaries, drifted, englishStrings (+17 more)

### Community 18 - "index.ts"
Cohesion: 0.18
Nodes (17): PUSH_COPY, pushCopy(), PushKind, channelId(), checkReceipts(), ClaimedDelivery, ClaimedReceipt, expoHeaders() (+9 more)

### Community 19 - "notifications.ts"
Cohesion: 0.06
Nodes (76): Props, VoiceIntroEditor(), confirmDestructive(), blockUser(), fetchMatches(), signProfilePhoto(), uploadVoiceRecording(), DestructiveConfirmationAction (+68 more)

### Community 20 - "useBinderTheme"
Cohesion: 0.29
Nodes (9): attempts, DraftAttempt, forgetAllChats(), forgetChat(), recallAttempts(), recallDraft(), rememberAttempts(), rememberDraft() (+1 more)

### Community 21 - "reliability.ts"
Cohesion: 0.10
Nodes (20): artefacts, builtAt, commit, dependencies, lockfileSha256, sbom, node, qualityGate (+12 more)

### Community 22 - "release-build.mjs"
Cohesion: 0.09
Nodes (21): certificateOf(), git(), sha256(), writeEvidence(), appJson, appJsonPath, builtApk, certs (+13 more)

### Community 23 - "beta.ts"
Cohesion: 0.13
Nodes (24): BinderButtonVariant, Props, Props, BinderIcon(), BinderIconButton(), BinderIconName, IconButtonProps, iconFont (+16 more)

### Community 24 - "DiscoveryScreen.tsx"
Cohesion: 0.08
Nodes (41): DecisionOutcome, NOTHING, outcomeForConfirmation(), outcomeForFailure(), outcomeForQueueFailure(), shouldReloadDeck(), addPending(), loadPending() (+33 more)

### Community 25 - "store-assets.py"
Cohesion: 0.32
Nodes (13): device_shot(), feature_graphic(), font(), frame(), ground(), icon(), main(), paste_with_shadow() (+5 more)

### Community 26 - "build-site-languages.mjs"
Cohesion: 0.25
Nodes (6): codes, dictionaries, languages, problems, siteLocales, sourceKeys

### Community 27 - "ProfileScreen.tsx"
Cohesion: 0.12
Nodes (20): BinderScreenHeader(), acceptCurrentLegalGate(), deleteCurrentAccount(), DiscoveryReportReason, fetchMySafetyNotice(), getLegalGate(), getMyPrimaryMediaState(), LegalGate (+12 more)

### Community 28 - "i18n-sync.mjs"
Cohesion: 0.17
Nodes (9): codes, dictionaries, entries, files, imports, problems, report, sourceKeys (+1 more)

### Community 29 - "header-art.js"
Cohesion: 0.08
Nodes (38): ageSteps, discoveryDefaults, DiscoveryPreferences(), PreferenceGroup(), Props, ageOn(), assessBirthDate(), BirthDateAssessment (+30 more)

### Community 30 - "verify-i18n-coverage.mjs"
Cohesion: 0.07
Nodes (45): findViolations(), hasExemption(), insideDeadline(), findEnglish(), isProse(), literalBindings(), stringsFrom(), USER_FACING_PROPS (+37 more)

### Community 31 - "verify-phase7-push.mjs"
Cohesion: 0.18
Nodes (10): activation, app, chat, eas, failures, migration, notifications, requiredMigrationContracts (+2 more)

### Community 32 - "DiscoveryPreferences.tsx"
Cohesion: 0.31
Nodes (10): Props, VoiceMessageBubble(), Props, VoiceRecorderBar(), signedVoiceUrl(), formatVoiceDuration(), interruptedTakeAction(), recordingStopDecision() (+2 more)

### Community 33 - "discoveryDeck.ts"
Cohesion: 0.18
Nodes (11): entries, html, keyFor(), [locale, pagePath, pageId], localePath, META_SKIP, root, slug() (+3 more)

### Community 34 - "googleAuth.ts"
Cohesion: 0.24
Nodes (10): addUnsent(), clearUnsent(), forgetUnsentMatch(), isMessage(), loadUnsent(), removeUnsent(), saveUnsent(), unsentInOrder() (+2 more)

### Community 35 - "stage-demo-profiles.mjs"
Cohesion: 0.22
Nodes (6): createUser(), headers, key, listDemoUsers(), manifest, [mode, manifestPath]

### Community 36 - "verify-phase5-contract.mjs"
Cohesion: 0.20
Nodes (8): app, beta, boundary, core, failures, pkg, ranking, screen

### Community 37 - "verify-site.mjs"
Cohesion: 0.20
Nodes (9): css, deletion, failures, forbidden, home, pages, privacy, siteAssets (+1 more)

### Community 38 - "MatchCelebration.tsx"
Cohesion: 0.20
Nodes (7): body, changes, COLLECTED, MULTI_CHOICE, rows, SINGLE_CHOICE, TOP_LEVEL

### Community 39 - "BinderText"
Cohesion: 0.22
Nodes (8): 1. Was die App erhebt, 1b. Spalte für Spalte, 2. Die Antworten je Datentyp, 3. Die übrigen Erklärungen unter App-Inhalte, 4. Wie das Formular maschinell befüllt wird, 5. Was am hochgeladenen Stand falsch war, 6. FOREGROUND_SERVICE_MEDIA_PLAYBACK, Play Console: Datensicherheit und App-Inhalte

### Community 40 - "deepLinks.ts"
Cohesion: 0.33
Nodes (8): AuthCallback, AuthCallbackKind, CALLBACK_HOSTS, parseAuthCallback(), parseRecoveryCallback(), RecoveryCallback, singleParameter(), validOpaque()

### Community 41 - "supabase.ts"
Cohesion: 0.10
Nodes (20): artefacts, builtAt, commit, dependencies, lockfileSha256, sbom, node, qualityGate (+12 more)

### Community 42 - "database.ts"
Cohesion: 0.10
Nodes (20): artefacts, builtAt, commit, dependencies, lockfileSha256, sbom, node, qualityGate (+12 more)

### Community 43 - "report-bundle-size.mjs"
Cohesion: 0.47
Nodes (7): collectBundleReport(), formatBundleReport(), main(), mb(), mibBytes(), sourceModules(), walk()

### Community 44 - "verify-brand-assets.mjs"
Cohesion: 0.22
Nodes (8): brandComponent, brandReadme, config, failures, generator, notifications, required, splash

### Community 45 - "verify-worklet-contract.mjs"
Cohesion: 0.10
Nodes (20): artefacts, builtAt, commit, dependencies, lockfileSha256, sbom, node, qualityGate (+12 more)

### Community 46 - "AuthScreen.tsx"
Cohesion: 0.05
Nodes (42): AuthFieldErrors, AuthMode, hasAuthErrors(), validateAuthForm(), configure(), describeGoogleError(), GoogleSignInOutcome, isGoogleSignInConfigured() (+34 more)

### Community 47 - "verify-design-contract.mjs"
Cohesion: 0.22
Nodes (7): allowlist, COLOUR_PROPERTY, failures, root, rules, scanRoots, usedAllowlist

### Community 48 - "verify-safety-contract.mjs"
Cohesion: 0.25
Nodes (6): accountSurface, discovery, failures, profile, root, safety

### Community 49 - "tsconfig.tests.json"
Cohesion: 0.25
Nodes (7): compilerOptions, allowImportingTsExtensions, noEmit, types, exclude, extends, include

### Community 50 - "prune-releases.mjs"
Cohesion: 0.29
Nodes (5): builds, doomed, dryRun, keep, versions

### Community 51 - "verify-audit-baseline.mjs"
Cohesion: 0.29
Nodes (5): accepted, allowedHighAdvisories, audit, failures, packageJson

### Community 52 - "LiquidHeart.tsx"
Cohesion: 0.10
Nodes (20): artefacts, builtAt, commit, dependencies, lockfileSha256, sbom, node, qualityGate (+12 more)

### Community 53 - "compilerOptions"
Cohesion: 0.29
Nodes (6): compilerOptions, allowImportingTsExtensions, noUncheckedIndexedAccess, strict, exclude, extends

### Community 54 - "verify-phase6-design.mjs"
Cohesion: 0.33
Nodes (4): failures, productionFiles, required, tokenSource

### Community 55 - "build-email-templates.mjs"
Cohesion: 0.40
Nodes (3): check, mails, stale

### Community 56 - "build-push-copy.mjs"
Cohesion: 0.40
Nodes (4): copy, KINDS, locales, missing

### Community 57 - "measure-gallery-memory.sh"
Cohesion: 0.60
Nodes (3): measure-gallery-memory.sh script, tap_label(), usage()

### Community 58 - "index.ts"
Cohesion: 0.50
Nodes (3): allowedOrigin(), InviteBody, respond()

### Community 59 - "phase2_concurrency.sh"
Cohesion: 0.70
Nodes (4): assert_counts(), call_bind(), run_parallel_round(), phase2_concurrency.sh script

### Community 60 - "generate-demo-portraits.mjs"
Cohesion: 0.50
Nodes (3): key, manifest, [manifestPath, outDir]

### Community 61 - "materialize-brand-assets.mjs"
Cohesion: 0.50
Nodes (3): failures, FILES, PNG_SIGNATURE

### Community 62 - "Reciprocal Constellation"
Cohesion: 0.50
Nodes (3): Computable principles, Display parameters, Reciprocal Constellation

### Community 63 - "deno.json"
Cohesion: 0.50
Nodes (3): compilerOptions, strict, nodeModulesDir

### Community 64 - "deno.json"
Cohesion: 0.50
Nodes (3): compilerOptions, strict, nodeModulesDir

### Community 65 - "deno.json"
Cohesion: 0.50
Nodes (3): compilerOptions, strict, nodeModulesDir

### Community 66 - "phase3_concurrency.sh"
Cohesion: 0.83
Nodes (3): call_send(), call_unmatch(), phase3_concurrency.sh script

### Community 68 - "phase6_media_concurrency.sh"
Cohesion: 0.83
Nodes (3): register_one(), reorder(), phase6_media_concurrency.sh script

### Community 69 - "accentContrast.test.ts"
Cohesion: 0.67
Nodes (3): contrast(), luminance(), tokenSource

### Community 74 - "matchCelebrationAssets.ts"
Cohesion: 0.22
Nodes (5): created, headers, key, [mode], payload

### Community 87 - "birthdate.ts"
Cohesion: 0.11
Nodes (17): answers, database, device, e2e, evidenceDir, gate, newestEvidence(), offline (+9 more)

### Community 88 - "images.ts"
Cohesion: 0.11
Nodes (17): Baseline, Decided — device coverage on hardware we own, Decided — observability without a new data recipient, Enterprise hardening, P0, P1, P2, P3 (+9 more)

### Community 89 - "supabase"
Cohesion: 0.18
Nodes (11): account, baseline, coldStartMs(), flow(), interactionFrames(), maestro, MARGIN, memoryMb() (+3 more)

### Community 90 - "verify-data-safety.mjs"
Cohesion: 0.33
Nodes (5): doc, IGNORED, PERSONAL_TABLES, problems, types

### Community 91 - "confirmDestructive.ts"
Cohesion: 0.20
Nodes (8): ANDROID_CHECKS, CHECKS, failed, plan, PREPARE, report, results, withAndroid

### Community 92 - "BinderErrorBoundary"
Cohesion: 0.17
Nodes (6): BinderErrorBoundary, CrashFallback(), Props, State, BinderBrand(), binderIcon

### Community 94 - "conversationKeyboardPadding"
Cohesion: 0.25
Nodes (7): CONDITIONS, device(), evidence, hardware, results, shell(), wanted

### Community 98 - "header-art.js"
Cohesion: 0.29
Nodes (4): account, device(), maestro, network()

### Community 99 - "MatchesScreen.tsx"
Cohesion: 0.29
Nodes (6): Android security posture, Network, Not done, and named as such, Permissions, Platform, Storage

### Community 100 - "motionPolicy.ts"
Cohesion: 0.57
Nodes (4): LiquidHeart(), Props, heartPath(), liquidPath()

### Community 101 - "ChatScreen"
Cohesion: 0.42
Nodes (8): composerBody(), conversationErrorSurface, conversationListContentStyle(), ConversationPreview, shouldShowConnectionNotice(), splitConversationPreviews(), unsentMessageNote(), ChatScreen()

### Community 102 - "chatTimeline.ts"
Cohesion: 0.31
Nodes (6): buildChatTimeline(), dayKey(), localDayKey(), TimelineItem, TimelineMessage, ref

### Community 103 - "verify-site-download.mjs"
Cohesion: 0.29
Nodes (5): element(), ok, release, run(), source

### Community 106 - "menuSessionEnd.test.ts"
Cohesion: 0.50
Nodes (3): deletion, signOut, source

### Community 110 - "verify-coverage-floors.mjs"
Cohesion: 0.40
Nodes (3): floors, measured, regressions

### Community 111 - "verify-no-secrets.mjs"
Cohesion: 0.67
Nodes (3): ALLOWED, PATTERNS, scan()

## Knowledge Gaps
- **680 isolated node(s):** `name`, `slug`, `scheme`, `projectId`, `version` (+675 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **28 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useBinderTheme()` connect `index.ts` to `ThemeProvider.tsx`, `ChatScreen.tsx`, `DiscoveryFilterSheet.tsx`, `InterestPicker.tsx`, `format.ts`, `AppSettingsScreen.tsx`, `Root.tsx`, `PartnerProfileScreen.tsx`, `BinderDial.tsx`, `notifications.ts`, `beta.ts`, `DiscoveryScreen.tsx`, `ProfileScreen.tsx`, `header-art.js`, `DiscoveryPreferences.tsx`, `AuthScreen.tsx`, `BinderErrorBoundary`, `BinderButton`, `motionPolicy.ts`, `ChatScreen`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Why does `entry()` connect `InterestPicker.tsx` to `verify-i18n-coverage.mjs`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `filesUnder()` connect `verify-i18n-coverage.mjs` to `InterestPicker.tsx`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **What connects `name`, `slug`, `scheme` to the rest of the system?**
  _685 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ThemeProvider.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05271629778672032 - nodes in this community are weakly interconnected._
- **Should `ChatScreen.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `ProfileSettingsScreen.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
# Graph Report - Binder  (2026-08-20)

## Corpus Check
- 298 files · ~296,682 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1326 nodes · 2938 edges · 97 communities (77 shown, 20 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.59)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e4edc2dd`
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

## God Nodes (most connected - your core abstractions)
1. `useBinderTheme()` - 109 edges
2. `BinderText()` - 40 edges
3. `scripts` - 38 edges
4. `withDeadline()` - 25 edges
5. `BinderApp()` - 24 edges
6. `DiscoveryScreen()` - 24 edges
7. `MotionPressable()` - 23 edges
8. `useBinderHaptics()` - 22 edges
9. `BinderButton()` - 20 edges
10. `BinderIcon()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `refreshDiscoveryLocation()` --indirect_call--> `position()`  [INFERRED]
  src/lib/discovery.ts → site/header-art.js
- `sourceFiles()` --indirect_call--> `entry()`  [INFERRED]
  scripts/verify-request-deadlines.mjs → src/lib/interestCatalog.ts
- `PhotoPager()` --indirect_call--> `position()`  [INFERRED]
  src/components/PhotoPager.tsx → site/header-art.js
- `labelDe()` --calls--> `translate()`  [EXTRACTED]
  tests/interestPicker.test.ts → src/i18n/index.ts
- `TopInset()` --calls--> `useBinderTheme()`  [EXTRACTED]
  src/Root.tsx → src/theme/ThemeProvider.tsx

## Import Cycles
- None detected.

## Communities (97 total, 20 thin omitted)

### Community 0 - "ThemeProvider.tsx"
Cohesion: 0.06
Nodes (51): auroraSource, DiscoveryLoading(), availableLocales(), dictionaries, Dictionary, hasTranslations(), LocaleMeta, lookup() (+43 more)

### Community 1 - "ChatScreen.tsx"
Cohesion: 0.13
Nodes (22): recordBetaEvent(), createClientMessageId(), fetchMatches(), fetchMessages(), fetchMessagesPage(), markMatchRead(), MatchSummary, Message (+14 more)

### Community 2 - "ProfileSettingsScreen.tsx"
Cohesion: 0.14
Nodes (18): addProfileImage(), GalleryMedia, listMyProfileMedia(), ModerationStatus, parseModerationStatus(), payloadFor(), Phase6Rpc, RegisteredMediaRow (+10 more)

### Community 3 - "DiscoveryFilterSheet.tsx"
Cohesion: 0.14
Nodes (30): AttributeEditor(), Props, AttributeFilterSection(), Props, ProfileAttributeList(), Props, activeFilterCount(), AttributeFilters (+22 more)

### Community 4 - "dependencies"
Cohesion: 0.06
Nodes (32): dependencies, aes-js, expo, expo-audio, expo-build-properties, expo-constants, expo-crypto, expo-file-system (+24 more)

### Community 5 - "scripts"
Cohesion: 0.04
Nodes (48): author, devDependencies, @types/node, @types/react, typescript, license, main, name (+40 more)

### Community 6 - "InterestPicker.tsx"
Cohesion: 0.11
Nodes (30): NETWORK_CALLS, ROOTS, sourceFiles(), violations, InterestPicker(), knownIds, labelOfKnown(), Props (+22 more)

### Community 7 - "format.ts"
Cohesion: 0.16
Nodes (17): CountConsequence(), buildChatTimeline(), dayKey(), localDayKey(), TimelineItem, TimelineMessage, previewTimeLabel(), DayLabel (+9 more)

### Community 8 - "AppSettingsScreen.tsx"
Cohesion: 0.15
Nodes (19): getNotificationPermissionStatus(), openSystemNotificationSettings(), bannerOffersEnable(), bannerStateAfterRegistration(), initialBannerState(), PushBannerState, pushBlockedOnThisDevice(), PushPermissionStatus (+11 more)

### Community 9 - "admin.js"
Cohesion: 0.23
Nodes (31): actionButton(), allowedTabs(), attachProtectedImage(), authorizeSession(), bindEvents(), configurePermissions(), empty(), evidenceBlock() (+23 more)

### Community 10 - "index.ts"
Cohesion: 0.06
Nodes (70): CrashFallback(), Props, State, MatchCelebration(), Portrait(), Props, BinderBrand(), binderIcon (+62 more)

### Community 11 - "expo"
Cohesion: 0.07
Nodes (29): backgroundColor, foregroundImage, monochromeImage, adaptiveIcon, allowBackup, blockedPermissions, googleServicesFile, icon (+21 more)

### Community 12 - "ui-crawl.py"
Cohesion: 0.15
Nodes (24): Path, adb(), adb_raw(), audit(), crawl(), devices(), dump(), dump_settled() (+16 more)

### Community 13 - "Root.tsx"
Cohesion: 0.11
Nodes (21): sessionIdentityChanged(), loadNotificationPreferences(), NotificationRoute, observeForegroundNotifications(), observeNotificationResponses(), parseNotificationRoute(), PushRegistrationResult, setNotificationForegroundContext() (+13 more)

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
Cohesion: 0.16
Nodes (19): behaviorName(), categories, disablePushNotifications(), enablePushNotifications(), ensureAndroidNotificationChannels(), foregroundContext, getProjectId(), installationId() (+11 more)

### Community 20 - "useBinderTheme"
Cohesion: 0.19
Nodes (16): attempts, DraftAttempt, forgetChat(), recallAttempts(), recallDraft(), rememberAttempts(), rememberDraft(), texts (+8 more)

### Community 21 - "reliability.ts"
Cohesion: 0.15
Nodes (27): Props, VoiceIntroEditor(), blockUser(), signedVoiceUrl(), uploadVoiceRecording(), abortable(), backoffDelay(), cancellableDelay() (+19 more)

### Community 22 - "release-build.mjs"
Cohesion: 0.12
Nodes (14): apkPath, appJson, appJsonPath, currentCode, currentVersion, flags, gradlePath, keepVersion (+6 more)

### Community 23 - "beta.ts"
Cohesion: 0.18
Nodes (12): BetaEventName, BetaFeedbackCategory, BetaOutcome, BetaSettings, BetaSurface, BINDER_APP_VERSION, getBetaSettings(), initializeBetaDiagnostics() (+4 more)

### Community 24 - "DiscoveryScreen.tsx"
Cohesion: 0.05
Nodes (61): DiscoveryFilterSheet(), GroupErrors, LoadedProfile, Props, ageSteps, discoveryDefaults, DiscoveryPreferences(), DiscoveryPreferenceValues (+53 more)

### Community 25 - "store-assets.py"
Cohesion: 0.32
Nodes (13): device_shot(), feature_graphic(), font(), frame(), ground(), icon(), main(), paste_with_shadow() (+5 more)

### Community 26 - "build-site-languages.mjs"
Cohesion: 0.25
Nodes (6): codes, dictionaries, languages, problems, siteLocales, sourceKeys

### Community 27 - "ProfileScreen.tsx"
Cohesion: 0.09
Nodes (25): discoveryVisibility, MediaState, formatDate(), CompletenessItem, profileCompleteness(), ProfileCompletenessInput, ReliabilityError, acceptCurrentLegalGate() (+17 more)

### Community 28 - "i18n-sync.mjs"
Cohesion: 0.17
Nodes (9): codes, dictionaries, entries, files, imports, problems, report, sourceKeys (+1 more)

### Community 29 - "header-art.js"
Cohesion: 0.22
Nodes (15): clearOnboardingDraft(), loadOnboardingDraft(), OnboardingDraft, sanitize(), saveOnboardingDraft(), hasErrors(), ONBOARDING_STEPS, onboardingPosition() (+7 more)

### Community 30 - "verify-i18n-coverage.mjs"
Cohesion: 0.18
Nodes (8): legalExceptions, perFile, regressions, report, root, scanRoots, total, userFacingProps

### Community 31 - "verify-phase7-push.mjs"
Cohesion: 0.18
Nodes (10): activation, app, chat, eas, failures, migration, notifications, requiredMigrationContracts (+2 more)

### Community 32 - "DiscoveryPreferences.tsx"
Cohesion: 0.35
Nodes (9): Props, VoiceMessageBubble(), Props, VoiceRecorderBar(), formatVoiceDuration(), interruptedTakeAction(), recordingStopDecision(), voiceObjectPath() (+1 more)

### Community 33 - "discoveryDeck.ts"
Cohesion: 0.18
Nodes (11): entries, html, keyFor(), [locale, pagePath, pageId], localePath, META_SKIP, root, slug() (+3 more)

### Community 34 - "googleAuth.ts"
Cohesion: 0.26
Nodes (9): addUnsent(), forgetUnsentMatch(), isMessage(), loadUnsent(), removeUnsent(), saveUnsent(), unsentInOrder(), UnsentMessage (+1 more)

### Community 35 - "stage-demo-profiles.mjs"
Cohesion: 0.20
Nodes (4): headers, key, manifest, [mode, manifestPath]

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
Cohesion: 0.29
Nodes (3): LargeSecureStore, isSupabaseConfigured, Database

### Community 42 - "database.ts"
Cohesion: 0.20
Nodes (9): CompositeTypes, Constants, DatabaseWithoutInternals, DefaultSchema, Enums, Json, Tables, TablesInsert (+1 more)

### Community 43 - "report-bundle-size.mjs"
Cohesion: 0.47
Nodes (7): collectBundleReport(), formatBundleReport(), main(), mb(), mibBytes(), sourceModules(), walk()

### Community 44 - "verify-brand-assets.mjs"
Cohesion: 0.22
Nodes (8): brandComponent, brandReadme, config, failures, generator, notifications, required, splash

### Community 45 - "verify-worklet-contract.mjs"
Cohesion: 0.20
Nodes (5): exportedWorklets, failures, root, scanRoots, workletSafe

### Community 46 - "AuthScreen.tsx"
Cohesion: 0.27
Nodes (10): AuthFieldErrors, AuthMode, hasAuthErrors(), validateAuthForm(), configure(), describeGoogleError(), GoogleSignInOutcome, isGoogleSignInConfigured() (+2 more)

### Community 47 - "verify-design-contract.mjs"
Cohesion: 0.25
Nodes (6): allowlist, failures, root, rules, scanRoots, usedAllowlist

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
Cohesion: 0.57
Nodes (4): LiquidHeart(), Props, heartPath(), liquidPath()

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
Cohesion: 0.44
Nodes (7): ageOn(), assessBirthDate(), BirthDateAssessment, composeBirthDate(), sanitizeDigits(), BirthDateField(), ref

### Community 88 - "images.ts"
Cohesion: 0.48
Nodes (4): IMAGE_POLICY, imageDecodeSize(), pickAndPrepareProfileImage(), PreparedImage

### Community 89 - "supabase"
Cohesion: 0.38
Nodes (6): signedProfileImageUrl(), fetchPartnerProfile(), PartnerProfile, PublicProfileRow, rowsFromProfile(), supabase

### Community 90 - "verify-data-safety.mjs"
Cohesion: 0.33
Nodes (5): doc, IGNORED, PERSONAL_TABLES, problems, types

### Community 91 - "confirmDestructive.ts"
Cohesion: 0.53
Nodes (3): confirmDestructive(), DestructiveConfirmationAction, destructiveConfirmationActions()

## Knowledge Gaps
- **480 isolated node(s):** `name`, `slug`, `scheme`, `projectId`, `version` (+475 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useBinderTheme()` connect `index.ts` to `ThemeProvider.tsx`, `ChatScreen.tsx`, `ProfileSettingsScreen.tsx`, `DiscoveryFilterSheet.tsx`, `InterestPicker.tsx`, `format.ts`, `AppSettingsScreen.tsx`, `Root.tsx`, `PartnerProfileScreen.tsx`, `BinderDial.tsx`, `useBinderTheme`, `reliability.ts`, `beta.ts`, `DiscoveryScreen.tsx`, `ProfileScreen.tsx`, `header-art.js`, `DiscoveryPreferences.tsx`, `AuthScreen.tsx`, `LiquidHeart.tsx`, `birthdate.ts`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Why does `position()` connect `PartnerProfileScreen.tsx` to `DiscoveryScreen.tsx`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `PhotoPager()` connect `PartnerProfileScreen.tsx` to `DiscoveryScreen.tsx`, `ProfileSettingsScreen.tsx`, `index.ts`, `ProfileScreen.tsx`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **What connects `name`, `slug`, `scheme` to the rest of the system?**
  _485 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ThemeProvider.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._
- **Should `ChatScreen.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._
- **Should `ProfileSettingsScreen.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.13852813852813853 - nodes in this community are weakly interconnected._
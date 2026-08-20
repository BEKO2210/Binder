# Graph Report - Binder  (2026-08-19)

## Corpus Check
- 272 files · ~263,922 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1182 nodes · 2640 edges · 87 communities (71 shown, 16 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 16 edges (avg confidence: 0.56)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6ce57ba7`
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

## God Nodes (most connected - your core abstractions)
1. `useBinderTheme()` - 107 edges
2. `BinderText()` - 39 edges
3. `scripts` - 36 edges
4. `BinderApp()` - 24 edges
5. `MotionPressable()` - 23 edges
6. `useBinderHaptics()` - 22 edges
7. `BinderButton()` - 20 edges
8. `BinderIcon()` - 19 edges
9. `AGENTS.md — the working agreement for Binder` - 19 edges
10. `supabase` - 18 edges

## Surprising Connections (you probably didn't know these)
- `TopInset()` --calls--> `useBinderTheme()`  [EXTRACTED]
  src/Root.tsx → src/theme/ThemeProvider.tsx
- `CenteredColumn()` --calls--> `useBinderTheme()`  [EXTRACTED]
  src/Root.tsx → src/theme/ThemeProvider.tsx
- `NavItem()` --calls--> `useBinderTheme()`  [EXTRACTED]
  src/Root.tsx → src/theme/ThemeProvider.tsx
- `RouteFrame()` --calls--> `useBinderTheme()`  [EXTRACTED]
  src/Root.tsx → src/theme/ThemeProvider.tsx
- `PreferenceGroup()` --calls--> `useBinderTheme()`  [EXTRACTED]
  src/components/DiscoveryPreferences.tsx → src/theme/ThemeProvider.tsx

## Import Cycles
- None detected.

## Communities (87 total, 16 thin omitted)

### Community 0 - "ThemeProvider.tsx"
Cohesion: 0.06
Nodes (54): auroraSource, DiscoveryLoading(), availableLocales(), dictionaries, Dictionary, hasTranslations(), LocaleMeta, lookup() (+46 more)

### Community 1 - "ChatScreen.tsx"
Cohesion: 0.06
Nodes (50): BinderErrorBoundary, Props, VoiceIntroEditor(), Props, VoiceMessageBubble(), Props, VoiceRecorderBar(), recordBetaEvent() (+42 more)

### Community 2 - "ProfileSettingsScreen.tsx"
Cohesion: 0.08
Nodes (40): announce(), ageOn(), assessBirthDate(), BirthDateAssessment, composeBirthDate(), sanitizeDigits(), IMAGE_POLICY, imageDecodeSize() (+32 more)

### Community 3 - "DiscoveryFilterSheet.tsx"
Cohesion: 0.09
Nodes (41): AttributeEditor(), Props, AttributeFilterSection(), Props, DiscoveryFilterSheet(), GroupErrors, LoadedProfile, Props (+33 more)

### Community 4 - "dependencies"
Cohesion: 0.05
Nodes (41): author, dependencies, aes-js, expo, expo-audio, expo-constants, expo-crypto, expo-file-system (+33 more)

### Community 5 - "scripts"
Cohesion: 0.06
Nodes (36): scripts, android, brand:assets, bundlecheck, i18n:coverage, i18n:sync, ios, mail:templates (+28 more)

### Community 6 - "InterestPicker.tsx"
Cohesion: 0.13
Nodes (27): InterestPicker(), knownIds, labelOfKnown(), Props, translate(), catalogById, catalogLabelKey(), categoryLabelKey() (+19 more)

### Community 7 - "format.ts"
Cohesion: 0.11
Nodes (24): CountConsequence(), buildChatTimeline(), dayKey(), localDayKey(), TimelineItem, TimelineMessage, composerBody(), ConversationPreview (+16 more)

### Community 8 - "AppSettingsScreen.tsx"
Cohesion: 0.13
Nodes (26): confirmDestructive(), fetchMatches(), DestructiveConfirmationAction, destructiveConfirmationActions(), enablePushNotifications(), getNotificationPermissionStatus(), openSystemNotificationSettings(), refreshPushRegistration() (+18 more)

### Community 9 - "admin.js"
Cohesion: 0.23
Nodes (31): actionButton(), allowedTabs(), attachProtectedImage(), authorizeSession(), bindEvents(), configurePermissions(), empty(), evidenceBlock() (+23 more)

### Community 10 - "index.ts"
Cohesion: 0.14
Nodes (22): BinderButtonVariant, Props, BinderChip(), Props, BinderIcon(), BinderIconButton(), BinderIconName, IconButtonProps (+14 more)

### Community 11 - "expo"
Cohesion: 0.07
Nodes (29): backgroundColor, foregroundImage, monochromeImage, adaptiveIcon, allowBackup, blockedPermissions, googleServicesFile, icon (+21 more)

### Community 12 - "ui-crawl.py"
Cohesion: 0.15
Nodes (24): Path, adb(), adb_raw(), audit(), crawl(), devices(), dump(), dump_settled() (+16 more)

### Community 13 - "Root.tsx"
Cohesion: 0.12
Nodes (19): sessionIdentityChanged(), observeForegroundNotifications(), observeNotificationResponses(), parseNotificationRoute(), getLegalGate(), loadLegalGate(), consumeIntentionalSignOut(), markIntentionalSignOut() (+11 more)

### Community 14 - "AGENTS.md — the working agreement for Binder"
Cohesion: 0.07
Nodes (25): Admin and diagnostics, AGENTS.md — the working agreement for Binder, Devices and evidence, Email verification, its ceiling, and Google sign-in, Gates — all of them, before every push, How work runs, Languages, Lessons that cost real time (+17 more)

### Community 15 - "PartnerProfileScreen.tsx"
Cohesion: 0.17
Nodes (21): PhotoPager(), PhotoProgressSegment(), Props, signedProfileImageUrl(), resolveSpring(), fetchPartnerProfile(), PartnerProfile, PublicProfileRow (+13 more)

### Community 16 - "BinderDial.tsx"
Cohesion: 0.17
Nodes (22): BinderDial(), BinderDialProps, CommonProps, DialTick, nearestIndex(), RangeProps, SingleProps, StepButton() (+14 more)

### Community 17 - "safety.ts"
Cohesion: 0.14
Nodes (17): acceptCurrentLegalGate(), deleteCurrentAccount(), DiscoveryReportReason, fetchMySafetyNotice(), getMyPrimaryMediaState(), LegalGate, MEDIA_STATES, MediaModerationState (+9 more)

### Community 18 - "index.ts"
Cohesion: 0.18
Nodes (17): PUSH_COPY, pushCopy(), PushKind, channelId(), checkReceipts(), ClaimedDelivery, ClaimedReceipt, expoHeaders() (+9 more)

### Community 19 - "notifications.ts"
Cohesion: 0.16
Nodes (17): behaviorName(), categories, disablePushNotifications(), ensureAndroidNotificationChannels(), foregroundContext, getProjectId(), installationId(), loadNotificationPreferences() (+9 more)

### Community 20 - "useBinderTheme"
Cohesion: 0.20
Nodes (13): CrashFallback(), Props, State, BinderBrand(), binderIcon, BinderButton(), BinderCard(), BinderScreenHeader() (+5 more)

### Community 21 - "reliability.ts"
Cohesion: 0.23
Nodes (15): backoffDelay(), cancellableDelay(), classifyError(), deadlineError(), DEFINITIONS, errorText(), isAbortError(), isConversationEndedError() (+7 more)

### Community 22 - "release-build.mjs"
Cohesion: 0.12
Nodes (13): apkPath, appJson, appJsonPath, currentCode, currentVersion, flags, gradlePath, keepVersion (+5 more)

### Community 23 - "beta.ts"
Cohesion: 0.20
Nodes (13): BetaEventName, BetaFeedbackCategory, BetaOutcome, BetaSettings, BetaSurface, BINDER_APP_VERSION, getBetaSettings(), initializeBetaDiagnostics() (+5 more)

### Community 24 - "DiscoveryScreen.tsx"
Cohesion: 0.23
Nodes (11): countDiscoveryCandidates(), DecisionResult, DiscoveryProfile, fetchDiscoveryBatch(), loadDiscoveryPreferences(), recordDecision(), refreshDiscoveryLocation(), classifyEmptyDiscovery() (+3 more)

### Community 25 - "store-assets.py"
Cohesion: 0.32
Nodes (13): device_shot(), feature_graphic(), font(), frame(), ground(), icon(), main(), paste_with_shadow() (+5 more)

### Community 26 - "build-site-languages.mjs"
Cohesion: 0.15
Nodes (10): check, codes, dictionaries, endIndex, home, languages, rows, sourceKeys (+2 more)

### Community 27 - "ProfileScreen.tsx"
Cohesion: 0.24
Nodes (8): discoveryVisibility, MediaState, CompletenessItem, profileCompleteness(), ProfileCompletenessInput, HubRow(), ProfileScreen(), Props

### Community 28 - "i18n-sync.mjs"
Cohesion: 0.17
Nodes (9): codes, dictionaries, entries, files, imports, problems, report, sourceKeys (+1 more)

### Community 29 - "header-art.js"
Cohesion: 0.32
Nodes (11): animate(), curve(), dot(), eventStrength(), makeSignals(), mulberry32(), position(), render() (+3 more)

### Community 30 - "verify-i18n-coverage.mjs"
Cohesion: 0.18
Nodes (8): legalExceptions, perFile, regressions, report, root, scanRoots, total, userFacingProps

### Community 31 - "verify-phase7-push.mjs"
Cohesion: 0.18
Nodes (10): activation, app, chat, eas, failures, migration, notifications, requiredMigrationContracts (+2 more)

### Community 32 - "DiscoveryPreferences.tsx"
Cohesion: 0.24
Nodes (8): ageSteps, discoveryDefaults, DiscoveryPreferenceValues, PreferenceGroup(), Props, DiscoveryPreferencesRow, mapDiscoveryPreferences(), Gender

### Community 33 - "discoveryDeck.ts"
Cohesion: 0.33
Nodes (9): advanceDeck(), decideSwipe(), discoveryDeckPhysics, isUndoWindowOpen(), projectedTranslation(), resistedTranslation(), SwipeDecision, SwipeDirection (+1 more)

### Community 34 - "googleAuth.ts"
Cohesion: 0.31
Nodes (9): configure(), describeGoogleError(), GoogleSignInOutcome, isGoogleSignInConfigured(), signInWithGoogle(), observePushTokenRotation(), LogLevel, redact() (+1 more)

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
Cohesion: 0.29
Nodes (7): MatchCelebration(), Portrait(), Props, CelebrationLayout, CelebrationLayoutInput, resolveMatchCelebrationLayout(), resolveStaggerDelay()

### Community 39 - "BinderText"
Cohesion: 0.29
Nodes (7): BinderText(), BinderTextTone, BinderTextVariant, Props, ChangingNumber(), Props, SectionHeader()

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
Cohesion: 0.22
Nodes (5): exportedWorklets, failures, root, scanRoots, workletSafe

### Community 46 - "AuthScreen.tsx"
Cohesion: 0.42
Nodes (5): AuthFieldErrors, AuthMode, hasAuthErrors(), validateAuthForm(), AuthScreen()

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

## Knowledge Gaps
- **426 isolated node(s):** `name`, `slug`, `scheme`, `projectId`, `version` (+421 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useBinderTheme()` connect `useBinderTheme` to `ThemeProvider.tsx`, `ChatScreen.tsx`, `ProfileSettingsScreen.tsx`, `DiscoveryFilterSheet.tsx`, `InterestPicker.tsx`, `format.ts`, `AppSettingsScreen.tsx`, `index.ts`, `Root.tsx`, `PartnerProfileScreen.tsx`, `BinderDial.tsx`, `safety.ts`, `beta.ts`, `DiscoveryScreen.tsx`, `ProfileScreen.tsx`, `DiscoveryPreferences.tsx`, `discoveryDeck.ts`, `MatchCelebration.tsx`, `BinderText`, `AuthScreen.tsx`, `LiquidHeart.tsx`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Why does `BinderText()` connect `BinderText` to `ThemeProvider.tsx`, `DiscoveryPreferences.tsx`, `ChatScreen.tsx`, `DiscoveryFilterSheet.tsx`, `ProfileSettingsScreen.tsx`, `InterestPicker.tsx`, `MatchCelebration.tsx`, `AppSettingsScreen.tsx`, `index.ts`, `Root.tsx`, `AuthScreen.tsx`, `PartnerProfileScreen.tsx`, `BinderDial.tsx`, `safety.ts`, `useBinderTheme`, `beta.ts`, `DiscoveryScreen.tsx`, `ProfileScreen.tsx`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `name`, `slug`, `scheme` to the rest of the system?**
  _431 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ThemeProvider.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05706760316066725 - nodes in this community are weakly interconnected._
- **Should `ChatScreen.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06490384615384616 - nodes in this community are weakly interconnected._
- **Should `ProfileSettingsScreen.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._
- **Should `DiscoveryFilterSheet.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09098039215686274 - nodes in this community are weakly interconnected._
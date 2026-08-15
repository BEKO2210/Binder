# Phase 6 Strata run — Product Completion + Visual System

This file is the immutable execution contract for `phase/6-product-completion`.

## Master outcome

Turn Binder from a technically complete beta into a coherent, professional, free consumer dating product without weakening any Phase 1–5 safety, privacy, concurrency, deletion or observability invariant.

The final Phase 6 branch must deliver, together:

- one shared visual system and component language across Auth, Legal Gate, Onboarding, Discovery, Match celebration, Matches, Chat, Profile, Settings, Beta and safety flows;
- a Binder-specific professional brand system suitable for launcher, splash, site and store graphics;
- a real multi-photo profile gallery up to six media items with moderation-safe primary selection, atomic ordering and client-side image optimization before upload;
- proper Profile Settings and App Settings surfaces;
- user-configurable haptics, reduce-motion behavior, notification controls and curated accessible accent themes;
- no Pro/Premium/paywall/paid theme/paid visibility path;
- no raw profile text, message body or precise coordinates introduced into analytics/diagnostics;
- all existing database and concurrency invariants preserved.

## Strata rules

1. The master outcome above does not change during this phase. If scope must change materially, stop and open a new phase/run instead of editing the definition after failure.
2. A generation may claim `complete` only after every verifier below exits 0 on the exact same commit.
3. Never weaken, delete or bypass a verifier simply because implementation fails it.
4. Existing Phase 1–5 tests are regression contracts, not obstacles.
5. `main` is never used as the development worktree/branch.
6. Production Supabase is not changed until the exact final Phase 6 migration set passes fresh local replay and all tests on the final head.
7. Any new dependency requires an explicit reason and must remain inside existing bundle/audit budgets or update the budget only with measured evidence.
8. Destructive/safety semantic colors may not be themeable.

## Frozen verifier families

These families are required throughout Phase 6. Individual checks may become stricter; they may not be removed.

### App / build

```bash
npm run typecheck
npm run bundlecheck
node scripts/verify-entrypoint.mjs
node scripts/verify-safety-contract.mjs
node scripts/verify-beta-contract.mjs
node scripts/verify-phase6-design.mjs
node scripts/verify-phase6-settings.mjs
node scripts/verify-phase6-media.mjs
```

### Database / security

```bash
supabase test db
bash supabase/tests/phase2_concurrency.sh
bash supabase/tests/phase3_concurrency.sh
bash supabase/tests/phase3_rate_concurrency.sh
bash supabase/tests/phase4_delete_account_integration.sh
bash supabase/tests/phase6_media_concurrency.sh
supabase db lint --schema public,private --level error --fail-on error
```

### Visual-system static invariants

- production screens/components do not define raw hex colors outside centralized theme/brand files;
- no raw emoji/Unicode glyph is used as a production control icon;
- shared button/card/input/state primitives exist and are used by migrated screens;
- interactive icon controls have explicit accessibility labels and a minimum 48 dp hit target;
- warning/destructive tokens remain fixed across all accent themes;
- Settings exposes haptics, motion, appearance/accent, notification categories and diagnostics controls;
- gallery supports at most six positions and the client never uploads an unoptimized original first.

### Human visual proof required before merge

Static/build checks are not sufficient. Before Phase 6 is marked merge-ready, capture/review the key screens from `docs/DESIGN-SYSTEM.md` at small, 412 px and large Android widths, plus enlarged text where layout risk exists.

## Generation plan

- Generation 1 — foundations: tokens, shared components, icon strategy, settings persistence/provider, design verifiers.
- Generation 2 — brand shell/navigation/loading/auth/legal/onboarding consistency.
- Generation 3 — profile media DB contract + six-photo gallery + image pipeline + concurrency tests.
- Generation 4 — Profile Settings + App Settings + haptics/motion/accent/notification preference model.
- Generation 5 — Discovery/Matches/Chat/safety visual migration and state polish.
- Generation 6 — launcher/splash/brand assets, adaptive/themed icon, public-site visual alignment.
- Generation 7 — full regression, performance/bundle measurement and visual QA fixes.

A generation may be split further if a verifier exposes an independent failure domain.

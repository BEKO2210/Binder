# Phase 7 Strata run — Push + Communication Reliability

This file is the immutable execution contract for `phase/7-push-communication-reliability`.

## Frozen base

- Source of truth: `main@5b2e42551b754263762984760959114c896f094f`.
- Phase 6 freeze: `phase-6-frozen@5b2e42551b754263762984760959114c896f094f`.
- Phase 7 never writes directly to `main` and is not merged without explicit owner approval.
- Binder remains one free product. No Pro, Premium, Boost, paid notification, paid read receipt or other monetized path is in scope.

## Master outcome

Finish Binder's communication loop with privacy-safe remote push and durable chat behavior. The exact final branch head must prove:

- a real EAS project identity and Android FCM v1 credentials are connected to a development/release build;
- server-owned match, message, moderation and safety events create idempotent logical push jobs;
- notification preferences and quiet hours are enforced immediately before delivery, not only in the client;
- device-token rotation and account transfer cannot notify a previous account;
- delivery uses bounded retry/backoff, Expo push tickets and receipts, automatic invalid-token disablement and a durable dead-letter state;
- notification payloads never contain message text, profile text, email, precise location or moderation evidence;
- notification taps deep-link only to validated Binder Matches/Chat surfaces;
- Android channels deliberately encode sound/vibration behavior and lock-screen privacy;
- chat reconnect, pagination and send retry remain durable and duplicate-free;
- a two-account/two-physical-device matrix records push ticket, receipt and on-device results.

## Non-negotiable delivery rules

1. Database commits create logical events. Clients never claim that a push-worthy event happened.
2. One logical event produces at most one delivery row per recipient/device token.
3. Every send rechecks account state, active match membership, block/unmatch state, token ownership, category preference and quiet hours.
4. Message bodies are not copied into push tables, Edge Function logs or remote push payloads.
5. Retries reuse the existing delivery row. They never create a second logical delivery record.
6. `DeviceNotRegistered` disables the token immediately. Permanent credential/payload failures dead-letter; transient failures back off with a fixed maximum attempt count.
7. Safety/destructive state remains server-authoritative. A late queued push is suppressed after block, unmatch, suspension or account deletion.
8. Production Supabase changes occur only after fresh local migration replay, pgTAP, concurrency, Edge Function typecheck and app gates pass on the exact candidate head.
9. FCM/APNs credentials, Expo access tokens and dispatcher secrets are never committed.
10. Verifiers may become stricter; they may not be removed, bypassed or weakened to obtain green status.

## Frozen verifier families

### App and static contracts

```bash
node scripts/verify-entrypoint.mjs
node scripts/verify-safety-contract.mjs
node scripts/verify-phase5-contract.mjs
node scripts/verify-phase6-design.mjs
node scripts/verify-phase6-settings.mjs
node scripts/verify-phase6-media.mjs
node scripts/verify-phase7-push.mjs
node scripts/verify-brand-assets.mjs
tsc --noEmit
expo prebuild --platform android --no-install --clean
expo export --platform android --output-dir dist
node scripts/report-bundle-size.mjs
```

### Database and worker

```bash
supabase test db
bash supabase/tests/phase2_concurrency.sh
bash supabase/tests/phase3_concurrency.sh
bash supabase/tests/phase3_rate_concurrency.sh
bash supabase/tests/phase6_media_concurrency.sh
bash supabase/tests/phase7_push_concurrency.sh
supabase db lint --schema public,private --level error --fail-on error
deno check --config supabase/functions/dispatch-push/deno.json supabase/functions/dispatch-push/index.ts
```

### Real-device proof

Static tests cannot claim remote delivery. `docs/PHASE7-DEVICE-MATRIX.md` must contain completed evidence for two physical Android devices and two Binder accounts, including:

- EAS project ID and build profile, without secrets;
- FCM v1 credential presence confirmed in EAS;
- Expo push token registration and token-rotation result;
- new-match and new-message delivery while backgrounded and killed;
- generic lock-screen copy with no UGC;
- tap to Matches and tap to the correct Chat;
- quiet-hours deferral;
- each category toggle;
- vibration on/off channel behavior;
- foreground behavior;
- block/unmatch after enqueue and before send;
- reinstall/account-transfer token ownership;
- transient retry, successful receipt and a forced dead-letter case.

Until every row is recorded, Phase 7 may be code-complete but must not be described as real-device complete or frozen.

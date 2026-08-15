# Phase 7 production activation

Phase 7 code and production activation are separate gates. Never commit credentials, tokens or dispatcher secrets.

## Prerequisites

- exact candidate commit has green app CI, database replay, pgTAP, concurrency and schema-lint gates;
- Expo account access for the Binder project;
- Binder EAS project linked so `app.json` contains the real `extra.eas.projectId`;
- Android FCM v1 service-account credential registered in EAS;
- Supabase project `sbohsxtzitqhyswznhec` is healthy and still has the expected Phase 6 migration head;
- two physical Android devices and two Binder test accounts are available.

## Activation order

1. Run `eas init` while signed into the owning Expo account and review the generated project ID.
2. Confirm the FCM v1 credential with `eas credentials --platform android`; do not copy the JSON into this repository.
3. Build the internal Android APK with `eas build --platform android --profile preview`.
4. Apply the reviewed Phase 7 migration to production.
5. Set Edge Function secrets `BINDER_PUSH_DISPATCH_SECRET` and, when Expo enhanced push security is enabled, `EXPO_ACCESS_TOKEN`.
6. Deploy `dispatch-push` with JWT verification enabled. The function also requires the independent `x-binder-dispatch-secret` header.
7. Create a once-per-minute Supabase Cron invocation using the function URL and a Vault-held dispatch secret. Never place the plaintext secret in SQL source or Cron command text.
8. Verify one manual invocation, then the scheduled invocation, Expo ticket and Expo receipt before creating user events.
9. Execute every row in `docs/PHASE7-DEVICE-MATRIX.md` on the exact candidate commit.

## Rollback / stop conditions

- Pause the Cron job first if sends, receipts, eligibility rechecks or credentials are unhealthy.
- Do not delete outbox or delivery rows; they are the retry/dead-letter audit trail.
- Disable affected device tokens on `DeviceNotRegistered`; the dispatcher does this automatically.
- Do not ship or freeze Phase 7 while any device-matrix row remains pending.

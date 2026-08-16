# Phase 7 real-device evidence

Status: **in progress**. First end-to-end remote deliveries are proven on real hardware against production; remaining rows stay pending until executed.

## Build identity

| Field | Evidence |
|---|---|
| EAS project ID | `167de5e7-e72f-4fcd-bc7c-379513ff2b21` (build + push delivery executed against this project) |
| Android application ID | `de.beko2210.binder` |
| EAS build profile / build ID | `production` / [`f361306c-031d-48b0-8743-235d9ebdbfe4`](https://expo.dev/accounts/beko2210s-team/projects/binder/builds/f361306c-031d-48b0-8743-235d9ebdbfe4) — Android AAB build finished successfully |
| Device-test build (preview APK) | `preview` / [`cddb4a8d-95ea-456f-a158-efa8f5100646`](https://expo.dev/accounts/beko2210s-team/projects/binder/builds/cddb4a8d-95ea-456f-a158-efa8f5100646) — internal-distribution APK installed on both devices |
| FCM v1 service credential present in EAS | confirmed 2026-08-16 — Firebase project `binder-90d33`, client `firebase-adminsdk-fbsvc@binder-90d33.iam.gserviceaccount.com` |
| Exact Git commit | AAB: `a347d64c3ac4c545edccd1d26ffe1ad4770c2262` · preview APK + production activation: `8af966cf` |
| Device A / Android version | Samsung Galaxy S23 Ultra (SM-S918B), Android 16, One UI 8.5, test account A ("Renate") |
| Device B / Android version | Samsung Galaxy Tab S9 Ultra (SM-X910), Android 16, test account B ("Belkis") |

Do not put push tokens, service-account JSON, Expo access tokens or dispatcher secrets in this file.

## Two-account matrix

| Test | Device A / account A | Device B / account B | Server ticket/receipt evidence | Result |
|---|---|---|---|---|
| Register both devices | pending | pending | pending | pending |
| Mutual match push | pending | pending | pending | pending |
| Message push, app backgrounded | received visible notification, generic copy, 2026-08-16 ~02:52 UTC | sent from Device B chat UI | outbox 8 / delivery 6 / ticket `01a0087a-ccfe-7738-837c-d6c6be0cc30a` / delivered_at 2026-08-16 02:52:00 UTC (receipt ok); prior run outbox 7 / delivery 5 / ticket `01a00876-3884-754e-95a7-44e502d0eefb` delivered 02:47:00 UTC | **passed** |
| Message push, app killed | pending | pending | pending | pending |
| Generic lock-screen copy, no UGC | pending | pending | pending | pending |
| Match tap opens Matches | pending | pending | pending | pending |
| Message tap opens exact Chat | pending | pending | pending | pending |
| Foreground duplicate suppression | pending | pending | pending | pending |
| Quiet-hours deferral | pending | pending | pending | pending |
| Match category disabled | pending | pending | pending | pending |
| Message category disabled | pending | pending | pending | pending |
| Safety category behavior | pending | pending | pending | pending |
| Vibration enabled | pending | pending | pending | pending |
| Vibration disabled | pending | pending | pending | pending |
| Block after enqueue / before send | pending | pending | pending | pending |
| Unmatch after enqueue / before send | pending | pending | pending | pending |
| Token rotation | pending | pending | pending | pending |
| Same installation signs into other account | pending | pending | pending | pending |
| Reinstall and stale-token disable | pending | pending | pending | pending |
| Forced transient retry | n/a | n/a | pending | pending |
| Successful Expo receipt | n/a | n/a | deliveries 5 and 6 reached `delivered` via Expo receipt polling (delivered_at 02:47:00 / 02:52:00 UTC, 2026-08-16) | **passed** |
| Forced permanent dead letter | n/a | n/a | deliveries 1–4 dead-lettered with `InvalidCredentials` (FCM key not yet attached), 2026-08-16 02:33–02:35 UTC; no retry storm, outbox finalized `dead` | **passed** |

## Evidence format

For each completed row record the UTC timestamp, anonymized account/device label, outbox ID, delivery ID, attempt count, ticket state, receipt state and observed device behavior. Screenshots must omit tokens and personal content.

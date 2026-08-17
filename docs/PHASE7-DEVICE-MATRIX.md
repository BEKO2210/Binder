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
| Message tap opens exact Chat | code path fixed and pinned by scripts/verify-phase7-push.mjs (run 058); server side confirmed on 2026-08-17: new_message deliveries reached `delivered` via Expo receipts and the notifications are present on the S23. The physical tap is the one step still to be recorded here. | pending | pending | pending |
| Foreground duplicate suppression | pending | pending | pending | pending |
| Quiet-hours deferral | proven against the production rule 2026-08-17 (run 059): inside quiet hours `defer`, safety alert `allow`, after the local end `allow`, 21:30 UTC for a Europe/Berlin recipient `defer` | n/a | n/a | n/a |
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

## Cold start and frame timing per build (S23 Ultra, SM-S918B, Android 16)

Measured with `am start -W` after `force-stop`, five runs, and with
`dumpsys gfxinfo` reset immediately before the interaction. One row per build
that shipped a change worth timing, so a regression has something to be
compared against.

| Build | Cold start (5 runs, ms) | Median | Frames measured | Janky |
| --- | --- | --- | --- | --- |
| v0.5.4 (vc7, first build with Skia) | 303 / 305 / 351 / 370 / 402 | 351 | 678 (loading surface) | 0.00 % |
| v0.5.27 (vc30, thumbnails decode downsampled) | 330 / 363 / 402 / 409 / 600 | 402 | — | — |
| v0.5.30 (vc33, current) | 291 / 322 / 336 / 341 / 367 | 336 | 427 (photo paging) | 1.87 % |

| Interaction | Build | Frames | Janky | Missed vsync | p95 |
| --- | --- | --- | --- | --- | --- |
| Match celebration entrance | v0.5.33 | 116 | 7.76 % | 3 | 27 ms |
| Match celebration entrance | v0.5.34 (photos prefetched, reload deferred) | 86 | 6.98 % | 2 | 24 ms |
| Match celebration entrance | v0.5.35 (starts after the card has left) | 83 | **4.82 %** | 0 | 22 ms |
| Card expands into the full profile | v0.5.36 | 98 | **2.04 %** | 0 | 11 ms |

Baseline before Skia, same device: 318 / 318 / 371 / 408 / 533, median 371 ms.
The current build starts faster than the pre-Skia baseline and stays well under
the 5 % janky-frame budget while paging photos.

## Interaction frame timing

Run `scripts/measure-interaction-frames.sh <device-serial> <interaction-name>
[capture-seconds]`, perform the interaction during the capture window, then
paste its single output row here. A row is evidence only when the named
interaction was actually performed on the stated device.

| Device serial | Interaction | Total frames | Janky frames | Missed Vsync | p50 / p90 / p95 / p99 |
| --- | --- | ---: | ---: | ---: | --- |

# Phase 7 real-device evidence

Status: **not yet executed**. This file is an evidence template, not a claim that remote push passed.

## Build identity

| Field | Evidence |
|---|---|
| EAS project ID | `167de5e7-e72f-4fcd-bc7c-379513ff2b21` (provided; account ownership verification pending) |
| Android application ID | `de.beko2210.binder` |
| EAS build profile / build ID | `production` / [`f361306c-031d-48b0-8743-235d9ebdbfe4`](https://expo.dev/accounts/beko2210s-team/projects/binder/builds/f361306c-031d-48b0-8743-235d9ebdbfe4) — Android AAB build finished successfully |
| FCM v1 service credential present in EAS | pending |
| Exact Git commit | `a347d64c3ac4c545edccd1d26ffe1ad4770c2262` |
| Device A / Android version | pending |
| Device B / Android version | pending |

Do not put push tokens, service-account JSON, Expo access tokens or dispatcher secrets in this file.

## Two-account matrix

| Test | Device A / account A | Device B / account B | Server ticket/receipt evidence | Result |
|---|---|---|---|---|
| Register both devices | pending | pending | pending | pending |
| Mutual match push | pending | pending | pending | pending |
| Message push, app backgrounded | pending | pending | pending | pending |
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
| Successful Expo receipt | n/a | n/a | pending | pending |
| Forced permanent dead letter | n/a | n/a | pending | pending |

## Evidence format

For each completed row record the UTC timestamp, anonymized account/device label, outbox ID, delivery ID, attempt count, ticket state, receipt state and observed device behavior. Screenshots must omit tokens and personal content.

<p align="center">
  <img src=".github/assets/banner.png" alt="Binder — Both choose. Then you talk." width="820">
</p>

<p align="center">
  <a href="https://github.com/BEKO2210/Binder/actions/workflows/ci.yml"><img src="https://github.com/BEKO2210/Binder/actions/workflows/ci.yml/badge.svg" alt="Binder CI"></a>
  <a href="https://github.com/BEKO2210/Binder/actions/workflows/database-tests.yml"><img src="https://github.com/BEKO2210/Binder/actions/workflows/database-tests.yml/badge.svg" alt="Database Tests"></a>
  <img src="https://img.shields.io/badge/price-free%20forever-C7FF4A" alt="Free forever">
  <img src="https://img.shields.io/badge/audience-18%2B-critical" alt="18+">
</p>

**Binder is dating with one rule: both people choose each other before a conversation can begin.** No paywall, no blurred likes, no boosts, no ads, no data brokers — one free product, built like infrastructure.

<p align="center">
  <img src=".github/assets/shot-chat.png" width="260" alt="Chat with grouped bubbles and timestamps">
  <img src=".github/assets/shot-profile.png" width="260" alt="Partner profile with photo pager">
  <img src=".github/assets/shot-matches.png" width="260" alt="Matches with message alerts">
</p>

## Why Binder is different

- **Mutual first.** Messaging exists only after a server-created mutual match. Concurrent likes serialize into exactly one match — never zero, never two.
- **Free, permanently.** No Pro tier, no boost, no artificial limits. That is a frozen product rule, not a launch promise.
- **Safety as database invariants.** Blocks dominate discovery, matching, chat and queued push. Reports snapshot evidence server-side. Every photo passes moderation before anyone sees it. 18+ is enforced at sign-up with a locked birth date.
- **Privacy by architecture.** Exact location and birth date never leave the server — other people only receive a rounded distance and an age. Push notifications never carry message content.

## Product surface

| Area | What ships |
|---|---|
| Discovery | 60 fps gesture deck (Reanimated/UI-thread), velocity-aware release, server-confirmed decisions |
| Match | Full-screen celebration mirroring the brand mark, direct hand-off into the conversation |
| Chat | Inverted timeline pinned to the newest message, grouped bubbles, timestamps, day separators, idempotent send retry |
| Profiles | Six moderated photos, full-photo viewer, partner profile page fed strictly by server-side visibility |
| Push | Expo/FCM v1 pipeline with outbox, per-device deliveries, tickets/receipts, bounded retry, dead-letter state, quiet hours enforced server-side |
| Legal | In-app Impressum & policies, public [policy site](https://beko2210.github.io/Binder/) incl. [child-safety standards](https://beko2210.github.io/Binder/safety-standards.html) |

## Engineering proof

- 150+ pgTAP assertions across identity, matching, conversation, safety, moderation and push — replayed from an empty database on every CI run
- Concurrency stress suites: reciprocal likes, send-vs-unmatch races, sender-wide rate limits, gallery races, dispatcher claims
- Static contracts: entrypoint, safety wiring, design tokens (no raw hex in screens), brand assets, push architecture, public site
- Unit tests (`npm test`) for pure product logic: push banner state, motion policy, birthday assessment, chat timeline shaping

## Stack

Expo SDK 57 / React Native (Android-first) · Supabase (Postgres 17, Auth, Storage, Realtime, Edge Functions) · Expo Push + FCM v1 · EAS Build · GitHub Actions CI with mandatory gates.

## Repository guide

| Doc | Purpose |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Working agreement & current state for AI-assisted development |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | The full map: data model, invariants, push boundary |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Phases and the frozen free-product rule |
| [`docs/UIUX-PROGRAM.md`](docs/UIUX-PROGRAM.md) | Research-backed UI/UX program & defect log |
| [`docs/PLAY-RELEASE.md`](docs/PLAY-RELEASE.md) | Signing & Play Console procedure |
| [`docs/PHASE7-DEVICE-MATRIX.md`](docs/PHASE7-DEVICE-MATRIX.md) | Real-device push evidence |

## Legal

Operator: Belkis Aslani · [Impressum](https://beko2210.github.io/Binder/impressum.html) · [Privacy](https://beko2210.github.io/Binder/privacy.html) · [Terms](https://beko2210.github.io/Binder/terms.html) · [Account deletion](https://beko2210.github.io/Binder/delete-account.html)

Binder is an independent implementation. It uses no third-party dating-app source code, private APIs, trademarks or copied assets. No project license has been selected yet — all rights reserved.

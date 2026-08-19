<p align="center">
  <img src=".github/assets/banner.png" alt="Binder — Both choose. Then you talk." width="820">
</p>

<p align="center">
  <a href="https://github.com/BEKO2210/Binder/actions/workflows/ci.yml"><img src="https://github.com/BEKO2210/Binder/actions/workflows/ci.yml/badge.svg" alt="Binder CI"></a>
  <a href="https://github.com/BEKO2210/Binder/actions/workflows/database-tests.yml"><img src="https://github.com/BEKO2210/Binder/actions/workflows/database-tests.yml/badge.svg" alt="Database Tests"></a>
  <img src="https://img.shields.io/badge/price-free%20forever-C7FF4A" alt="Free forever">
  <img src="https://img.shields.io/badge/audience-18%2B-critical" alt="18+">
  <img src="https://img.shields.io/badge/android-1.0.0-3DDC84" alt="Android 1.0.0">
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
- **Nothing a person did is thrown away.** A decision made without a network is queued and delivered. A message written offline is kept on disk, survives the app being killed, and sends itself when the phone is back.

## Product surface

| Area | What ships |
|---|---|
| Discovery | 60 fps gesture deck (Reanimated/UI thread), velocity-aware release, server-confirmed decisions, ten profile attributes filterable in both directions |
| Match | Full-screen celebration mirroring the brand mark, direct hand-off into the conversation |
| Chat | Inverted timeline pinned to the newest message, grouped bubbles, day separators, idempotent send retry, voice messages up to one minute |
| Profiles | Six moderated photos, full-photo viewer, optional voice intro, partner profile fed strictly by server-side visibility |
| Push | Expo/FCM v1 pipeline with outbox, per-device deliveries, tickets and receipts, bounded retry, dead-letter state, quiet hours enforced server-side |
| Languages | Fifteen bundled languages, 580 keys each, following the device and overridable in the app |
| Legal | In-app Impressum and policies, public [policy site](https://beko2210.github.io/Binder/) incl. [child-safety standards](https://beko2210.github.io/Binder/safety-standards.html) |

## Engineering proof

**Automated, on every push**

- 218 node tests over pure product logic — deck physics, chat timeline shaping, reliability classification, dial geometry, unsent-message queue, design-token contrast in both schemes
- 150+ pgTAP assertions across identity, matching, conversation, safety, moderation and push, replayed from an empty database
- Concurrency suites: reciprocal likes, send-versus-unmatch races, sender-wide rate limits, gallery races, dispatcher claims
- Sixteen static verifiers, each one a rule somebody learned the hard way:

| Verifier | The rule it keeps |
|---|---|
| `verify-design-contract` | No raw colours, sizes, radii or durations in screens and components |
| `verify-worklet-contract` | A worklet may only call worklets — a plain call from the UI thread kills the process |
| `verify-request-deadlines` | No awaited network call in a screen without a ceiling, or a silent socket freezes the surface |
| `verify-i18n` / `verify-i18n-coverage` | The locale registry matches the files, and no English is left in a screen |
| `verify-safety-contract`, `verify-phase5-contract` | Safety wiring and diagnostics boundaries stay where they were put |
| `verify-phase6-*`, `verify-phase7-push` | Design, media, settings and push architecture stay inside their contracts |
| `verify-admin-dashboard` | The dashboard reads diagnostics only through gated RPCs |
| `verify-brand-assets`, `verify-entrypoint`, `verify-site` | The brand, the entry point and the public site are what they claim |
| `build-site-i18n --check`, `build-site-languages --check`, `build-push-copy --check` | Generated pages, the language list and the notification copy cannot drift from their sources |

**On real devices, because a screenshot or it did not happen**

The 1.0 build was walked on a Galaxy S23 Ultra and a Galaxy A15, on a throttled
network, on a dead one, in light and dark, and at 200 % font size:

| Path | Checked |
|---|---|
| Cold start → Discovery | Deck loads, location fix from the last known position |
| Bind and pass | Card leaves, decision confirmed; on a stalled socket it queues and says so |
| Match celebration | Skia and Reanimated under minification, readable in both schemes |
| Chat | Keyboard leaves the header alone, gestures, drafts survive leaving the screen |
| Offline message | Written offline, app force-stopped, network back — delivered by itself |
| Voice | Record, pause when the app leaves the foreground, send, play back |
| Photos | Picker through upload to the gallery, moderation state respected |
| Filters | Sheet scrolls over the dials, applied filters explain an empty deck correctly |
| Accessibility | Screen reader reads only the top layer, 48 dp targets, 200 % type |
| Sign-in | Email and password, Google sheet opens with Google's own mark |

The one path not re-tested under minification is push delivery; it is called out
in [`AGENTS.md`](AGENTS.md) rather than assumed.

## Stack

Expo SDK 57 / React Native 0.86 (Android-first) · Supabase (Postgres 17, Auth, Storage, Realtime, Edge Functions) · Expo Push + FCM v1 · Skia and Reanimated for motion · GitHub Actions with mandatory gates · R8 minification with the mapping file inside the AAB.

## Working on it

```bash
npm install
npm start                     # Expo dev server

npm run typecheck && npm run typecheck:tests && npm test
node scripts/verify-request-deadlines.mjs      # and the other verifiers in AGENTS.md

npm run release -- --bundle   # signed APK + AAB + mapping into ~/Binder-Release
```

Staging a walkthrough on a device — a labelled test account and a deck to swipe,
both removable in one command:

```bash
node scripts/stage-test-account.mjs create
node scripts/stage-demo-profiles.mjs create docs/demo-profiles.json
# ... walk the app ...
node scripts/stage-demo-profiles.mjs remove docs/demo-profiles.json
node scripts/stage-test-account.mjs remove
```

The public site is generated, not written by hand. Copy `site/i18n/en.json`,
translate the values, save it as `site/i18n/<code>.json`, and either run
`npm run site:i18n` or just push the file — a workflow rebuilds the pages,
the hreflang alternates, the language switcher and the sitemap by itself.

## Repository guide

| Doc | Purpose |
|---|---|
| [`AGENTS.md`](AGENTS.md) | The working agreement: rules, gates, release procedure, device evidence, open items |
| `site/i18n/` | The site's copy, one file per language |
| `site/templates/` | The site's markup, with `{{key}}` where copy goes |
| `supabase/migrations/` | Every invariant the product depends on |

## Legal

Operator: Belkis Aslani · [Impressum](https://beko2210.github.io/Binder/impressum.html) · [Privacy](https://beko2210.github.io/Binder/privacy.html) · [Terms](https://beko2210.github.io/Binder/terms.html) · [Account deletion](https://beko2210.github.io/Binder/delete-account.html)

Binder is an independent implementation. It uses no third-party dating-app source code, private APIs, trademarks or copied assets. No project license has been selected yet — all rights reserved.

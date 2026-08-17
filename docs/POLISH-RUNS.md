# Polish runs

The owner's instruction on 2026-08-17: stop shipping large batches, run the app
through many small passes instead — each run improves exactly one thing and
leaves the running system intact.

## The rule for a run

1. **One concern.** A run touches one behaviour. If a second problem shows up
   while working, it becomes a new run, not a bigger commit.
2. **Green before commit.** `npm run typecheck && npm run typecheck:tests && npm test`
   plus every `scripts/verify-*.mjs`. A red gate ends the run: revert, write
   down why, move on.
3. **Evidence.** Anything a user can see is built, installed on the S23 and
   screenshotted. Anything else is proven by a test or a query.
4. **One commit per run**, subject `run NNN: <what changed>`.
5. **Never weaken a gate to pass a run.** Budgets and contracts only move with
   the owner's explicit decision, written down.
6. **The app stays shippable after every run.** No half-migrated states across
   runs; a run that cannot finish is reverted, not left in place.

## Log

| Run | What | Evidence | State |
| --- | --- | --- | --- |
| 001 | Discovery loading surface: aurora shader over the card's own skeleton | Screenshots S23/Tab, 0.00 %/0.16 % janky frames | done |
| 002 | Wave M logic pass: deck removes the decided card, serialized discovery loads, chat subscribe-before-backfill, flick direction, live window geometry, media delete order, settings writes, gallery errors, 23503 classification, version from build | 75 tests green, CI green | done |
| 003 | Diagnostics reach the admin dashboard (4 gated RPCs + Diagnose tab + verifier + pgTAP) | Applied to production, anon refused, non-admin refused with 42501 | done |
| 004 | Two labelled test accounts and the full loop walked on the S23 | docs/TEST-ACCOUNTS.md | done |
| 005 | 48 dp touch targets; the crawler measures density, threshold and clipping correctly | Crawl on S23 both themes: 0 findings | done |
| 006 | Own gallery is a real viewer: opens on the tapped photo, swipes, counts | Screenshot "Photo 3 of 3" after two swipes | done |
| 007 | No pressed rectangle over a photo (hot zones, thumbnails, icon buttons over media) | Partner profile swipe screenshot, no box | done |
| 008 | Worklet contract gate after the photo-swipe crash | Verifier proven against the real regression | done |
| 009 | Chat keeps every unsent message: retry and discard per attempt | typecheck + tests green | done |
| 010 | Busy states that were missing: chat safety actions, push toggle, matches refresh, onboarding finish and photo picker, auth submit guard | typecheck + tests green | done |
| 011 | The filter count is the server's count, with the same rules discovery applies | `count_discovery_candidates` applied to production; wide filters 1, narrow 0 | done |
| 012 | Filter sheet: retry instead of only "Close", and an honest "Count unavailable" | Sheet screenshot on S23 | done |
| 013 | Quiet hours persist a complete time, not every keystroke | typecheck + tests green | done |
| 014 | Reset app settings asks first and reports the outcome | typecheck + tests green | done |
| 015 | A loading button keeps its label and its width | typecheck + tests green | done |
| 016 | Localization foundation: one English file, fallback to English, `npm run i18n:sync`, locale contract gate, 5 tests | German probe file registered itself and rendered on the S23 | done |
| 018 | Auth, matches, partner profile into the locale file; coverage gate added (baseline 276) | typecheck + tests green | done |
| 019 | Discovery, filter sheet, preferences into the locale file | coverage 249 → 212 | done |
| 020 | Chat into the locale file | coverage 212 → 187 | done |
| 021 | Profile and profile settings; two contract verifiers follow the copy | coverage 187 → 138 | done |
| 022 | Onboarding, beta, legal gate; phase 5 verifier follows the copy | coverage 138 → 90 | done |
| 023 | About, app settings, match celebration, shared states | coverage 90 → 45 | done |
| 024 | Shared components and the last stragglers; metric learned to tell prose from code | **coverage 0**, gate added | done |
| 025 | Chat rows memoised: typing no longer re-renders the timeline | Chat screenshot after refactor, no crash | done |
| 026 | Onboarding steps move with direction; instant under reduced motion | typecheck + gates green | done |
| 027 | Auth: return key walks the form and submits on the last field | typecheck + gates green | done |
| 028-031 | Offline, session expiry, upload progress and a match ended while you are in it | Gates green, v0.5.15 on device | done |
| 032 | The first screen without network says "You are offline", not "Safety check failed" | Device with Wi-Fi and data off: title reads "You are offline" | done |
| 033 | Photo pager: the segment fills with the drag instead of jumping on commit | Gates green, device check | done |
| 034 | Bind and pass buttons raise the same stamp the gesture raises; a failed decision returns in one movement | Gates green, device check | done |
| 035 | Pull-to-refresh in the gallery and the conversation | Gallery screenshot after a pull, layout unchanged | done |
| 036 | A long press on a message opens the same actions as a tap, with one haptic | Device: long press shows Copy / Report / Cancel | done |
| 037 | One shape for every destructive confirmation, decided in one place | Policy test; safety contract now asserts it at that place | done |
| 038 | State changes that were only visible are announced to a screen reader | Gates green | done |
| 039 | Tab labels stop growing before they push the bar over the content; icon boxes are fixed | 200 % font on the S23: labels fit, row height stable | done |
| 040 | Icon glyphs are clipped at a 200 % system font | Root cause found in expo-symbols' SymbolView: the Android glyph is a <Text> without allowFontScaling={false}. BinderIcon draws the same font and codepoint itself with scaling off. Verified at 100 % and 200 % on the S23 | done |
| 041 | TalkBack wiring pass: roles, states, values, live regions, decorative nodes hidden, composed rows grouped | Tree dump on device: zero clickable nodes without a label | done |
| 042 | Thumbnails decode at their display size (matches avatar, gallery tiles, celebration photos) | Cold start median 402 ms, memory measured after | done |
| 043 | Contrast of the states the token test never covered: pressed, disabled, and text over media | Test extended; light textMuted darkened to pass; media text now drawn from the dark palette in both schemes | done |
| 044 | A repeatable memory probe for paging a gallery | `scripts/measure-gallery-memory.sh` | done |
| 045 | Dates, times, day labels, distances and counts formatted by locale through one pure module | 89 tests including en/de edge cases; chat times unchanged on device | done |
| 017 | Language section in App settings — appears only when a translation exists, endonym plus flag, same chip rhythm as Appearance | Screenshot: Sprache / Wie mein Gerät / 🇬🇧 English / 🇩🇪 Deutsch | done |

## Backlog

Ordered by what a user notices first. Each line becomes one run.

### Interaction and feel
- [x] Chat timeline rows memoised.
- [x] Onboarding steps change with a short directional transition.
- [x] Auth: explicit focus order, return key moves through the form.
- [x] Deck: the card returns with one settle when a decision fails.
- [x] Deck: bind/pass buttons show the same threshold feedback the gesture gives.
- [x] Photo pager: the segment indicator follows the drag.
- [ ] Match celebration: entrance timing and the two-photo composition on a 412 dp screen.
- [x] Pull-to-refresh everywhere a list can be stale (matches, chat, gallery).
- [x] Long-press on a message shows the actions sheet.
- [x] Every destructive action has one confirmation shape.

### States nobody has seen yet
- [x] Offline: every screen and the pre-app safety check.
- [x] Session expiry as a state (wave G).
- [x] Photo upload: progress, failure and retry on the profile gallery.
- [ ] Moderation outcomes visible to the user: rejected photo, warned account.
- [ ] Empty deck vs. filtered-to-nothing deck read differently and offer the right control.
- [x] Chat: the other side unmatched while the screen is open.
- [ ] First run on a fresh install: what the deck shows before location permission.

### Accessibility
- [x] TalkBack pass over every screen: labels, states, values, live regions, decorative nodes hidden.
- [x] Large font settings (200 %): text wraps, chrome keeps its height, labels are capped.
- [x] Icon glyphs at 200 %: fixed by drawing the glyph ourselves with font scaling off (run 040).
- [x] Contrast of pressed, disabled and over-media states.
- [x] Announcements for state changes that only show visually (sent, failed, applied).

### Performance
- [ ] Frame timing for the match celebration and the profile expansion (wave C leaves them open).
- [x] Image decode sizes: fixed-size thumbnails decode downsampled (resizeMethod="resize").
- [ ] Cold start after the Skia addition, tracked per build rather than once.
- [x] Memory while paging a gallery: `scripts/measure-gallery-memory.sh`.

### Correctness left from the review
- [ ] Onboarding must not re-upload the same photo after a failed finalisation.
- [ ] Discovery: the deck and the filter sheet share one source of truth for preferences.
- [ ] Push: tapping a notification lands on the exact conversation from a cold start.
- [ ] Quiet hours are honoured server-side, verified end to end.

### German locale (wave J)
- [x] The mechanism: one English file, automatic registration, fallback, picker (`docs/LOCALIZATION.md`).
- [x] Every screen and shared component reads from the locale file; the coverage gate holds it at zero.
- [x] Dates, times and distances formatted by locale (`src/lib/format.ts`).
- [ ] German copy for the store listing and the in-app legal surfaces.

### Store readiness (wave K)
- [ ] Screenshots regenerated from the current build for every listed surface.
- [ ] Data-safety answers derived from the code.
- [ ] The demo clip matches what the app looks like today.

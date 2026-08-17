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
| 046 | Play Data-safety answers derived from the code, with the file that proves each line | `docs/DATA-SAFETY.md` | done |
| 047 | Screenshot set captured from the shipping build (discovery, filters, matches, chat, profile) | `/home/belkis/Binder-Release/screenshots-v0.5.29/` | done |
| 048 | Onboarding asks the server before uploading, so a failed finalisation cannot duplicate the photo | 90 tests; server state is the truth, no new local cache | done |
| 049 | Discovery preferences are read once and flow from one place into header and sheet | Preset applied on device, header and sheet agree | done |
| 050 | Cold start and frame timing tracked per build in the device matrix | v0.5.30: median 336 ms, 1.87 % janky while paging | done |
| 051-053 | Empty deck tells filtered-empty from genuinely empty; location permission is a calm state; a rejected photo says why and offers a replacement | Device shows "Filters are narrowing your deck" | done |
| 054 | A warned or suspended account can see it: `get_my_safety_notice()` plus a plain card in the profile | RPC applied to production and probed; 94 tests | done |
| 055 | Match celebration: measured symmetry (34/34 dp outer, ±92 dp from the axis), one staggered entrance, photos shrink before text on short screens | Device screenshot; unit test pins the geometry | done |
| 056 | `scripts/measure-interaction-frames.sh` turns any interaction into a matrix row | Used immediately for the celebration | done |
| 057 | Celebration entrance brought under budget: 7.76 % → 4.82 % janky, 3 → 0 missed vsync | Three measured builds in the device matrix | done |
| 058 | Cold-start push route: the listener is registered before the launch snapshot is read, routes wait for session, legal gate and onboarding, and a chat route is checked against the server's match list before it navigates | Verifier now pins the listener order; on device: delivery receipts `delivered`, notifications present | done |
| 059 | Quiet hours proven server-side | Four decisions read straight from the production rule: inside quiet hours `defer`, safety alert `allow`, after the local end `allow`, 21:30 UTC in a Europe/Berlin recipient `defer` | done |
| 060 | Frame timing for the card-to-profile expansion | 98 frames, 2.04 % janky, 0 missed vsync, p95 11 ms | done |
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
- [x] Match celebration: composition and entrance (run 055).
- [x] Pull-to-refresh everywhere a list can be stale (matches, chat, gallery).
- [x] Long-press on a message shows the actions sheet.
- [x] Every destructive action has one confirmation shape.

### States nobody has seen yet
- [x] Offline: every screen and the pre-app safety check.
- [x] Session expiry as a state (wave G).
- [x] Photo upload: progress, failure and retry on the profile gallery.
- [x] Moderation outcomes visible to the user: rejected photo and warned or suspended account.
- [x] Empty deck vs. filtered-to-nothing deck read differently.
- [x] Chat: the other side unmatched while the screen is open.
- [x] First run without location permission is a calm state with one action.

### Accessibility
- [x] TalkBack pass over every screen: labels, states, values, live regions, decorative nodes hidden.
- [x] Large font settings (200 %): text wraps, chrome keeps its height, labels are capped.
- [x] Icon glyphs at 200 %: fixed by drawing the glyph ourselves with font scaling off (run 040).
- [x] Contrast of pressed, disabled and over-media states.
- [x] Announcements for state changes that only show visually (sent, failed, applied).

### Performance
- [x] Frame timing for the match celebration (4.82 %, run 057).
- [x] Frame timing for the profile expansion: 2.04 % janky (run 060).
- [x] Image decode sizes: fixed-size thumbnails decode downsampled (resizeMethod="resize").
- [x] Cold start tracked per build (`docs/PHASE7-DEVICE-MATRIX.md`, run 050).
- [x] Memory while paging a gallery: `scripts/measure-gallery-memory.sh`.

### Correctness left from the review
- [x] Onboarding must not re-upload the same photo after a failed finalisation.
- [x] Discovery: the deck and the filter sheet share one source of truth for preferences.
- [x] Push route from a cold start: code path fixed and pinned by the verifier (run 058). The last mile — physically tapping the notification — could not be automated through the shade in this session; it needs one manual tap to be recorded in the device matrix.
- [x] Quiet hours honoured server-side, proven against the production rule (run 059).

### German locale (wave J)
- [x] The mechanism: one English file, automatic registration, fallback, picker (`docs/LOCALIZATION.md`).
- [x] Every screen and shared component reads from the locale file; the coverage gate holds it at zero.
- [x] Dates, times and distances formatted by locale (`src/lib/format.ts`).
- [ ] German copy for the store listing and the in-app legal surfaces.

### Store readiness (wave K)
- [x] Screenshots captured from the current build (`Binder-Release/screenshots-v0.5.29/`).
- [ ] Store-ready content for those screenshots: the deck currently shows a labelled test account, which is right for testing and wrong for a listing. Decide with the owner whether the listing uses staged profiles.
- [x] Data-safety answers derived from the code (`docs/DATA-SAFETY.md`).
- [ ] The demo clip matches what the app looks like today.

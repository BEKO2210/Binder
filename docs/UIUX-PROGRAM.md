# Binder UI/UX Program — research-backed overhaul

Goal: Binder's UI/UX must beat the leading swipe-dating apps on feel, clarity and
trust — measured against them, never naming them inside the product. The work
runs like a company project: research first, then strictly one phase at a time,
every phase tested (unit + on-device screenshots), every finished phase pushed
to `main`. Backend/system changes only where a real defect requires them.

## Research findings (2026-08-16)

Sources: Purrweb dating-app UX guide, Appthetics Hinge pattern analysis,
SkaDate 2026 UI/UX guide, Vinova "Engineering Tinder-style swipe interfaces in
React Native" (2025), Margelo keyboard deep-dive, react-native-keyboard-controller
docs, react-native-community edge-to-edge discussion #827, Smart Interface
Design Patterns "Designing a better birthday input", Superfiles motion rules,
CreateBytes micro-interaction guide.

1. **The swipe loop is a dopamine loop.** Card stack, Like/Pass animation,
   match celebration and first-message prompt must feel effortless; every
   micro-interaction is a reward signal, not decoration.
2. **Modern standard for gesture UIs in React Native** is
   `react-native-gesture-handler` + `react-native-reanimated` (60 fps on the UI
   thread). Card stacks: absolutely positioned cards, only the top card
   interactive, the card underneath scales from ~0.95 to 1 as the top card
   leaves; release decision by swipe distance **and** velocity.
3. **Keyboard handling under Android 15+/edge-to-edge is broken by design** for
   plain `KeyboardAvoidingView`: with enforced edge-to-edge the window no longer
   resizes and padding-behavior fights the insets (matches the observed bug:
   content slides back down while typing). The reliable fix is
   `react-native-keyboard-controller`'s drop-in `KeyboardAvoidingView` (or IME
   insets from `react-native-safe-area-context` 5.x).
4. **Birthday input: no wheels.** Research is unanimous that scroll wheels and
   calendar pickers are hostile for dates ~20–60 years in the past. The
   error-proof pattern is separate labeled numeric fields (DD·MM·YYYY) with
   auto-advance. Binder adds delight without friction: large numerals, animated
   focus ring, a live "you are 27" chip that springs in once the date is valid.
5. **Motion rules for a premium feel:** 200–400 ms for feedback, 600–800 ms max
   for context changes; never linear — ease-out on entry, ease-in on exit;
   springs with damping ~20–30 for professional feel (8–12 only for deliberate
   bounce moments like the match celebration); haptics coordinated with the
   animation peak; layered touch+haptic+motion beats any color choice.
6. **Profile depth beats single-photo judging** (Hinge lesson): hero photo for
   recognition, identity strip (name/age/distance), content the eye can walk
   through. Full-screen photo viewing with pinch/tap, never awkward crops.
   Reacting to a *specific* photo lowers messaging anxiety.
7. **Ergonomics:** primary actions in the bottom thumb zone, 48 dp minimum
   targets, generous spacing on small phones; respect Reduce Motion everywhere.

## Standing product rules

- No competitor names anywhere in product copy.
- Free product; no monetization surfaces.
- Design tokens only (no raw hex in screens — CI enforces it); warning and
  destructive colors never restyled.
- Every phase: `npm run typecheck`, all `verify:*` gates, plus on-device
  screenshots of every touched state before it counts as done.
- Legal identity in-app: provider Belkis Aslani, Vogelsangstraße 32,
  71691 Freiberg am Neckar, Germany — Impressum surface, no gender mentioned.

## Execution phases (strictly one at a time)

| Phase | Scope | Definition of done |
|---|---|---|
| **P0 — Defects** | Keyboard slides back while typing (adopt `react-native-keyboard-controller`); Matches "Enable" alerts button does nothing; photo crop hides content (open full image). | Bugs reproduced, fixed, regression-tested on both devices; pushed. |
| **P1 — Motion & interaction foundation** | Motion token set (durations/easings/springs per research), pressed/press-in scale states, haptic map, Reduce-Motion plumbing verified. | Motion tokens in `src/theme`, used by buttons/cards; contrast+motion docs updated; device proof. |
| **P2 — Discovery deck** | Real gesture card stack (gesture-handler + reanimated): drag with rotation, LIKE/PASS stamps fading in by distance, velocity-aware release, under-card scale-up, celebratory match hand-off. | 60 fps swipe on S23 + Tab S9, decision still server-confirmed before card leaves, empty/error states intact. |
| **P3 — Match celebration** | Full-screen match moment: both photos, spring entrance (bouncy damping), haptic peak, primary CTA "Say something real", secondary "Keep discovering". | Triggered from real mutual match on devices; reduced-motion variant. |
| **P4 — Onboarding & auth polish** | Segmented DOB input with live age chip (research pattern), step progress, focused single-question screens, keyboard-safe layouts, error microcopy pass. | New account walk-through on device, every step screenshot-audited. |
| **P5 — Chat** | Bubble grouping + timestamps, send button morph (idle→active→sending), incoming message spring, day separators, jump-to-latest, long-message handling, copy pass. | Two-device conversation audit; no duplicate/ordering regressions (existing tests stay green). |
| **P6 — Profile & settings** | Full-screen photo viewer (pinch/zoom/swipe between photos), gallery reorder polish, settings touch-target/spacing pass, Impressum & legal screen (About Binder), every text production-ready. | Screenshot audit of all settings/profile states; legal data present; texts reviewed. |
| **P7 — Brand & icon** | New icon + adaptive/monochrome variants via Higgsfield, splash refresh, store-ready asset set consistent with in-app brand. | Icon renders correctly on launcher shapes; brand verifier updated deliberately. |
| **P8 — Final audit** | Fresh test account, complete screenshot catalog of every screen/state on both devices, fix list worked to zero. | Catalog archived in repo; zero open findings. |

Each phase ships as its own commit series on `main` with tests run before push.
No phase starts before the previous one is accepted.

## Defect log (feeds P0)

| # | Defect | Status |
|---|---|---|
| D1 | Keyboard: content slides back down while typing (edge-to-edge inset fight) — reproduced on Tab S9 + S23 with build `f5a80063` | open |
| D2 | Matches screen "Message alerts → Enable" button has no visible effect | open |
| D3 | Profile/discovery photos cropped with no way to view the full image | open (also P6 scope) |

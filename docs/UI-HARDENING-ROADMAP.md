# Binder UI hardening roadmap

Goal: take the app from "works and looks decent" to a product that stands next to
Tinder, Bumble, Hinge — and to the interaction quality of Apple, Spotify and
Netflix. Every item is verified on a real Samsung S23 Ultra (412 dp wide) over
adb, not just in code review.

Status legend: `[ ]` open · `[~]` in progress · `[x]` done and verified on device.

## Phase 0 — Stop the bleeding

- [x] Discovery filter dial: fix the drag that dropped the grabbed handle onto
      the minimum (three gesture detectors shared one accumulator). One pan owns
      the ring, decides on touch-down what it grabbed, keeps the grab offset.
      Regression tests in `tests/dialScale.test.ts`.
- [x] `expo-linear-gradient` was pinned to 15.0.8 against Expo SDK 57, which
      crashed the app on launch (`NoClassDefFoundError: LazyKType`). Now ~57.0.1.
- [ ] Full launch smoke test on device after every build: cold start, auth,
      discovery, matches, chat, profile, settings — no crash, no red screen.

## Phase 1 — Foundations

- [ ] Token audit: every screen uses the type scale, spacing scale, radii and
      motion tokens. No literal font sizes, paddings, radii or durations left in
      screens.
- [ ] Contrast audit: measure every text/background pair actually rendered.
      Body text ≥ 4.5:1, large text ≥ 3:1, disabled states still legible.
- [ ] Touch target audit: every interactive element ≥ 44 dp with ≥ 8 dp gaps,
      including icon buttons in headers and the chat composer.
- [ ] Safe areas: no content under the status bar, the gesture bar or the
      keyboard on any screen, in both orientations of the fold.
- [ ] One shared feedback language: press states, focus states, disabled states
      and loading states defined once and used everywhere.

### Phase 1 foundation sweep — 2026-08-17

The code audit is complete; the checklist remains open until the required
S23 Ultra device pass records both orientations. Ratios use WCAG 2.x relative
luminance and include the least-favourable surface for each semantic text token.

| Pair (worst rendered surface) | Dark | Light | Requirement |
| --- | ---: | ---: | ---: |
| Primary / elevated | 16.11:1 | 15.64:1 | 4.5:1 |
| Secondary / elevated | 8.92:1 | 8.59:1 | 4.5:1 |
| Muted / elevated | 5.08:1 | 4.54:1 | 4.5:1 |
| Disabled primary / elevated at 60% | 6.52:1 | 4.58:1 | 4.5:1 |

Audit decisions:

- `BinderScreenHeader` owns navigation-header height, horizontal padding,
  leading/trailing control slots and title alignment. Hero/editorial headings
  remain `SectionHeader`; they are content, not navigation chrome.
- `layout` tokens own stable control and media geometry; `spacing`, `radii`,
  `typography`, and `motion` continue to own their respective scales.
- Pressed surfaces, disabled opacity, focus borders, and loading indicators are
  resolved by shared primitives. `DiscoveryLoading` remains the full loading
  composition; compact states consistently use the shared accent spinner.
- Root insets protect both system bars. Editable scroll screens use the existing
  keyboard-controller-aware scroller. Full-screen viewers and bottom sheets sit
  inside the same inset choke point.
- The discovery deck, chat, matches, authentication, and dial implementations
  were otherwise left intact because they were freshly rebuilt; only shared
  foundation behaviour applies to them.

## Phase 2 — Screen by screen

- [ ] **Discovery** — the card is the product. Photo treatment, scrim, name/age
      hierarchy, distance and interests, and full-card swipe gestures with
      spring physics and haptics (bind right, pass left) on top of the existing
      buttons. Undo affordance. Card stack depth so the next person is hinted.
      Reported from the device: the bind (heart) button is not on the screen's
      centre axis — the pass/bind pair has to be measured, not eyeballed.
- [ ] **Discovery loading** — already replaced with the two-signal composition;
      hold it to 60 fps and reuse its language for every other loading state.
- [ ] **Matches** — avatar, name, last message, time, unread weight. Empty state
      that teaches instead of apologising.
- [ ] **Chat** — bubble grouping, day separators, delivery state, keyboard
      handling without layout jumps, long-press actions, scroll-to-latest.
- [ ] **Profile & settings** — grouped sections, one control language, dial
      reused for preferences, destructive actions clearly separated.
- [ ] **Onboarding & auth** — first run is the first impression: progress that
      is honest, inputs that explain themselves, errors next to the field.
      Reported from the device:
      - the keyboard covers the password field on sign-in — the form has to lift
        and stay visible (`react-native-keyboard-controller` is already a
        dependency and is the right tool);
      - sign-in needs a reveal toggle (the eye) on the password field, with a
        proper accessibility label and state;
      - registration needs a second password field and must refuse mismatches
        at the field, not after submitting.
- [ ] Consistent empty / error / offline / permission states on every screen.

## Phase 3 — Motion

- [ ] Screen transitions with spatial continuity (where did this come from?).
- [ ] Press feedback on every pressable, 150–260 ms, from the motion tokens.
- [ ] Match celebration: keep the moment, cut the noise.
- [ ] Reduced motion parity: every animation has a meaningful static state.

## Phase 4 — Gates before release

- [ ] TalkBack pass: every control reachable, labelled and adjustable.
- [ ] Frame timing on device (`adb shell dumpsys gfxinfo`): no jank spikes in
      discovery, chat scroll or the dial.
- [ ] `npm run typecheck`, `npm run typecheck:tests`, `npm test`, and every
      `scripts/verify-*.mjs` green.
- [ ] Fresh release AAB with the version code bumped, signed with the upload key.

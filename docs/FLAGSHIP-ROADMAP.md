# Binder → flagship

The hardening roadmap fixed what was broken. This one is about what makes a
product feel like it came out of a company with a design org: nothing arbitrary,
nothing unmeasured, nothing that only works on the happy path.

Rule for every item: **it is not done until a number or a screenshot from the
device proves it.** No "should be fine".

## A · The deck is the product

- [ ] Photo pager: preload the next photo and the next person's first photo,
      cross-fade between photos, tap zones with visible segment progress, swipe
      down to dismiss the expanded view.
- [ ] Card content hierarchy: name and age as one typographic unit, distance and
      last-active as quiet metadata, interests that truncate gracefully, verified
      and moderation signals where they belong.
- [ ] Gesture feel: velocity-aware commit, off-axis rotation around a pivot below
      the card, resistance near the edges, a rubber-band return that settles in
      one bounce, and haptics that mark the threshold rather than the frame.
- [ ] Expanding the card into the full profile is one continuous motion, not a
      screen swap.
- [ ] The empty deck is a state with a job: what to change (filters, radius,
      photos) and one control that changes it.

## B · A design system that can be audited

- [ ] `docs/DESIGN-SYSTEM.md`: the actual contract — type scale with line-height
      rhythm, spacing scale, elevation and scrim levels, semantic colour roles,
      component anatomy and states. Written from the tokens, not aspirational.
- [ ] Contrast is a **test**, not a promise: a unit test walks every semantic
      foreground/background pair in both schemes and fails under AA.
- [ ] A verify script fails the build on literal colours, font sizes, radii and
      durations inside `src/screens` and `src/components`.
- [ ] Every component documents its states (default, pressed, disabled, loading,
      error, selected) and every state exists in code.

## C · Performance as a budget

- [ ] Cold start measured with `am start -W`, recorded, and kept under budget.
- [ ] Lists virtualised with stable keys, memoised rows, no inline renderers.
- [ ] Images: explicit cache policy, correct sizes, no full-resolution decodes
      for thumbnails, no layout shift on load.
- [ ] Frame timing recorded for deck swipe, chat scroll, dial drag, and the
      match celebration — each under 5 % janky frames.
- [ ] JS bundle size recorded before and after, with the top contributors named.

## D · Reliability

- [ ] One error taxonomy: offline, timeout, server refusal, permission denied,
      conflict — each with its own message and its own recovery.
- [ ] Retry with backoff where retrying can work; nothing retries forever.
- [ ] Optimistic actions roll back visibly and say why.
- [ ] Every network call can be cancelled when the screen goes away; no state
      updates after unmount.
- [ ] Offline is a first-class state that recovers on its own.

## E · Safety, privacy, accessibility

- [ ] No secret, token or personal datum reaches a log line in a release build.
- [ ] Deep links and the auth callback validate what they receive.
- [ ] Session storage: confirm what is stored where and that it survives only as
      long as it should.
- [ ] TalkBack: every control labelled, focus order sane, decorative nodes out of
      the tree, adjustable controls announce their value.
- [ ] Large font settings do not break any layout.

## F · Release engineering

- [ ] CI runs the new gates (contrast, literals, tests, typecheck).
- [ ] A release AAB built from a clean tree with the version code the store
      expects, signed with the upload key, verified before it is offered.
- [ ] Store assets regenerated from the current build — the screenshots in the
      README and on the site must show the app as it is today.

## G · The account is a product surface

- [ ] Password reset: an account with no way back in is a support queue. Request
      a reset from the sign-in screen, handle the emailed link, set a new
      password, sign in — all inside the app, with the same field-level
      validation as sign-up.
- [ ] Email change and re-verification, or an explicit decision that it is out of
      scope, written down rather than silently missing.
- [ ] Session expiry is a state the interface handles, not a wall of errors.

## H · Discovery preferences that people actually use

- [ ] Presets before precision: "nearby", "my city", "wide" set radius and age in
      one tap; the dial stays for people who want the exact number.
- [ ] Live consequence: the sheet says how many people currently pass the
      filters, so nobody applies a filter that empties their deck by surprise.
- [ ] Explain the empty result the moment it is caused, not after applying.

## I · Notifications worth receiving

- [ ] Every category earns its place: match, message, moderation outcome. No
      "engagement" pings.
- [ ] Quiet hours honoured server-side, verified end to end.
- [ ] Tapping a notification lands on the exact conversation, cold start included.
- [ ] The permission ask happens after the first thing worth notifying about,
      never on launch.

## J · Ready for German users

- [ ] Every user-facing string in one place, ready for a second locale, with no
      concatenated sentences that cannot be translated.
- [ ] Dates, times and distances formatted by locale, not by hand.
- [ ] German copy for the store listing and the in-app legal surfaces.

## K · Evidence for the store

- [ ] Screenshots regenerated from the current build, on a real device, for every
      surface the listing shows.
- [ ] The demo clip on the site matches what the app looks like today.
- [ ] Data-safety answers derived from the code, not from memory: what leaves the
      device, where it lands, how long it stays.


## L · The loading surface (approved exception, 2026-08-17)

The only sanctioned new dependency: `@shopify/react-native-skia`.

- [ ] Fragment shader for the discovery loading state: aurora field with real
      glow and grain, driven by reanimated uniforms on the UI thread.
- [ ] A skeleton beneath it in the exact shape of the discovery card, so
      nothing moves when the deck arrives.
- [ ] Reduced motion renders one still frame that still communicates waiting.
- [ ] Costs stated before install, measured after: APK size, JS bundle, cold
      start, and janky frames while the state is on screen.
- [ ] If the measured cost is worse than promised, say so and offer the
      dependency-free fallback rather than quietly shipping it.

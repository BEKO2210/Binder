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

- [x] Fragment shader for the discovery loading state: three aurora curtains
      with white-hot filaments, a cool falloff edge, striation and luminance-
      weighted grain, driven by one reanimated uniform on the UI thread and
      periodic in it, so the loop has no seam.
- [x] A skeleton beneath it in the exact shape of the discovery card — same
      full-bleed media well, same scrim, same bottom block — so nothing moves
      when the deck arrives.
- [x] Reduced motion renders one still frame that still communicates waiting:
      measured at 0 rendered frames over 4 seconds.
- [x] Costs stated before install (commit `0bdcadd`), measured after on the S23
      and the Tab S9: APK +41.57 MiB universal / +10.85 MiB per arm64 device,
      JS +0.56 MiB, cold start −20 ms / +23 ms, 0.00 % / 0.16 % janky frames
      while the state is on screen. Full record: `docs/WAVE-L-LOADING-SURFACE.md`.
- [x] The measured cost came in worse than promised for size (native per ABI and
      JS payload) — stated in that document rather than quietly shipped. The
      owner took the cost and raised the two bundle budgets once, with the
      measurement written down beside them.

## M · No logic left to trip over (started 2026-08-17)

An independent review pass (Codex, read-only, against `src/`) produced eleven
concrete defects. Each one is verified in the code before it is fixed and, where
the logic is pure, it gets a test that fails without the fix.

- [ ] The deck removes the card that was decided, not whatever sits at index 0.
      A decision in flight while the deck reloads currently drops the wrong card
      and can show a decided one again.
- [ ] Discovery loads are serialized: a newer load always wins, an older
      response can never overwrite it, and the request is cancelled when the
      screen goes away.
- [ ] Nothing that changes the deck is reachable while a decision is pending.
- [ ] The chat backfill completes before the new realtime subscription is
      trusted, so a message that lands during a reconnect cannot fall between
      the two.
- [ ] A fast flick decides by the direction of the flick, not by a projection
      that can still point the other way.
- [ ] Swipe geometry follows the current window size instead of the width read
      once at module import.
- [ ] Media removal deletes the storage object before the row, so a failure
      leaves something that can still be retried.
- [ ] Settings writes are computed from the latest state, not from the state
      captured at render.
- [ ] A failed gallery query is an error, not silently fewer photos.
- [ ] Foreign-key violations stop being reported as "changed on another device".
- [ ] Onboarding does not re-upload the same photo when finalisation failed and
      the app restarted.

## N · Diagnostics land where the operator looks

Diagnostics are collected today — `private.beta_client_events`,
`private.beta_feedback`, `private.beta_server_events`, with
`private.beta_daily_summary()` on top — but the only key that may read them is
`service_role`, so nothing reaches the admin dashboard. Opt-in telemetry that
nobody can see is a promise the app does not keep.

- [x] Read-only RPCs in `public`, gated by the existing admin permission model,
      for the daily summary, health, the client error stream and the beta
      feedback list. Applied to production 2026-08-17; verified there that anon
      cannot execute them and that a signed-in non-admin is refused with
      `42501 Admin permission required.`
- [x] A "Diagnose" tab in `site/admin`: health cards, the daily funnel with
      discovery p95, client errors with surface and app version, and feedback
      with category and rating.
- [x] The tab says plainly what is *not* collected and how long each table is
      kept.
- [x] A verifier that fails the build if the dashboard queries a diagnostics
      table directly instead of going through the gated RPCs, plus a pgTAP file
      that proves the gate.

## O · Tested with real accounts, not with hope

The deck has never been exercised with a real candidate: the two production
accounts are already matched with each other. The owner asked for test accounts
on 2026-08-17.

- [x] Two labelled test accounts, their passwords in the vault, acting through
      the same public API the app uses. `docs/TEST-ACCOUNTS.md` holds the
      identities, the helper and the single delete statement that removes them.
- [x] Walked on the S23: a real candidate in the deck, bind, a reciprocal bind
      that produced a match, the celebration, the push banner for the other
      side, the first message, and a realtime reply arriving in the open chat.
- [x] Diagnostics proven end to end: switching the opt-in on produced five
      client events within seconds, and a feedback row reached the daily summary.
- [ ] Still open: a report walked through moderation, photo review from the
      dashboard, and the reset back to a clean state.

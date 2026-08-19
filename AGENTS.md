# AGENTS.md — how work is done in this repository

Binder is an Android dating app in React Native (Expo SDK 57) on Supabase.
Identity, discovery with a mutual-interest deck, matching, conversation, safety
and moderation, settings, profile control. Deliberately small and deliberately
finished: every surface has a loading, empty, error and offline state, and the
server is the truth for every destructive or social action.

This file is the engineering half of the working agreement. The operational
half — release procedure, signing, infrastructure, monetisation, device
evidence, open items — lives in a private repository, because it is nobody
else's business.

## Non-negotiable rules

1. **Nothing that costs money may decide who sees whom.** A paid feature may be
   cosmetic, convenient or informational, never a change to who appears in
   someone else's deck.
2. **Never weaken a gate.** CI steps, verifiers, pgTAP suites and `npm test` may
   become stricter, never removed or softened to get green. A budget number
   moves only when the owner decides it and the measurement that justified it is
   written down.
3. **No secrets in the repo, in logs or in chat.** `google-services.json` is the
   only committed credential-like file, public by design. Everything else lives
   in a vault.
4. **Production data changes only with the owner's explicit go**, and only after
   all gates are green on the exact candidate commit. Nothing that destroys data
   happens without asking first.
5. **Never claim something passed that was not executed.** A measurement or a
   screenshot from a real device, or it did not happen.
6. **A worklet may only call worklets.** `verify-worklet-contract.mjs` enforces
   it; the photo pager once killed the process because a worklet called a plain
   function on the UI thread.
7. **Every user-visible string lives in `src/i18n/locales/en.json`** and is read
   through `t()`. The German Impressum in `AboutScreen` is the one documented
   exception — § 5 DDG requires it in German whatever the interface language is.
8. **Press feedback belongs on controls, not on media.** A hot zone over a photo
   passes `pressedSurface={false} pressScale={false}`; an icon button over a
   photo takes `overMedia`.
9. **Text over a photo comes from the dark palette in both schemes.** A photo is
   not a surface whose brightness the theme controls. The same holds for
   anything drawn on the celebration's overlay.
10. **UI discipline:** design tokens only (no raw hex, sizes, radii or durations
    in `src/screens` or `src/components` — CI enforces), warning and destructive
    colours never restyled, 48 dp touch targets, reduced motion respected via
    `src/lib/motionPolicy.ts`, no competitor names in product copy.
11. **Every awaited request in a screen carries a deadline.**
    `verify-request-deadlines.mjs` enforces it. A failure reaches the screen;
    silence keeps a loading state, a spinning button or a disabled control there
    forever.

## Gates — all of them, before every push

```
npm run typecheck && npm run typecheck:tests && npm test
node scripts/verify-design-contract.mjs
node scripts/verify-worklet-contract.mjs
node scripts/verify-request-deadlines.mjs
node scripts/verify-i18n.mjs
node scripts/verify-i18n-coverage.mjs
node scripts/verify-safety-contract.mjs
node scripts/verify-phase5-contract.mjs
node scripts/verify-phase6-design.mjs
node scripts/verify-phase6-media.mjs
node scripts/verify-phase6-settings.mjs
node scripts/verify-phase7-push.mjs
node scripts/verify-admin-dashboard.mjs
node scripts/verify-brand-assets.mjs
node scripts/verify-entrypoint.mjs
node scripts/verify-site.mjs
node scripts/build-site-i18n.mjs --check
node scripts/build-site-languages.mjs --check
node scripts/build-push-copy.mjs --check
```

`tests/designTokens.test.ts` walks every semantic colour pairing in both schemes
— including pressed, disabled and over-media states — and fails under WCAG AA.
Fix the token, never the test. `supabase test db` runs the pgTAP suites.

## How work runs

- Directly on `main`. One concern per commit series, gates before every push.
- Commit messages: meaningful prose, why and what, no emoji.
- **One improvement per run.** A run touches one behaviour; a second problem
  found on the way becomes the next run, not a bigger commit. A red gate ends
  the run: revert, write down why, move on. The app stays shippable after every
  run.
- Anything a user can see is built, installed on a real phone and screenshotted.

## Languages

English is the source of truth. Adding one: copy `src/i18n/locales/en.json`,
translate the values, set `$meta` (`name`, `endonym`, `flag`), save as
`<code>.json`, run `npm run i18n:sync`. The picker appears in App settings by
itself. Fifteen languages ship, 580 keys each.

- Missing or empty strings fall back to English: a half-finished translation
  degrades, it does not break a screen.
- **A notification is product copy too.** The words live under `push.*` in the
  locale files; `npm run push:copy` generates them for the dispatcher, and
  `--check` fails the build if the two drift.
- Placeholders (`{name}`, `{count}`) are the only substitution; no sentence is
  assembled from fragments.
- Dates, times, distances and counts go through `src/lib/format.ts`.

## The public site

`site/templates/*.html` carries the markup with `{{key}}` where copy goes,
`site/i18n/<code>.json` carries the copy, and `npm run site:i18n` puts them
together — English into `site/`, every other language into `site/<code>/`.
Canonical links, hreflang alternates, the footer switcher and `sitemap.xml` are
generated. A missing key falls back to English and is reported. CI runs
`--check`, and a workflow rebuilds the pages when a language file changes.

A visitor lands in the language their device is set to: `site/assets/language.js`
reads `navigator.languages`, redirects once towards a language the site actually
has, and never argues with a choice the visitor made — clicking the switcher or
opening `?lang=de` stores it. `verify-site-language-switch.mjs` runs that logic
in a fake window and fails the build on a loop, an ignored choice or a language
that does not exist.

## Push, and what has to be true before it is on

Four conditions, unchanged since phase 7, and none of them is a secret worth
hiding: **FCM v1** credentials attached to the Expo project, a **Supabase Cron**
job driving the dispatcher, the **dispatch secret** held in the vault and set as
the Edge Function secret, and **device evidence** recorded for every row before
the feature is called done. Deliveries move `queued → ticketed → delivered`
through Expo receipts; permanent failures dead-letter with their reason and are
never silently retried. The dispatcher never touches a message body — the
verifier fails the build if it references one.

## Lessons that cost real time

1. **Never hand a function style to an animated component.** Reanimated drops
   layout properties; it collapsed the tab bar into the left edge.
2. **Edge-to-edge Android does not resize the window for the keyboard.** The
   chat pads its bottom by the keyboard's height. It must not translate: a
   transform carries the clipping box with it, and the content rode up over the
   header.
3. **One gesture owns one control.** A dial inside a scroll view takes a drag
   only in the band around its ring; everything else belongs to the scroll.
4. **A worklet that calls a plain function kills the app.**
5. **`SIGNED_OUT` is not proof of an expired session.** Ask the server first.
6. **A refusal from the server carries a code or a status; a request that never
   arrived carries neither.** That, not the message text, is how offline is
   detected.
7. **An auth event is not a sign-in.** Only the user id behind the session may
   decide whether to reset navigation.
8. **A request that never answers is worse than one that fails**, and **a
   deadline that has rejected can never resolve** — the request keeps its own
   handler, the deadline only decides when to stop waiting.
9. **A late answer must not steer a screen the person has left.** Requests carry
   a ticket; leaving voids it.
10. **The way out of a state may never be the control that is waiting.**
11. **What a person already decided or typed is theirs.** A decision made
    offline queues; a message written offline is kept on disk, survives the app
    being killed, and sends itself when the network returns.
12. **Most of the ways push dies are returned, not thrown.**
13. **A per-account preference and a per-device permission are two claims.**
14. **Minification breaks things by reflection, not by the compiler.** Walk the
    reflection-heavy paths on a device after enabling it.

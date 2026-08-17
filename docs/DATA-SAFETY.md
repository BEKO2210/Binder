# Play Data safety — the answers, derived from the code

Every line below is taken from the source and the migrations, not from memory.
The file names are the evidence; a claim without one does not belong here.

Reviewed against build v0.5.29 (versionCode 32) on 2026-08-17.

## Data collected

| Play category | What exactly | Where it is written | Required | Shared with anyone | Deletable by the user |
| --- | --- | --- | --- | --- | --- |
| Name | First name only. No surname field exists. | `public.profiles.first_name`, `20260815121000_phase1_identity.sql` | yes | no | yes, with the account |
| Email address | The sign-in address, held by Supabase Auth. | `auth.users`, `src/screens/AuthScreen.tsx` | yes | no | yes, with the account |
| Approximate location | One point, taken at `Accuracy.Balanced`, overwritten on every refresh. Never a track, never a history — the column holds one value and a timestamp. | `src/lib/discovery.ts:31`, `public.user_private.location` / `location_updated_at` | yes, for discovery | no | yes, with the account |
| Photos | The profile gallery, up to six, each reviewed before it can appear in discovery. | `profile-media` storage bucket, `public.profile_media` | yes, at least one | shown to other users of the app by design | yes, per photo and with the account |
| Date of birth | Stored to enforce the 18+ rule and to compute an age. The date itself is never shown to another user; only the age is. | `public.user_private.birth_date` | yes | no | yes, with the account |
| Gender and preferences | Own gender, who the user wants to meet, age range, distance. | `public.profiles.gender`, `public.user_preferences` | yes | no | yes, with the account |
| Messages | Conversation content between two matched people. | `public.messages` | yes | only with the matched person | yes, with the account |
| App interactions (optional) | Screen, duration, outcome, platform, app version, and a random session id. **Off by default**, switched on per account in App settings. No message content, no photos, no bio, no coordinates, no stack traces. | `src/lib/beta.ts`, `private.beta_client_events` | no | no | yes, and it is deleted after 30 days regardless |
| Crash-adjacent signal (optional) | A counter that a render error happened, with the surface it happened on. Deliberately not the error text or the component stack. | `src/components/BinderErrorBoundary.tsx`, verified by `scripts/verify-phase5-contract.mjs` | no | no | as above |
| Diagnostics feedback (optional) | Category, a 1–5 rating and free text the user typed on purpose. | `private.beta_feedback` | no | no | yes, deleted after 180 days |

## Data explicitly not collected

- No contacts, no calendar, no SMS, no call log, no installed-app list.
- No advertising identifier, no ad SDK, no third-party analytics SDK. The only
  network destinations are Supabase and Expo's push service.
- No precise location and no location history: a single balanced-accuracy point
  is overwritten each time, and `location_updated_at` is the only time signal.
- No message content in any diagnostic path — the dispatcher is checked for this
  by `scripts/verify-phase7-push.mjs`, which fails the build if it references a
  message body.

## Security

- In transit: HTTPS to Supabase, WSS for realtime. Nothing else is contacted.
- At rest on the device: the session lives in the platform keystore through
  `LargeSecureStore` (`src/lib/supabase.ts:6`), not in plain storage.
- On the server: row-level security on every table, with pgTAP suites proving
  that a signed-in user cannot read another person's private rows. Photos are
  served as signed URLs with a 30–60 minute lifetime, never public.
- Admin access is a separate, invitation-only membership with per-permission
  checks and immediate revocation when an Auth session is deleted
  (`20260816181817_phase8_admin_session_revalidation.sql`).

## Deletion

- The user deletes the account inside the app: Profile → Delete Binder account.
  It is confirmed destructively and executed server-side
  (`deleteCurrentAccount`, `src/lib/safety.ts`).
- Deleting the Auth user cascades: profile, private row, preferences, media
  rows, decisions, matches, messages, push tokens, diagnostics.
- Storage objects for photos are removed with the media rows.
- Moderation records are deliberately kept as an audit trail without the
  deleted account's content — this is the one exception, and it is stated in
  the privacy policy.
- Retention for the optional diagnostics is enforced in the database, not by
  promise: `private.prune_beta_data()` deletes client events after 30 days,
  ranking batches after 90, feedback and server events after 180.

## Answers to the Play form, in its own words

- **Does your app collect or share any of the required user data types?** Yes,
  collect. No sharing.
- **Is all data encrypted in transit?** Yes.
- **Do you provide a way for users to request that their data is deleted?** Yes,
  in the app, and at `https://beko2210.github.io/Binder/delete-account.html`.
- **Location:** Approximate location, collected, not shared, required for the
  app's core function (finding people nearby).
- **Photos:** Collected, shared with other users of the app as the product's
  purpose, required.
- **Messages:** Collected, not shared outside the conversation, required.
- **App activity / diagnostics:** Collected, optional, not shared, off by
  default.

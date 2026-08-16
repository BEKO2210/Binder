# Phase 8 admin moderation dashboard

Status: **candidate only**. Nothing in this document claims production deployment.

## Frozen base

- Source of truth at start: `main@83d68de3f592ee245a5b835d0ca2ab6ffa92e69c`.
- Working branch: `phase/8-admin-moderation-dashboard`.
- The migration, Edge Function and Pages dashboard must move together on one exact candidate commit.
- Supabase production, GitHub Pages and `main` remain unchanged until the owner gives separate deployment, push and merge authorization.

## Access contract

- Bootstrap owner email: `belkis.aslani@gmail.com`.
- The owner account must already exist in Supabase Auth with a confirmed email.
- No normal Binder account becomes an admin merely by authenticating.
- Only the owner can invite, enable, disable or change a moderator.
- Moderator permissions are independent: photo review, report review and account suspension.
- Account suspension implies report-review permission.
- Authorization is evaluated from `private.admin_members` on every privileged database call. It never trusts `user_metadata` or browser state.
- Every privileged call also revalidates the JWT `session_id` against `auth.sessions`, so deleting a session revokes admin access immediately even while its access token has not expired.
- Disabled moderators lose database access immediately, including with an otherwise valid JWT.

## Moderation contract

- Photo decisions reuse `private.moderate_case` and the existing pending/approved/rejected/removed media invariant.
- Report decisions reuse the existing dismiss/warn/suspend action vocabulary and account-safety transition.
- Client requests never supply the audit actor. The database derives it from the confirmed authenticated user.
- Every terminal decision writes exactly one immutable `private.moderation_actions` row.
- Profile media remains in the private bucket. Authorized photo reviewers receive read access only for paths registered in `public.profile_media`.
- The browser never receives a service-role/secret key.

## UI contract

- Static dashboard path: `/Binder/admin/`.
- Login uses email OTP/magic link with account creation disabled.
- Content Security Policy allows only same-origin scripts and Binder's Supabase project connections.
- The Supabase browser bundle is copied from the pinned npm package during the deterministic Pages build; no runtime CDN script is used.
- User-generated report, profile and message evidence is inserted using `textContent`, never HTML parsing.
- Owner can see summary counts, photo queue, report queue, moderator management and audit log.
- Moderators only see tabs their server-side permissions allow.

## Immutable proofs

- `supabase/tests/phase8_admin_moderation_dashboard_test.sql`: 43 pgTAP assertions.
- `scripts/verify-admin-dashboard.mjs`: public-key boundary, CSP, local dependency, RPC, SQL-revoke, actor and invitation checks.
- CI type-checks `invite-moderator` and runs the complete historical database replay.

## Stop conditions

- Do not deploy if any historical or Phase 8 database assertion fails.
- Do not deploy if the service-role string/key appears in `site/admin`.
- Do not deploy the dashboard before the migration and invite function are available; the static UI must never be the authorization boundary.
- Do not apply the production migration, deploy the function, publish Pages, commit, push or merge without the corresponding owner authorization.

# Binder Phase 5 closed-beta runbook

This runbook is for the operator of Binder's closed beta. It is not an end-user document and contains no secrets.

## Deployment rule

`main` remains the stable release branch. Do not deploy the Phase 5 migrations to production before the Phase 5 PR is merged and all app/database gates are green.

After an approved merge:

1. apply the four Phase 5 migrations in timestamp order;
2. regenerate Supabase TypeScript types from the live project;
3. run Supabase security and performance advisors;
4. verify the public Privacy page is deployed;
5. perform one two-account smoke test before inviting testers.

## Tester smoke path

Every beta build should prove the same user-visible path before a wider wave:

1. create account;
2. accept current Terms and Privacy;
3. complete 18+ onboarding;
4. upload a profile photo;
5. moderator approves the pending photo;
6. second account completes the same path;
7. both accounts appear in eligible discovery;
8. Bind from both sides and receive exactly one match;
9. send messages in both directions;
10. test unmatch on a disposable pair;
11. test Report & Block on a disposable pair;
12. submit Beta Program feedback;
13. enable optional diagnostics, exercise screens, then disable diagnostics and confirm the optional client rows are deleted;
14. delete one disposable account and confirm Auth identity, media and product rows are removed.

## Photo and report moderation

New or replaced profile photos are intentionally `pending` and are invisible to other users until approved. There is no moderator bypass in the consumer app.

Review open work in the trusted Supabase operator environment:

```sql
select
  id,
  source_type,
  subject_user_id,
  priority,
  status,
  media_id,
  report_id,
  created_at
from private.moderation_cases
where status in ('open', 'reviewing')
order by priority desc, created_at, id;
```

Use the server-only moderation function for a reviewed case:

```sql
select private.moderate_case(
  <case_id>,
  'approve_media',
  'operator',
  'reviewed for closed beta'
);
```

Supported actions are `approve_media`, `reject_media`, `remove_media`, `warn`, `suspend`, and `dismiss`. Never expose service-role credentials to the mobile app or a tester.

## Beta measurement boundary

Server-authored funnel events are authoritative. Do not add client events to count decisions, matches, messages, blocks or reports when the database already owns those facts.

Discovery ranking observations may contain only:

- viewer and candidate account IDs;
- ranking variant;
- rank position;
- shared-interest count;
- coarse 10-km distance bucket;
- later Bind/Pass outcome and timestamps.

Do not add exact coordinates, profile text, photo/media paths or message text to ranking telemetry.

Optional client diagnostics remain opt-in and may contain only the fixed fields accepted by `record_beta_client_event`. Do not add a generic metadata JSON field.

## Operator beta summary

After Phase 5 is deployed, the trusted operator can inspect aggregate daily movement without reading user content:

```sql
select * from private.beta_daily_summary(14);
```

The summary reports new users, completed onboarding, decisions, Binds, unique matches, first-message matches, reports, beta feedback count, client render-error count and discovery-load p95 where optional diagnostics exist.

Do not tune ranking from a handful of users. Preserve `baseline_v1` until there is enough real decision data to define an experiment and its success metric before introducing another variant.

## Retention maintenance

The client and discovery RPCs remove old account-scoped rows during normal activity. The operator maintenance function is the explicit full sweep:

```sql
select * from private.prune_beta_data();
```

Current targets encoded by Phase 5 are 30 days for optional client diagnostics, 90 days for ranking batches/impressions, and 180 days for feedback/content-free server funnel events.

Run the maintenance sweep as part of beta operations until it is moved to a reviewed scheduled server job. Do not claim a tighter automated retention guarantee before that scheduler exists.

## Go / no-go review

A beta wave does not expand when any of these are unresolved:

- app CI, Deno check, TypeScript or Android export budget is red;
- database replay, pgTAP, concurrency races, schema lint or account-deletion integration is red;
- a new High/Critical dependency advisory is outside the reviewed allowlist;
- moderation backlog contains unresolved highest-priority safety reports;
- Privacy/Terms/deletion pages do not match shipped behavior;
- exact location or user content appears in telemetry;
- account deletion or block semantics regress.

Remote push is optional for the first closed beta. If the build claims remote notifications, EAS/platform credentials and the server dispatcher become a separate release gate.

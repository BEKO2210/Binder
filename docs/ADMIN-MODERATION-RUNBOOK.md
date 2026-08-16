# Binder admin moderation runbook

## Production activation order

1. Verify the exact candidate commit with app CI, full migration replay, all pgTAP tests, schema lint, Deno checks and site/admin verifiers.
2. Confirm Supabase production is healthy and migration history still matches the repository.
3. Apply `20260816180415_phase8_admin_moderation_dashboard.sql` to production.
4. Apply `20260816181817_phase8_admin_session_revalidation.sql` so revoked Auth sessions immediately lose every admin permission.
5. Run Supabase security and performance advisors. Stop on unexplained new security findings.
6. Deploy `invite-moderator` with JWT verification enabled.
7. Add `https://beko2210.github.io/Binder/admin/` to the allowed Supabase Auth redirect URLs before sending a login or moderator invite.
8. Set optional `BINDER_ADMIN_REDIRECT_URL` only if the canonical URL differs from `https://beko2210.github.io/Binder/admin/`. Never add a service-role key manually; Supabase supplies the function runtime secret.
9. Publish the matching Pages artifact.
10. Sign in as `belkis.aslani@gmail.com`, verify owner status, photo/report queues and audit access.
11. Invite one test moderator with photo-only permission. Verify invitation, claim, denied report access and immediate loss of access after disabling.
12. Only then invite operational moderators.

## Photo review

- Approve only when the image complies with Binder profile and safety rules.
- Reject/remove requires a short factual reason. Do not include unnecessary sensitive information.
- The image remains private until the server confirms approval.

## Report review

- Prioritize underage, violence and sexual-content reports.
- `No violation` closes the case without account action.
- `Warn` creates an immutable operator decision; use a concise reason.
- `Suspend` immediately hides the profile, ends active matches and disables push tokens. Use only with the explicit suspension permission and evidence.

## Moderator management

- Grant the minimum permissions needed.
- A moderator cannot create another moderator.
- Disable access immediately when responsibilities end. Database authorization checks the disabled state on every privileged call.
- Never share the owner login, service keys, invitation links or browser session.

## Rollback

- Disable all moderators first if authorization behavior is suspect.
- Remove or pause access to the static admin page, then undeploy `invite-moderator` if invitations are affected.
- Preserve `private.moderation_actions`; it is the audit trail.
- Do not delete moderation cases or alter historical actor/notes to make a rollback look clean.

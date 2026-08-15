# Binder Safety Baseline

Dating safety is part of the data model and authorization layer, not a release checklist added at the end.

## Age access

Binder is 18+.

Before public Google Play distribution, implement a robust age-access flow and configure the Play Console restriction for minors required for apps whose core function is dating/matchmaking.

A typed birth date by itself is not treated as strong proof of age. The architecture must allow a stronger verification step without redesigning every profile table.

Store the minimum verification result needed by the product. Avoid retaining identity documents unless a chosen provider and legal review require it.

## Blocking

Blocking must:

- immediately prevent both users from appearing to each other in discovery,
- prevent new messages,
- hide or close the active match,
- be enforceable server-side,
- not notify the blocked user who blocked them.

## Reporting

Users must be able to report:

- profile
- photo
- message
- impersonation
- harassment/threats
- sexual content
- scam/spam
- underage concern
- offline safety concern
- other

A report contains immutable evidence references plus the reporter's optional explanation. Moderation actions are stored separately so an action does not rewrite the original report.

## Location privacy

- Never show exact latitude/longitude to another user.
- Never expose a precise "last seen at" location.
- Round distance shown in UI.
- Do not reveal home/work routines through repeated location history.
- Request foreground location first; background location is not an MVP requirement.

## Messaging abuse controls

Initial controls:

- only active matches may message,
- per-account and per-match message rate limits,
- URL/phone-number spam heuristics can be introduced server-side,
- report action available from the conversation,
- unmatch and block available without contacting support.

## Photos and user-generated content

Before production launch:

- upload type and size restrictions,
- strip unsafe metadata where practical,
- server-generated object paths,
- authenticated access policies,
- moderation state per photo,
- removal pipeline,
- repeat-offender handling,
- legal reporting/escalation process where required.

## Data deletion

Deleting an account must have a defined lifecycle for:

- profile visibility,
- auth identity,
- photos,
- device tokens,
- matches/messages,
- reports and moderation records that may need lawful retention.

The user-facing result should be immediate deactivation, while backend deletion/retention rules are executed according to the privacy policy and legal requirements.

## Release gate

Binder does not go to a public dating audience until all of these are true:

- adult-access gate tested,
- report tested,
- block tested in both directions,
- unmatch tested,
- exact location absent from public API payloads,
- RLS/adversarial authorization tests pass,
- account deletion works,
- moderation queue exists,
- privacy policy and terms exist,
- store declarations match actual behavior.

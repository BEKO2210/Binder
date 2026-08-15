# Binder Google Play release gate

Binder is a core dating/matchmaking app. Repository tests are necessary but not sufficient for public distribution.

## Hard external gates

Before public release in Google Play Console:

- Target audience: adults only (18+).
- Enable **Restrict Minor Access** for Binder. The in-app birth-date screen is a second boundary, not a substitute for the Play Console control required for core dating apps.
- Complete the Data safety form from Binder's actual production behavior.
- Publish the public privacy-policy URL.
- Publish the public account-deletion URL.
- Complete the content-rating questionnaire accurately for dating, UGC and messaging.
- Confirm production EAS/FCM push credentials if remote notifications are claimed in the shipped build.

## Repository-backed gates

Phase 4 must prove:

- current Terms & Community Rules are accepted before profile/photo/message UGC creation;
- Terms acceptance cannot be forged by direct table writes;
- new/replaced profile photos become `pending` and are invisible to other users until approved;
- profile uploads and safety reports create private moderation cases;
- normal clients cannot read the moderation queue or write moderation state;
- suspension/deletion immediately removes discovery visibility, closes active matches and disables push tokens;
- in-app deletion reaches an authenticated server deletion endpoint;
- external deletion remains available without reinstalling Binder;
- privacy and terms links are reachable from the app;
- all prior matching/conversation concurrency gates remain green.

## Public policy site

Planned GitHub Pages paths:

- `/Binder/` — product + safety overview
- `/Binder/privacy.html` — privacy policy
- `/Binder/terms.html` — Terms & Community Rules
- `/Binder/delete-account.html` — external deletion request resource

Policy copy is an engineering baseline and must remain consistent with actual production behavior. Any material processor, retention or data-flow change requires a policy update.

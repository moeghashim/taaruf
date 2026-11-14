# Contact-sharing email — approval preview

**Not live.** This change and its independent activation require preview approval. No existing queues will be replayed.

## Exact recipient-facing copy

**Subject:** Your contacts are ready in the portal

Your contacts have been shared. Sign in to your applicant portal to view them: https://www.1plus1match.com/me

Sent separately to each participant’s registered email. No partner name, phone, email, photo, or private interest appears in the notice. Sign-in remains required.

## Trigger and scope

Only the first actual admin contact release—not match creation, mutual interest, initial acceptance, or pending-admin review—queues both recipients. Ordinary, female/mutual interest-linked and standalone presented matchmaker releases use the same match-keyed delivery. Existing brother-review and bilateral own-final-request settings and activation epochs are untouched.

## Future-only activation (after approved deployment)

1. Keep existing `FEMALE_WORKFLOW_EMAIL_MODE=brother-final-request-production` and all current cutoffs unchanged.
2. Enable the separate `CONTACT_RELEASE_EMAIL_ENABLED=true` only under exclusive configuration ownership, then quiesce legacy/manual requests before creating the independent cutoff with `contactReleaseEmail:activate`. Sender/portal credential slots are reused; never print them.
3. Releases before activation or while disabled persist negative delivery rows and cannot be backfilled. Do not retry historical shared-outbox contacts rows.
4. The one-minute contact worker sends only matching epoch, post-cutoff actual releases and rechecks current release, participant, recipient address, archive/reset/revocation/closed status. Each recipient has a stable provider idempotency key and immutable payload.
5. When this gate is enabled, manual **Notify** is blocked to avoid duplicate/early match notices; use actual contact release. Existing automatic inbound/final emails remain unchanged.

## Rollback

Set only `CONTACT_RELEASE_EMAIL_ENABLED=false`; preserve its cutoff and existing brother/final settings. Re-enabling pending post-cutoff rows requires reconciliation; do not reset timestamps. An already-started provider request cannot be recalled.

## Preview testing boundary

Automated tests use a local Convex simulator, synthetic participants and a mocked provider, and execute the real contact-release transaction and delivery worker. Never use real participants or production writes to review this PR. A hosted frontend preview is **UI-review-only** unless a compatible isolated backend is separately verified; it is not authorization to submit live data. No provider delivery is claimed from synthetic tests.

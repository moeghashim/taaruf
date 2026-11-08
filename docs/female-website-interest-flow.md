# Female-origin website interest flow

Review-only implementation for issue #64, stacked on the PR #61 security/photo candidate. Not deployed.

1. A female-origin submission remains private.
2. An admin creates a recipient-specific review link. The intended brother receives a notification inside his authenticated portal; no manual messaging or automatic brother email is required. Existing eligible private female submissions can enter this workflow through this explicit admin action, without inferred photo or relationship consent.
3. The brother signs in and explicitly accepts or declines. Merely opening a link changes nothing. Acceptance queues a sister confirmation email.
4. The sister explicitly confirms on the website. This atomically creates exactly one mutual match, pending final admin approval, and queues an independent pending-review email for each applicant.
5. Final admin approval makes contacts available in both authenticated portals and queues each applicant a contacts-ready email containing only the portal link. Contact data is never included in these emails.

## Delivery and operational gates

Email delivery records are transactional per interest, stage and recipient. The worker uses leases, immutable provider payloads and stable provider idempotency keys. Retry-After applies across workers. Uncertain attempts beyond the provider deduplication safety window require manual reconciliation, not blind retries. Failed records are separately visible in the admin inbox and can be retried without repeating consent actions.

Delivery is disabled by default. Isolated delivery requires an explicit recipient allowlist and non-production portal. Future production delivery additionally requires `FEMALE_WORKFLOW_EMAIL_MODE=production`, `FEMALE_WORKFLOW_PRODUCTION_APPROVED=true`, an exact approved HTTPS portal origin, and dedicated sender/provider settings. None are enabled by this change; owner approval/configuration remains a release prerequisite. Never point a preview at live applicant data. Vercel previews without verified isolated configuration disable API access and are UI-review-only.

## Photo preference correction (issue #58)

Registration and profile editors offer saved Yes/No only. Historical Ask Me First/missing preferences remain stored and non-sharing; saving requires an explicit choice. No bulk migration or inferred Yes. Existing recipient-specific No/revocation retains precedence. The existing per-interest explicit photo choice is retained in this candidate; any replacement needs reviewed precedence semantics before release. Neither matching nor contact approval grants photo consent.

## Release

Do not merge/deploy before reviewed preview approval, independent acceptance, compatible isolated backend proof, truthful DCO resolution and the owner’s outstanding security-impact decisions. This change performs no applicant backfill, credential invalidation, real photo fetch or production email.

# Website interest flow and all-origin final contact gate

Review-only implementation for issue #64, stacked on the PR #61 security/photo candidate. Not deployed.

1. A female-origin submission remains private.
2. An admin creates a recipient-specific review link. The intended brother receives a notification inside his authenticated portal; no manual messaging or automatic brother email is required. Existing eligible private female submissions can enter this workflow through this explicit admin action, without inferred photo or relationship consent.
3. The brother signs in and explicitly accepts or declines. Merely opening a link changes nothing. Acceptance queues a sister confirmation email.
4. The sister explicitly confirms on the website. This atomically creates exactly one mutual match, pending final admin approval, and queues an independent pending-review email for each applicant.
5. Final admin approval makes contacts available in both authenticated portals and queues each applicant a contacts-ready email containing only the portal link. Contact data is never included in these emails.

## All-origin final approval (expanded issue #64)

This supersedes earlier preserve-male-policy claims for **final contact release**. Male inbound discovery and reciprocal discovery remain unchanged; neither is final consent. Male-origin and linked reciprocal flows now record explicit participant approvals, reuse/create one reviewing match, and queue two pending-review deliveries. Only authenticated final admin approval releases contacts and queues two contacts-ready deliveries. Reciprocal approvals are mirrored by participant identity, not requester position. Legacy pending flows use this gate on their next action; historically disclosed contacts are retained without migration/backfill.

Female-origin admin, email, WhatsApp and platform interests use the same authenticated review workflow. Pair approvals are scoped to the event and actual participant identity; reciprocal submissions do not grant approval. Both paths reserve participants against other active pending or released matches in the same transaction. Both paths share the existing durable outbox, cooldown, leases, immutable payload and provider idempotency machinery (legacy table/environment names retained). Pending-review deliveries remain independently deliverable after admin release. Admin status updates to contact_shared invoke the same privileged release transaction as the share-contacts route, never a bare status patch.

## Delivery and operational gates

Email delivery records are transactional per interest, stage and recipient. The worker uses leases, immutable provider payloads and stable provider idempotency keys. Retry-After applies across workers. Uncertain attempts beyond the provider deduplication safety window require manual reconciliation, not blind retries. Failed records are separately visible in the admin inbox and can be retried without repeating consent actions.

Delivery is disabled by default. Isolated delivery requires an explicit recipient allowlist and non-production portal. Future production delivery additionally requires `FEMALE_WORKFLOW_EMAIL_MODE=production`, `FEMALE_WORKFLOW_PRODUCTION_APPROVED=true`, an exact approved HTTPS portal origin, and dedicated sender/provider settings. None are enabled by this change; owner approval/configuration remains a release prerequisite. Never point a preview at live applicant data. Vercel previews without verified isolated configuration disable API access and are UI-review-only.

## Photo preference correction (issue #58)

Registration and profile editors offer saved Yes/No only. Historical Ask Me First/missing preferences remain stored and non-sharing; saving requires an explicit choice. No bulk migration or inferred Yes. Existing recipient-specific No/revocation retains precedence. The existing per-interest explicit photo choice is retained in this candidate; any replacement needs reviewed precedence semantics before release. Neither matching nor contact approval grants photo consent.

## Release

Do not merge/deploy before reviewed preview approval, independent acceptance, compatible isolated backend proof, truthful DCO resolution and the owner’s outstanding security-impact decisions. This change performs no applicant backfill, credential invalidation, real photo fetch or production email.

## Pause, resume and privacy

Pause remains supported with authenticated Resume in the admin match/workbench and applicant portals. A paused match retains its decisions, source, event, photo permissions and disclosure history. Resume checks both participants for intervening active matches; pending matches still require final admin contact release. Resuming released history preserves the first disclosure and queues no additional emails. Closed, declined and reset records cannot resume.

Brother-facing review and connection identities use a neutral applicant reference before and after release. Owner and admin names remain visible. Public submission and final-approval results contain no notification recipient name/email; the server-authorized notification query owns those details. Newly frozen delivery links select the corresponding authenticated review or general connection. Previously attempted immutable mail cannot be recalled or rewritten. Existing released email/phone visibility remains unchanged.

The interest list has one view with derived lifecycle labels, including paused records. Notes, unshared decline/close and test reset remain available. This source-only review does not deploy, publish, change Git identity or create human certification. The preceding privacy fix commit records Moe Ghashim as author despite automated execution; this phase leaves identity and commit creation to the existing pipeline.

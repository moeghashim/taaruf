# Signup receipts — correctness review

2026-10-23. Local implementation only; no network mutations, emails, deployment, or historical data migration.

## Implemented
- Atomic signup transaction persists immutable checkout session → profile + exact event registration + registration-attempt identity. Payment lookup follows that relation even after another checkout overwrites the legacy latest-session field.
- Webhook and payment repair always resolve that persisted relation, including sessions without Stripe event metadata. Unlinked historical sessions fail closed with an explicit manual-reconciliation error; no arbitrary event inference and no generic welcome claiming event success.
- Event receipts render pending/waitlisted status read by the authorized atomic claim. Approved/rejected/withdrawn rows suppress automatic receipts; approval emails remain manual.
- Receipt delivery ledger uses server ATTENDANCE_ADMIN_SECRET authorization, ownership tokens, a two-minute lease, explicit provider-result completion, stable persisted payload and provider idempotency keys. Sent timestamps are written after provider success, never at claim time. Concurrent/in-flight claims return retryable errors rather than success.
- Rejoining withdrawn/rejected event rows increments an attempt counter, resets receipt flags, and creates a new dedupe key. Old checkout attempts cannot claim the new attempt.
- Non-event welcome follows the same durable lease/completion pattern. Its login token is inserted atomically with the claim and the URL/payload is reused across retries, preventing provider idempotency payload conflicts and duplicate concurrent sends.
- Schema additions are widen-only. No existing data was rewritten.

## External delivery limits / rollout requirements
- ATTENDANCE_ADMIN_SECRET must match between Next server and Convex. No secrets were changed here.
- Provider acceptance is not inbox delivery. There is no atomic transaction spanning Convex and Resend; bounded provider idempotency is essential for crash recovery. Automatic retries stop 23 hours after the first attempt, before Resend's 24-hour idempotency expiry. Uncertain deliveries then require provider reconciliation, not a blind resend.
- A process indefinitely paused after claiming cannot be fenced at the external provider. Lease concurrency relies on the provider's dedupe guarantee. Do not claim unconditional exactly-once delivery.
- Status changes after claim but before external send remain an unavoidable cross-system race. Changed status on retry is suppressed or reported for manual reconciliation rather than changing the payload under the same provider key.
- Webhook retries, payment repair, or another portal registration attempt recover expired leases; no autonomous delivery scheduler was added. Portal failures are returned as notification errors.
- Historical sessions without immutable association intentionally need manual reconciliation. Legacy sent timestamps are retained; previously claimed-but-never-sent historical rows cannot be reliably distinguished without provider evidence.

## Validation
56 tests passed across receipt ledger (authorization, concurrency, crash recovery, stale owners, expiry, attempt fencing, welcome token stability, overlapping checkout linkage), event/registration backend, receipt rendering, webhook/repair and baseline manual email templates. TypeScript and scoped ESLint passed. No live email/deployment proof performed.

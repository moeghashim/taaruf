# Issue 50 archive + issue 49 consent integration — review only

Baseline: fresh production metadata confirms dpl_8RMMgqxAQYxLz6RFMTx9KxUyMjwH / 91844a6 PR48. Branch feat/archive-participant preserves that workbench, plus consent candidate cherry-pick ad2ebc3. PR51 remains the older consent-only draft; do not deploy it over PR48.

## Archive behavior
Owner session or authorized admin, explicit confirmation, revision expectation and idempotent retries. One Convex transaction marks archived actor/time, closes active matches/interests/flows/shares without deleting history, clears active match pointers, withdraws upcoming event registrations and active legacy waitlists, and releases reserved seats via same-event/gender FIFO to Pending (not automatic approval). Past/started/completed events and attendance remain unchanged. Photo/contact decisions, payment data and receipts retained; no refunds or emails executed.

Future admission, stale activation, queue promotion, match creation/advancement, new profile shares and notification claims check archived state server-side. Candidate picker now uses authenticated minimal server-filtered endpoint. Consent edits cannot unarchive. Generic profile saves cannot reactivate an archived record. Event checkout checks archive before Stripe creation and backend rechecks atomically.

## Evidence
243 tests across 30 files; typecheck pass; full lint zero errors/seven existing warnings; production build pass. Two synthetic-adapter desktop/mobile keyboard confirmation tests. Actual local Convex + Next browser tests at 1280/390: Cancel/Escape makes no change; keyboard confirmation archives; reload persists; six independent client retries return same timestamp; FIFO promotes exactly two next same-gender applicants to Pending; payment/photo state unchanged, zero emails. Local Turbopack dev font resolver failed; webpack dev recovered without source/config changes. Production Turbopack build passed.

Screenshots in artifacts/archive-*.png. Raw synthetic SQLite/harness/logs outside release source at ../archive-validation. No production applicant reads/mutations/config changes, emails or deployment.

## Explicit release gates
1. Issue49 beyond-event scope/provenance product decision remains open. Do not infer all admin matching is beyond-event or disable event matching. See matchmaking-scope-audit.md.
2. Authentication remediation and server-secret alignment required. See auth-remediation-review.md. No forced signout performed. Existing potentially forged tokens/sessions need approved remediation or new-session-only sensitive-operation policy.
3. Archive admin bridge uses ATTENDANCE_ADMIN_SECRET; production Next lacks that value and backend ADMIN_PASSWORD is absent. Both bridges fail closed until explicitly coordinated. No values exposed or settings changed.
4. Matching notifications are revalidated before each external send. A queued call that has not passed validation is blocked. An external provider call already in flight cannot be rolled back or unsent; strict zero-delivery-after-archive guarantee is NOT claimed. There is no durable outbox/provider cancellation contract. Product must accept the explicit in-flight boundary or authorize a broader delivery design.
5. Transaction processes all associated history in one atomic mutation. Exceptionally large profiles may hit Convex transaction limits and fail atomically, rather than partially archive; no silent batch truncation. Scale-limit handling needs a staged archive state if encountered.

No unarchive UI/API, automatic refunds, event cancellation, historical deletion or restoration on consent change.

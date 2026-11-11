# Whole-profile rejection notice (Layla3310/3313)

Preview approval REQUIRED before live deployment or activation. Waiver3301 applied only to the previous event-email safeguard.

This is a dedicated exception to the rejected-profile event-email safeguard, not a relaxation of that safeguard. No event mutation enqueues this email. The exact generic application notice is versioned in convex/profileRejectionNotice.ts. No background-check reason or event/date is included.

## Enforcement and delivery

- Only authenticated registrations.updateStatus transitions from non-rejected to rejected enqueue, atomically with the profile change, after activation/configuration. No sweep and no notice on repeated saves or existing rejected profiles.
- Future rejection transitions persist a 15-minute not-before deadline atomically. Repeated same-status saves and concurrent calls do not move it. The minute cron may dispatch later, never earlier. Reversal before the first dispatch cancels. A subsequent genuine rejection starts a fresh 15 minutes ONLY when the prior notice is cancelled with zero attempts, no first-attempt timestamp, no payload and no provider acceptance. The same durable row is reused; sent/attempted/ambiguous notices are never reset.
- Cron jobs carry no captured notice or deadline: stale invocations always re-read the current row and independent not-before guard. Deadline survives process restarts. Legacy unattempted rows without a grace boundary cancel rather than send retroactively. No sweep/backfill.
- Dedicated profileRejectionNotices table retains recipient, frozen provider payload, timestamps, attempts, state, and provider ID. Accepted means provider acceptance, NOT inbox delivery.
- One due notice per minute; two-minute claim lease; timeout 30 seconds. Transport/429/5xx retry with original row-derived Resend idempotency key and immutable payload. Retry delay is max(provider Retry-After, 60 seconds * 2^attempts). Maximum six claims, and no send at/after 23 hours from the first claim (inside Resend's 24-hour idempotency retention). Exhaustion/permanent failure requires manual provider reconciliation; there is no automatic reset/resend API.
- Each claim rechecks current rejected status and unchanged recipient. Reversal cancels unattempted work; attempted/ambiguous work is held for reconciliation. Late acceptance evidence is retained even after reversal or lease recovery. No distributed atomic guarantee: reversal after claim cannot reliably recall an in-flight provider request.
- Internal-only worker/activation functions; existing admin bridge credential required for status mutation. Generic settings cannot write the activation boundary. No other workflow configuration changes.

## Activation (NOT performed)

After explicit approval of a compatible isolated preview and scoped live release, configure dedicated PROFILE_REJECTION_NOTICE_APPROVED=true, PROFILE_REJECTION_NOTICE_RESEND_API_KEY and PROFILE_REJECTION_NOTICE_FROM securely, then invoke internal profileRejectionNotice.activate once on the approved backend. Do not enable FEMALE_WORKFLOW_* or other workflow email settings. Activation creates only a boundary, never scans applicants. Default missing configuration disables enqueue/send.

## Preview limitations

No new hosted resources and no real rejections/emails are authorized for testing. Local convex-test exercises synthetic transactional state and mocked provider calls. Browser tests intercept all API traffic and block external origins. A frontend preview alone is UI-review-only: functional hosted testing requires an existing isolated compatible backend and synthetic-only data. Never use the live backend to fill that gap.

## Local correction validation (Layla3350)

Independent read-only review found misleading pending-retry feedback; corrected by exposing only an authenticated attempted flag and showing reconciliation/retry-specific wording. Admin feedback distinguishes grace-pending, cancelled-unsent, sending, provider-accepted (not inbox confirmation), and ambiguous retries/holds. The reversal action explicitly approves the profile. Backend dispatch claim remains the linearization point: reversal committed before claim prevents sending; a request already claimed cannot reliably be recalled. Approved subject/body unchanged. No live activation/deployment or real email testing.

Verified locally: 890 tests / 73 files; root and Convex TypeScript checks; lint (0 errors, 8 existing warnings); production Turbopack build; 3 synthetic production-build browser cases at 1280/390/320 covering pending, reversal/cancelled, accepted and ambiguous retry feedback. Browser intercepts all APIs and blocks external origins/WebSockets; no backend URL/credentials configured. Fake-clock tests cover deadline-minus-1ms/exact deadline, re-rejection old wakeup, concurrent claims/saves, module reload with durable state, accepted/ambiguous suppression and no legacy send. Latest remote main inspected read-only: 705862f28f735d273ecdd6c5f9181c8d6f9d5837; this additive correction intentionally remains based on PR112 684012cee7fab7336c55b1443e4ac456cd8d7130, without feature97 integration.

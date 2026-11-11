# Whole-profile rejection notice (Layla3310/3313)

Preview approval REQUIRED before live deployment or activation. Waiver3301 applied only to the previous event-email safeguard.

This is a dedicated exception to the rejected-profile event-email safeguard, not a relaxation of that safeguard. No event mutation enqueues this email. The exact generic application notice is versioned in convex/profileRejectionNotice.ts. No background-check reason or event/date is included.

## Enforcement and delivery

- Only authenticated registrations.updateStatus transitions from non-rejected to rejected enqueue, atomically with the profile change, after activation/configuration. No sweep and no notice on repeated saves or existing rejected profiles.
- At most one durable notice per profile lifetime (including reversal/re-rejection). Transactional indexed read/insert protects concurrent calls. This deliberately prioritizes duplicate suppression; cancelled notices are not requeued.
- Dedicated profileRejectionNotices table retains recipient, frozen provider payload, timestamps, attempts, state, and provider ID. Accepted means provider acceptance, NOT inbox delivery.
- One due notice per minute; two-minute claim lease; timeout 30 seconds. Transport/429/5xx retry with original row-derived Resend idempotency key and immutable payload. Retry delay is max(provider Retry-After, 60 seconds * 2^attempts). Maximum six claims, and no send at/after 23 hours from the first claim (inside Resend's 24-hour idempotency retention). Exhaustion/permanent failure requires manual provider reconciliation; there is no automatic reset/resend API.
- Each claim rechecks current rejected status and unchanged recipient. Reversal cancels unattempted work; attempted/ambiguous work is held for reconciliation. Late acceptance evidence is retained even after reversal or lease recovery. No distributed atomic guarantee: reversal after claim cannot reliably recall an in-flight provider request.
- Internal-only worker/activation functions; existing admin bridge credential required for status mutation. Generic settings cannot write the activation boundary. No other workflow configuration changes.

## Activation (NOT performed)

After explicit approval of a compatible isolated preview and scoped live release, configure dedicated PROFILE_REJECTION_NOTICE_APPROVED=true, PROFILE_REJECTION_NOTICE_RESEND_API_KEY and PROFILE_REJECTION_NOTICE_FROM securely, then invoke internal profileRejectionNotice.activate once on the approved backend. Do not enable FEMALE_WORKFLOW_* or other workflow email settings. Activation creates only a boundary, never scans applicants. Default missing configuration disables enqueue/send.

## Preview limitations

No new hosted resources and no real rejections/emails are authorized for testing. Local convex-test exercises synthetic transactional state and mocked provider calls. Browser tests intercept all API traffic and block external origins. A frontend preview alone is UI-review-only: functional hosted testing requires an existing isolated compatible backend and synthetic-only data. Never use the live backend to fill that gap.

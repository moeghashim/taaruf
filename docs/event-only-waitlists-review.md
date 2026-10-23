# Event-only waitlists — local review (2026-10-21)

## Scope / base
- Freshly fetched origin/main: 0d7129d (merged #39). Isolated branch fix/event-only-waitlists in /Users/moeghashim/taaruf-event-waitlists. Existing dirty checkout/worktrees preserved.
- LOCAL ONLY. No push, PR, deployment, production read, applicant export, migration, or email. No .env copied. Browser uses synthetic endpoint and blocks non-local requests.

## Verified baseline (not a claim about deployed production)
- Public portal signup already wrote event Pending independently of global approval. Checkout registration also wrote Pending, but its capacity helper returned Pending on BOTH branches.
- Admin UI already offered event status approval separately from profile approval. However updateRegistrationStatus had NO backend authentication; being behind the admin page did not secure its RPC.
- Capacity mutation counted Approved only; public availability display counted Pending + Approved. Public overflow never entered the separate legacy eventWaitlistEntries table.
- Removal/cancellation/expiry did not promote waitlisted applicants. Carryover and Apr26 backfill could manufacture Approved rows (and backfill attendance) from historical/profile approval.
- Upstream global schema already excluded waitlisted, while legacy updateStatus silently normalized waitlisted writes to Pending. Profile/dashboard “Event waitlist” views aggregated legacy event waitlists across events.

## Implemented
- Shared eventCapacity helper: Pending AND Approved reserve gender-specific capacity. This is an explicit assumption to avoid overbooking while admins review.
- Both checkout and signed-in signup, plus authenticated admin add, use the same transaction-level capacity logic. Overflow is eventRegistrations.registrationStatus=waitlisted with queue-entry time.
- Withdrawal/rejection/cancelled confirmation/expired confirmation and capacity increase promote oldest same-event/same-gender entries to Pending ONLY. Ordering: waitlistedAt (legacy fallback createdAt), _creationTime, then ID. Rejoining resets queue time. Repeated removal/expiry is safe; repeat portal/admin signup returns the existing row. Checkout retains its pre-existing duplicate-profile rejection semantics.
- Pending->Approved requires existing cookie-authenticated Next bridge plus server-only ATTENDANCE_ADMIN_SECRET verified in Convex. Direct RPC without correct secret fails closed. Confirmation does not grant approval. No profile status mutation in event operations.
- Capacity overrides cannot overbook; reductions below reservations fail. Manual Pending clicks cannot jump the queue.
- Automatic cross-event carryover and destructive Apr26 queue migration are retired. Explicit admin copying creates independent Pending/Waitlisted rows, never copies approval. Historical backfill cannot create fake attendance/approval. Existing historical data unchanged; interest eligibility logic unchanged.
- Removed global profile/dashboard waitlist filtering/badges. Event filters/counts show actual event queue; existing separate-table entries remain visibly labelled retirement-decision-pending. Admin add accepts a profile record ID; this deliberately avoids a broad applicant lookup.

## Parent audit correction / staged compatibility (supersedes initial assumption)
Parent supplied completed audit (report 2129): **23 active eventWaitlistEntries**, linked by registrationId to **16 Approved profiles + 6 Pending profiles**, plus **1 orphan**. **Zero registrations.status=waitlisted and zero eventRegistrations.registrationStatus=waitlisted.** This worker did not repeat live retrieval.

There is NO global profile-status migration to perform. Danielle forbids profile changes. Removed the unnecessary widening of registrations.status and the fictitious Pending migration proposal. Global profile status schema remains unchanged from origin/main.

The new eventRegistrations Waitlisted status is a NEW capacity-queue representation, not the source of the 23 existing records. Safe staged coexistence, not an implicit conversion:
1. Existing eventWaitlistEntries stay intact and readable in their event-specific detail panels, with original dates, IDs, linked profile status, and an explicit orphan label. No deletion, hiding, conversion, auto-promotion or copying from these records. Current decision pending is the orphan/retirement disposition reported by parent, NOT profile approval.
2. New capacity queues use eventRegistrations rows so Pending/Approved/Waitlisted share the existing unique event/profile lookup. No writes to eventWaitlistEntries. Explicit admin cross-event copying reads only eventRegistrations, not the old holding list.
3. These are deliberately distinct displayed sections, not additive queue ranks: new queue FIFO uses its own queue-entry timestamp; old chronology is preserved unchanged. Do not claim the 23 legacy rows participate in new FIFO. A release affecting those events is gated until Danielle approves retirement or an explicit event/gender mapping and queue-order reconciliation. No assumption that historical holding-list provenance means a capacity queue.
4. If a conversion is later requested, use bounded dry-run/backup, original timestamps, event/profile deduplication, orphan handling, idempotent ledger and rollback before enabling old records in promotion. Never modify registrations/profile approval. Do not narrow/drop the existing table or its status enum while records remain.

## Verification
- Full Vitest: 83 tests passed (13 files), including synthetic Real Talk Oct20 2026 (yesterday): capacity fill/overflow, FIFO removal->Pending->explicit Approved, both genders/event isolation, unchanged global Approved/Pending, preserved existing queue records including orphan, authentication failure, admin add, capacity edits, expiry retry and tied queue timestamps, checkout overflow.
- TypeScript: npx tsc --noEmit passed.
- ESLint: 0 errors, 7 pre-existing warnings.
- Mocked Chrome browser: desktop/mobile applicant queue renders Waitlisted -> Pending -> Approved; 1 test passed. No live mutation/email. This is UI rendering proof, not browser proof of a live backend transaction.
- git diff --check passed.
- Race reasoning: Convex mutation OCC tracks indexed capacity/queue range reads and writes atomically. No split action/read/write operations. convex-test does NOT prove deployed distributed conflict/retry behavior; a real isolated-backend concurrency load test remains a pre-release check. Unbounded per-event range reads are correctness-first and fail transaction limits rather than silently undercount; very large events warrant indexed counters/queue pagination.

## Remaining boundaries
- Only existing-list retirement/orphan disposition remains with Danielle; no profile changes authorized. Parent audit evidence is distinguished from source inspection; no live retrieval by this worker.
- Existing general admin read/email/profile RPC authorization outside this flow is not comprehensively hardened. Physical profile deletion is an existing separate operation and does not remove event registration rows; event removal here means Withdrawn/Rejected/cancelled confirmation, preserving history.
- Review/preview approval still required before any release. ATTENDANCE_ADMIN_SECRET must match Next/Convex server environments (existing check-in bridge convention); never expose it to the browser.

# Sister final approval notification — request3232

Future-only email on actual brother acceptance to awaiting_sister_confirmation. Sending and authenticated dashboard GET never approve or create a match; explicit sister confirm remains required. No contact/photo/name disclosures or bearer capability. HTTPS dashboard?femaleReview=<interest id> is an authenticated review link only.

Indexed deduplication key per interest/kind/recipient, transactional enqueue and leases, frozen provider retry body/key, 23-hour retry bound. Claim and pre-provider checks bind recipient identity/email, acceptance timestamp, pending state, expiry/revocation/reset and applicant eligibility. Email change cancels rather than replaying an old recipient. A change after final authorization cannot recall an already in-flight provider request.

## Separate activation and no backfill

One-time server timestamp sisterConfirmationEmailActivatedAt is immutable through settings API. Dedicated mode sister-confirmation-production requires eligibility stamp at enqueue and acceptance/creation strictly after activation. Earlier/unconfigured transitions keep failed deduplication tombstones; repeats/retries cannot promote historical notifications. No automatic activation/backfill.

Brother-review-production and its activation remain unchanged. Sister mode selects only sister_confirmation; unrelated queues are untouched. **Modes are intentionally mutually exclusive.** If both notifications must run simultaneously, obtain separately reviewed explicit combined-kind support first; switching modes blocks the other kind, including eligibility on new transitions. Never use shared production or isolated mode to bypass gates.

## Read-only setup inspection — 2026-11-10

Serving frontend verified ffe260e0fb3d9c20e0a3a46aef96df87ea5a32da (dpl_CdgDuYLybaZVqZ7eiEgz1h3bgqG2), all53 backend hashes match capacity release3197. Candidate preserves newest education/corrected-email/capacity/sister-notice ancestry. Dirty main and other worktrees untouched.

Serving backend lacks FEMALE_WORKFLOW_EMAIL_MODE, FEMALE_WORKFLOW_PRODUCTION_APPROVED, FEMALE_WORKFLOW_PORTAL_URL, FEMALE_WORKFLOW_EMAIL_FROM and FEMALE_WORKFLOW_RESEND_API_KEY. Credential presence only reported; no secret output. Dedicated key, verified approved sender/domain and HTTPS portal are actual setup blockers. Frontend Resend setup is unrelated. No provider request, real email, activation or production write performed.

## Approval/setup checklist — NOT executed

1. Exact-SHA human DCO, preview acceptance and deploy approval; recheck newest serving ancestry and coordinate other contact notice/button branches, never merge stale main over live changes.
2. Approved compatible backend/schema release while email stays disabled.
3. Explicitly authorized secure operator configuration of dedicated Resend key, verified approved FROM and HTTPS portal https://www.1plus1match.com (or apex). Never collect secrets in chat.
4. Explicit approval of sister-only production mode and production-approved flag. If simultaneous brother emails required, resolve combined-kind support first. Read-only queue inventory, no historical retry/backfill/stamp edits.
5. Separate authorization for internal femaleWorkflowDelivery:activateSisterConfirmation {} once; repeat retains original cutoff. Do not modify either activation boundary.
6. Only future authorized acceptance verification, provider receipt distinct from mailbox delivery. Disabling mode stops future sends, not in-flight messages. No historical send requested or authorized.

## Validation

792 tests/67 files, root and Convex typechecks, scoped ESLint pass. New15 synthetic tests cover duplicate races, 400/429/500 provider retries, recipient/state/expiry/revocation/reset/acceptance freshness, no backfill and explicit sister-only match creation. Existing test fixtures now configure before acceptance rather than relying on forbidden historical replay. Independent final review PASS,66/66 focused tests. Local backend/schema compilation dry-run, no push. Isolated production build; no shared output. Existing exclusive-mode limitation documented, not activated.

# Sister final approval notification — request3232

Future-only email on actual brother acceptance to awaiting_sister_confirmation. Sending and authenticated dashboard GET never approve or create a match; explicit sister confirm remains required. No contact/photo/name disclosures or bearer capability. HTTPS dashboard?femaleReview=<interest id> is an authenticated review link only.

Indexed deduplication key per interest/kind/recipient, transactional enqueue and leases, frozen provider retry body/key, 23-hour retry bound. Claim and pre-provider checks bind recipient identity/email, acceptance timestamp, pending state, expiry/revocation/reset and applicant eligibility. Email change cancels rather than replaying an old recipient. A change after final authorization cannot recall an already in-flight provider request.

## Separate activation and no backfill

One-time server timestamp sisterConfirmationEmailActivatedAt is immutable through settings API. Dedicated mode sister-confirmation-production requires eligibility stamp at enqueue and acceptance/creation strictly after activation. Earlier/unconfigured transitions keep failed deduplication tombstones; repeats/retries cannot promote historical notifications. No automatic activation/backfill.

Individual brother-review-production and sister-confirmation-production modes remain supported. Explicit combined mode **brother-sister-review-production** permits only brother_review and sister_confirmation. Each kind still requires its own explicitly authorized activateBrotherReview / activateSisterConfirmation operation and immutable cutoff. Selecting combined mode does not activate either kind, mint cutoffs, stamp history, or enable pending_review/contacts_ready. Switching from an individual mode preserves existing cutoffs; any old eligible pending messages may resume, so inspect the queue before authorizing a mode change. Never use shared production or isolated mode to bypass gates.

Claim uses bounded per-kind indexed reads and oldest-due selection; shared 429 cooldown applies to both kinds without mutating unrelated rows. Frozen recipient changes cancel both invitation kinds. Scoped production frozen FROM changes cancel for reconciliation, never alter the provider body/key. An already in-flight provider request cannot be recalled.

## Read-only setup inspection — 2026-11-10

Serving frontend verified ffe260e0fb3d9c20e0a3a46aef96df87ea5a32da (dpl_CdgDuYLybaZVqZ7eiEgz1h3bgqG2), all53 backend hashes match capacity release3197. Candidate preserves newest education/corrected-email/capacity/sister-notice ancestry. Dirty main and other worktrees untouched.

Serving backend lacks FEMALE_WORKFLOW_EMAIL_MODE, FEMALE_WORKFLOW_PRODUCTION_APPROVED, FEMALE_WORKFLOW_PORTAL_URL, FEMALE_WORKFLOW_EMAIL_FROM and FEMALE_WORKFLOW_RESEND_API_KEY. Credential presence only reported; no secret output. Dedicated key, verified approved sender/domain and HTTPS portal are actual setup blockers. Frontend Resend setup is unrelated. No provider request, real email, activation or production write performed.

## Approval/setup checklist — NOT executed

1. Exact-SHA human DCO, preview acceptance and deploy approval; recheck newest serving ancestry and coordinate other contact notice/button branches, never merge stale main over live changes.
2. Approved compatible backend/schema release while email stays disabled.
3. Explicitly authorized secure operator configuration of dedicated Resend key, verified approved FROM and HTTPS portal https://www.1plus1match.com (or apex). Never collect secrets in chat.
4. Explicit approval of brother-sister-review-production mode and production-approved flag for exactly these two kinds (or explicitly choose an individual mode). Read-only queue inventory, no historical retry/backfill/stamp edits.
5. Separate authorization for internal femaleWorkflowDelivery:activateBrotherReview {} and femaleWorkflowDelivery:activateSisterConfirmation {} once each; authorize each kind by name. Neither operation activates the other. Repeats retain original cutoffs. Do not modify either activation boundary.
6. Only future authorized acceptance verification, provider receipt distinct from mailbox delivery. Disabling mode stops future sends, not in-flight messages. No historical send requested or authorized.

## Validation — combined candidate

836 tests/68 files; root and Convex typechecks, scoped ESLint, isolated production build and local backend/schema compile dry-run. Production remains disabled. Independent review identified inherited stale brother frozen-recipient replay; corrected with claim/pre-attempt cancellation and regression tests for both recipient and sender changes. Initial parameterized fixtures had three assertion failures (count of unrelated kinds and expected unactivated brother tombstone); corrected, all green. No portal integration files changed.

Exact deployment approval must name the published combined candidate SHA (reported with PR), not only original cab1c2c8e487cbaf87078d932e25ac7ace4b27ff. This candidate descends from freshly verified live ffe260e0fb3d9c20e0a3a46aef96df87ea5a32da. Preview/backend approval and secure setup/activation are distinct later gates. No configuration, credential, email, backfill, activation, or deployment is authorized by this implementation report. Dedicated credential, verified sender/domain, and portal setup remain external approval blockers; use a secure private operator path, never group-chat secrets. Hosted frontend preview is UI-review-only until an isolated compatible backend is proved.

Independent final security review PASS: 99/99 focused tests. Implementation commit 2d9142c822b8f040946564ef12ee98f952823c30; follow-up documentation/DCO remediation does not change runtime code. Automated author signoff is not human deployment approval.

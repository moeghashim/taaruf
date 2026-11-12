# PR87 / request2961 — future-only activation guard

## Scope and invariants
No production changes, configuration changes, real sends, backfill, recovery/capability cutoff changes, or new resources. The existing settings table holds a one-time server-generated boundary; existing outbox gains an optional eligibility stamp and a kind/status/due-time index. No automatic activation during deployment or cron.

Dedicated mode is brother-review-production (not shared production). Only brother-review rows are selected. Pre-activation and unconfigured shares retain deduplication tombstones without eligibility stamps; reissue/manual retry cannot promote them. Claim and pre-provider authorization reject historical/unstamped rows. Existing lifecycle, immutable provider payload, duplicate protection, recipient checks, expiry/revocation and 23-hour retry rules remain. Other kinds retain their old behavior outside dedicated mode, and are untouched/not enabled within it. Isolated mode remains exact-allowlisted/non-live-origin for synthetic testing; never use it with real recipients to bypass activation.

## Remaining owner decisions / setup (not executed)
1. Approve final two-commit PR87 manifest/DCO certification, preview acceptance and release. Prior 5c3ef47-only signoff scope is insufficient for this guard.
2. Approve dedicated Resend credential and verified sender; operator supplies secrets privately through existing secure configuration tooling, never chat. Backend requires FEMALE_WORKFLOW_RESEND_API_KEY, FEMALE_WORKFLOW_EMAIL_FROM, FEMALE_WORKFLOW_PORTAL_URL=https://www.1plus1match.com (or https://1plus1match.com). Frontend RESEND_API_KEY is unrelated.
3. Release compatible backend/schema/index before frontend; preserve disabled sending during rollout. No scheduler provisioning: existing 60-second cron remains.
4. Inventory queue read-only; do not retry, migrate stamps, backfill, cancel unrelated rows, or enable shared production mode. Set FEMALE_WORKFLOW_EMAIL_MODE=brother-review-production and FEMALE_WORKFLOW_PRODUCTION_APPROVED=true only under explicit configuration approval. Other kinds remain disabled under this mode.
5. Separately authorize/call internal femaleWorkflowDelivery:activateBrotherReview once with {}. It takes no caller timestamp; stores current server milliseconds; repeats return original. Shares must occur strictly after this boundary and while full configuration is valid. Existing preactivation/config-failed notifications stay unsendable. Disabling mode stops sending; reenabling never resets boundary. Do not alter/delete the boundary or eligibility stamps through raw database operations.
6. Verify future authorized sharing and provider receipt under owner-approved release plan; no blanket retries. Dedicated production mode ignores simulator allowlist, so approval of mode and credential is material.

## Evidence limits
Prior unchanged-candidate sandbox evidence in ops/interest-alert-runtime/verification-report.md proved real Resend **acceptance**, not mailbox delivery. This guard is verified locally using mocked provider calls; no new real provider request. Existing UI-only hosted preview does not prove browser-to-backend E2E. Production configuration and release remain blocked on owner approval.

Independent security review approved guard with no blocking findings and ran 50 relevant tests. Its nonblocking suggestion to reject expired reviews directly at manual retry was implemented with a regression test (claim already prevented sending).

Final local validation: 59 test files / 723 tests passed; TypeScript noEmit, targeted ESLint and git diff --check passed. All provider calls in these tests mocked.

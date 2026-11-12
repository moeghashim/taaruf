# Independent review P1/P2 repair — 2026-11-11

- Removed matchId from both new and retry public submitInterestNumber receipts.
- Applicant linked pause/resume is now available only after contactsVisible validates release and linkage. Before release, both no-match and joined-match probes receive the same denial; HTTP maps it to the same 409 body. Paused/canPause projections do not reveal pre-release linked match existence.
- Authentication, approved applicant status, participant ownership, reset and terminal-state checks remain in the actual mutation. Admin pause/resume and manual matchmaker lifecycle endpoints are unchanged.
- Ordinary-interest active/detail and closed history now carry separate ownInitialDecision and ownFinalApproval receipts; UI labels them separately. Withdrawal remains an own-action receipt. No counterpart decision is added.
- Real Convex-test transitions execute ordinary bilateral approvals and female accept/confirm, assert a match was actually created, and compare complete prior-approver payloads, direct submit retries, and pause/resume denials before/after join. Release restores applicant pause/resume. Initial accept/keep-open/decline survive closure with independent pending final approval.

## Validation

Passed 175 tests in 8 suites:

	npx vitest run convex/allOriginWorkflow.test.ts convex/interests.test.ts convex/femaleReviewDecisionPrivacy.test.ts convex/initialInterestBioPrivacy.test.ts convex/linkedShareBioPrivacy.test.ts convex/matchmakerMatching.test.ts convex/femaleInterestWorkflow.test.ts src/app/api/applicant/me/route.test.ts

Passed npx tsc --noEmit, changed-file ESLint, and git diff --check.

Raw local logs: /tmp/layla-repair-final-tests.log, /tmp/layla-repair-final-types.log, /tmp/layla-repair-lint.log.

No push, deploy, live writes, emails, or configuration changes. No browser run or complete production build in this child task.

## Scope still requiring owner decision

Standalone/context-free grants are unchanged: no migration, rebind or revocation. Their existing bio-access exception requires explicit scope/policy decision and pair-level inventory; this repair does not claim universal bio withholding across those grants. Contact/photo consent and admin release logic are unchanged. Initial acceptance remains inferable from the intentionally required bio unlock; this repair addresses final approval inference via linked pause and submit receipts.

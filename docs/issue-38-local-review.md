# Combined issues #37 / #38 review

Base: main 2cff643bc6b349af243656814611df48d87877bc, verified against live GitHub on 2026-10-20. Branch: fix/issue-37-event-interest. Live #37/#38 and #30 comments inspected. #38 explicitly supersedes the separate #30 attendance design and its recipient-attendance comment. No issue was closed; original issue-30 worktree is untouched.

## Changes relative to prior local #37 preparation
- Sender eligibility now reads ONLY eventRegistrations.registrationStatus === "approved" AND attendanceStatus === "attended" for the latest matching event. Global registrations.status approval alone is not event approval. Events UI uses these exact independent axes (display labels Approved, Attended, Not Checked In, No Show).
- Removed eventAttendees fallback, all cross-table synchronization, and unused shared-event eligibility helper. Recipient attendance/event registration is not required; existing approved recipient, completed profiles, opposite-gender and session requirements remain. Sender global pending/approved policy remains; dashboard also respects profile/global eligibility.
- Existing Events check-in now goes through a cookie-authenticated Next server bridge to secret-protected events.updateAttendanceStatus. Reuses existing admin_token / ADMIN_PASSWORD / ADMIN_TOKEN_SALT / ATTENDANCE_ADMIN_SECRET pattern; no provider or credential/config changes. Errors surface in existing Events message area. Wrong cookie/secret and missing secret fail closed.
- Retired separate sidebar entry; old /admin/event-attendees redirects to /admin/events. Old HTTP POST returns 410; old Convex writer rejects even authenticated writes. Historical eventAttendees schema/data and authenticated read-only archive API remain; event deletion protection remains. No migration, copying, deletion or historical interest rewrite.
- Added both-gender approval/attendance matrix, revocation, historical-table isolation and bridge authorization tests; corrected recipient tests and mocked browser states.

## Preserved #37 behavior (combined diff vs base)
- One card message at a time, no inputs in State A, exact first-name instruction and three two-input rows with individual buttons in State B. Existing portal styling, spacing and responsive layout.
- Exact first token of stored name, Unicode NFKC/case/whitespace normalization; no fuzzy matching, surname/full-name fallback or applicant directory.
- Three lifetime platform-submission slots per event (withdrawn/declined still consume slots). Duplicate recipient rejected, old-event submissions do not consume new-event slots. Indexed quota read + insert is one Convex transaction; public manual create cannot impersonate platform submission. Existing admin/manual open-interest policy retained.
- Latest-event semantics retained from #37: among up to 100 most recent started matching-series events, exclude draft/cancelled/manual, select greatest endsAt (existing ordering). Scheduled but underway qualifies; future/Real Talk does not supersede. No seven-day expiry gate. New qualifying event locks old attendees until its own approval AND check-in. This is not newest-created event or newest attended event.
- Refresh/page load reflects check-in and revocation; no new realtime transport.

## Validation
- npm test: 77 tests / 12 files passed. Synthetic fixtures only, both genders, quota/duplicate simultaneous calls, rollover, approval vs attendance, no recipient attendance, revocation, first-name and existing privacy regressions.
- npx tsc --noEmit passed.
- npm run lint: zero errors, seven pre-existing warnings.
- npx playwright test -c playwright.issue37.config.ts: 2 mocked Chrome browser tests passed (both genders); State A for approved-only/attended-only, State B six inputs, quota receipts, refresh/revocation, styling/mobile overflow. All /api calls intercepted; preview-only local server used disabled backend URLs. Initial tests used locally available Playwright/Chrome. PR #39 build remediation adds @playwright/test to devDependencies and the lockfile so clean installs can type-check the committed browser tests.
- git diff --check passed. No live backend reads/writes, emails, deployments, credential changes or migration executed. Local server stopped after validation.

## Important deployment blockers / remaining risks
- Live #30 owner comment reports ATTENDANCE_ADMIN_SECRET absent and backend functions undeployed. This was NOT changed or live-rechecked. Existing Events check-in will fail closed with 503 until an authorized rollout supplies matching server/backend secret and deploys functions. Local mock success is not production E2E. Preview isolation remains intact; no production deployment authorized.
- Narrow hardening protects direct updateAttendanceStatus and retires separate writer, but this is NOT a comprehensive admin RPC security fix. Existing public events.updateRegistrationStatus can forge event approval for an already-attended row. Existing public events.backfillApril2026 can mark approved global applicants attended for April; public events.create/update can change latest-event selection. Combined, those legacy endpoints can still undermine trusted admin check-in. They remain unchanged rather than silently breaking existing admin flows; comprehensive authenticated bridges/retirement require follow-up before claiming production security. No guarantee that all check-in forgery is prevented.
- Synthetic convex-test simultaneous calls are regression evidence, not a deployed OCC load test. Browser API fixtures do not prove deployed Convex subscription behavior.

## Delivery
Moe authorized one combined PR after implementation. Scoped sources/tests/docs only; logs, test-results, credentials and build artifacts excluded. PR is for review, not merge/deploy approval. Supersession is documented here; #30 remains open and its original worktree retained.

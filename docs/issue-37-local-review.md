> Superseded by [combined #37/#38 review](issue-38-local-review.md). This file records the prior #37 preparation, not the current attendance contract or release status.

# Issue 37 — local review, not deployed

Base: origin/main 2cff643bc6b349af243656814611df48d87877bc (fetched 2026-10-20).
Branch: fix/issue-37-event-interest.
Checkout: /Users/moeghashim/taaruf/.worktrees/issue-37.
Live issue and comments read; no comments existed. Dirty main and existing worktrees untouched. Orca inventory checked: Taaruf is not registered/managed by the running Orca, so the existing repository-local .worktrees convention was used.

## Contract and decisions
- Exactly one message: attendance-only with no form before check-in; exact first-name instruction with three two-input rows and individual buttons after check-in. Uses existing panel-head, field, btn classes; message now sits in the padded, styled panel header.
- A submitted slot stays visible with disabled inputs and Submitted button. No recipient data is returned for these slot receipts. Refresh restores receipts even after decline/withdrawal/closure. Successful submission clears drafts; failures retain them. Concurrent clicks are UI-disabled and independently guarded server-side.
- Every successful applicant platform submission consumes one of three lifetime slots for that event, regardless of later status. Duplicate recipient at the same event is rejected even after withdrawal. Platform rows cannot be deleted via interests.remove. Older-event open interests do not block new-event submissions. Manual/admin workflow keeps its separate historical open-interest policy; it does not consume the applicant's three platform submissions.
- Latest event means most recent started, non-draft/non-cancelled matching-series event (existing endsAt ordering); future and Real Talk attendance-only events do not replace it. Admin check-in unlocks even while the event is underway. The prior seven-day interest-window gate is intentionally removed: issue37 specifies check-in, not window expiry, as the card switch.
- Both actual existing admin mechanisms inspected: Events page calls events.updateAttendanceStatus on eventRegistrations; Event Attendees page uses the cookie-authenticated API and secret-protected eventAttendees.setAttendance. Eligibility recognizes either existing source, and both writes now synchronize the two representations. No new attendance table or migration. Refresh is supported; no realtime subscription added to the existing HTTP dashboard.
- Existing requirement that recipient attended the same event remains; failures are generic verification errors. Existing requester pending/approved and completed-profile requirements remain. Both genders use identical quota logic, with female interests still private.
- First name is the first whitespace-delimited token of the existing full-name field (no structured first-name field exists). NFKC, whitespace trimming and case normalization only; accents/apostrophes/hyphens preserved, no fuzzy matching. Full-name and surname-only inputs fail. Compound given names with spaces require their first token.
- Quota indexed read, duplicate check, insert, and flow creation are in one Convex serializable mutation. Synthetic simultaneous-call tests pass; convex-test is not a deployed production OCC load test.

## Bypass and privacy boundaries
- Public interests.create previously allowed arbitrary caller-specified sender/source and bypassed applicant verification. It now requires the already-existing server-only ATTENDANCE_ADMIN_SECRET and refuses platform_submission even with that credential. Historical admin scripts calling this endpoint need to supply that existing credential; no credentials/config were read or modified.
- Profile-number legacy creation paths still fail without verified name; applicant helper forces platform_submission source. No directory added.
- This is NOT an application-wide security audit/fix. Adjacent public Convex admin endpoints (including legacy events.updateAttendanceStatus, interest status changes and reads) still lack comprehensive server-side admin authentication in this base. A caller could forge attendance through that pre-existing legacy endpoint. Hardening the full admin RPC surface requires a separate authenticated-admin architecture; deployment approval should explicitly consider this limitation. No claim that admin check-in is cryptographically trustworthy across the entire app.

## Validation
- npm test: 75 tests passed, 11 files. Includes male/female cap and duplicate races, event rollover, both check-in UIs and reversal, retained slots after decline/withdrawal, session/alternate-create rejection, first-name normalization and privacy regressions.
- npx tsc --noEmit: passed.
- npm run lint: zero errors, seven pre-existing warnings (generated disable directives and img warnings).
- npx playwright test -c playwright.issue37.config.ts: two mocked browser tests passed using installed Chrome (bundled headless executable unavailable). Male/female attendance states, exact text, six inputs/three buttons, disabled submitted slots, refresh/cap, matching 20px alignment/40px inputs/12px instruction and mobile overflow checks. All /api calls intercepted with synthetic fixtures; local server launched in review-only preview mode against a disabled backend URL. No emails or real records accessed.
- git diff --check: passed.
- No push/PR/comment/merge/deploy/config changes. Local preview server stopped after tests. Approval remains pending.

# Issue 46 — calendar birthdays and current ages

## Scope and release gate

Authorized by Layla (3267), clarified in 3270: applicants must be able to edit their own birthday under Profile. Preview only; no live frontend/backend changes, real profile mutations, emails, or backfill.

Isolated worktree: `.worktrees/issue46-birthday`, branch `feat/issue46-birthday`. Base `49ea4f6` preserves the search/event-label release from PR #108 and its live ancestor `ffe260e`. Dirty main is untouched.

## Review environment

The inherited preview middleware fails closed for API requests unless `PREVIEW_BACKEND_ISOLATED=true`. Existing preview credentials must not be used to access live applicant data. No isolated Convex backend has been provisioned or verified for this issue. The eventual hosted link is UI-review-only, not a working persistence preview. Do not submit real applicant data. Synthetic local tests are the persistence/privacy proof until an isolated backend is available.

## Compatibility / migration

DOB is a calendar date, not an instant. Ages use the program’s America/Chicago calendar day; February 29 birthdays age on March 1 in non-leap years. Existing numeric ages remain the fallback for profiles with unknown DOB. Never infer a birthday from a stored age. No bulk backfill is authorized or needed.

New signup and changed birthdays retain the existing 18–99 eligibility bounds. Aging an existing record does not silently remove program membership.

## Validation

Baseline isolated suite before edits: 67 files / 785 tests passed (`docs/evidence/issue46/baseline-tests.log`). Final verification and review findings will be recorded before publishing.

## Final local verification

Private registrationBirthdays table; only owner session/profile-token endpoints expose DOB. Admin/shared/matching projections expose current age. Clock cron at 05:00/06:00 UTC covers Chicago midnight; normal scheduler latency applies. No cron/backend has been deployed.

Review fixes: legacy enter/clear, unchanged DOB after age 100, event identity fallback using current age. Unknown legacy DOB stays empty; known DOB cannot be cleared. No backfill or invented birthdays.

- 829 tests / 71 files passed; TypeScript and production build passed (dummy Convex URL).
- Lint: 0 errors, 8 existing warnings. Impeccable detector: no findings.
- Real React synthetic browser: signup, signed-in Profile, token editor × 1280/390/320px; 9 combinations, zero network. Edit/save/remount, adult boundaries, privacy copy and no overflow; screenshots inspected. Not live backend E2E; payment/photo submission not exercised.
- Independent reviews and evidence: docs/evidence/issue46. Nested event/interest rollover and actual hosted cron invalidation are source-reviewed, not deployed-runtime tested.

## Remaining release prerequisites

Provision and verify an isolated backend before hosted persistence approval. After explicit live approval only, deploy additive schema, projections and clock together with frontend. No migration needed: legacy ages remain fallback until owners voluntarily supply DOB. No real profile updates or emails occurred. Existing preview middleware must continue failing closed.

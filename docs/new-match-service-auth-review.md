# New Match submit correction

Baseline: deployed91844a6 / dpl_8RMMgqxAQYxLz6RFMTx9KxUyMjwH. No opt-in/archive/merge work included.

## Demonstrated cause
The creation API used the browser admin password as the backend credential. Read-only production inspection proved the backend does not configure ADMIN_PASSWORD, while its established server-to-server ATTENDANCE_ADMIN_SECRET is present. Therefore matches.create always rejected live submissions before reading applicants. The prior local fixture mistakenly configured the browser password on both services, masking this deployment mismatch.

Read-only authenticated GET /api/admin/event-attendees returned200, proving the deployed frontend/backend existing service credential agrees; no secret values or applicant contents logged. No speculative live mutation made. Historical runtime logs are not available through installed Vercel CLI (live-tail only); diagnosis is based on exact deployed code and sanitized configuration evidence, not a fabricated error log.

## Narrow fix
Keep browser cookie authentication unchanged. Only new matches.create and its Next bridge use the existing server-only service credential. Missing service config gives actionable503. All eligibility, duplicate, self-match, photo and consent guards stay unchanged. No live environment changes needed.

## Full-flow verification
Actual fresh loopback Convex SQLite backend, no ADMIN_PASSWORD configured on backend; frontend has separate synthetic browser and service credentials. Actual browser at1440 and390: select pair -> POST -> persisted suggestion -> selected workbench -> both profiles and all six distinct spouse requirements rendered. Desktop requirement headings verified at same vertical position in distinct columns. Mobile both profiles remain available in responsive layout. Duplicate error and auth rejection verified; profile/interest/consent/share/email snapshots unchanged. Servers stopped after tests.

190 tests pass; typecheck/scoped lint/build gates recorded separately. Reproducible isolated fixture: ops/new-match-requirements-fixture.ts.txt (copy only into disposable backend), ops/new-match-requirements-browser.mjs (fixed loopback3340/3342). Never deploy fixture helpers.

Candidate only, not live. Preview approval remains required before coordinated backend/frontend correction rollout. Original live91844a6 still has submission failure until corrected deployment.

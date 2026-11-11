# New match — draft-only restoration

Based on verified live ffe260e0fb3d9c20e0a3a46aef96df87ea5a32da (PR101).

The workbench header restores **New match** on desktop and mobile. **Save draft** reuses the authenticated existing creation route, eligibility and duplicate checks. No consent is invented and creation sends no notifications or applicant-visible interests.

Manual unlinked suggestions remain private regardless of status. Sharing/notification routes reject them; bearer tokens created from them are unavailable. Drafts do not reserve applicants or prevent independently approved interests. Existing contact-release records retain provenance through pause/close; pre-existing context-free shares are not revoked by later drafts.

## Deliberate limitation
Issue #97 background opt-in and explicit presentation are not implemented here. There is no Present action, automatic conversion, global opt-out, or per-match withdrawal change. Existing final approval and photo permission do not substitute for background matchmaking opt-in.

## Preview safety
Backend changes are required. Hosted preview must remain UI-review-only, with the existing middleware API gate active, until a compatible isolated backend is configured. Do not submit real applicant data. No live backend deployment or data writes are authorized by this PR.

## Verification
- Full isolated Vitest suite: 789 tests, 68 files.
- Root and Convex TypeScript checks; production build.
- Scoped ESLint: no errors; one pre-existing image warning.
- Synthetic production-build Playwright checks: 1440, 390, 320px; open, select, save, navigation, private state, duplicate error, keyboard dismissal. Browser API responses mocked; all external network/websockets blocked. Screenshots reviewed.
- Real in-memory Convex route tests cover auth, eligibility, duplicates, no outbox/scheduler/network changes, applicant invisibility, direct share/token/notification bypasses, ordinary consent completion despite drafts, and legacy contact history.
- Independent review found no remaining blocker after historical pause correction; 87 focused tests independently passed.

Local evidence: repository privateops/restore-new-match-* logs/screenshots. Browser script: ops/restore-new-match-browser.mjs. Browser tests do not prove hosted backend integration.

# Event participant profiles

Admin → Events → select an event → click a participant name (also available on the waitlist). The shared Profiles editor opens in a keyboard-accessible drawer; Back to event/Escape returns to the same event, filters and roster position. Draft notes prompt before closing; failed saves preserve the draft. Profile facts, photos, notes, history, approval/rejection, revocation and deletion reuse the existing profile functionality.

## Scope
- **Global profile approval** changes the member profile only. It does not reserve an event seat or change confirmation/check-in. Existing applicable actions are preserved (approve/reject pending profiles; revoke approved profiles; delete with confirmation).
- **Event registration status** remains in the roster and uses the unchanged event mutation, including server-side capacity enforcement. No override is supplied.
- No email behavior, auth layout, backend function or schema was changed. Only a synthetic backend test was added under convex/.

## Verification
- npm test: 78 tests across 13 files (includes actual in-memory backend notes persistence, correct member targeting and capacity denial).
- npx tsc --noEmit; npm run lint (existing warnings only).
- node scripts/test-event-profiles.cjs: real React components with in-memory Convex adapter; keyboard activation/focus return, saved/failed/unsaved notes, two profile identities, approval/rejection scope, capacity error, missing/loading/query-error states, desktop/mobile sizing; zero external requests. Requires Chrome and the existing esbuild/Playwright dev dependencies. Screenshots stay in .event-profile-test/.
- npx next build: production webpack build. Local npm run build (Turbopack) encountered an existing Google font URL query parsing failure; hosted build status must be checked separately.

## Preview gate and limitations
No verified isolated hosted backend is available. Existing preview middleware blocks API access and the provider disables live Convex connections unless PREVIEW_BACKEND_ISOLATED=true. Keep those guards enabled. Preview is UI-review-only; do not submit real data. Admin sign-in requires the existing admin password; deployment protection may require Vercel team access. Hosted functional testing is blocked until a separate synthetic backend is configured. No production data, emails, merge, or Convex deployment is part of this change.

Existing public Convex profile mutations rely on the application's admin shell gate rather than backend identity checks; this change reuses them without expanding their contract. Backend authorization hardening remains a pre-existing limitation, not a security guarantee from these UI tests.

# Admin-selected interest submissions — preview candidate

## Policy
One matching event may be explicitly ON. Nothing is enabled by default or backfilled. A second ON is rejected atomically with instructions to turn the current event OFF first. Dates and historical submission windows do not close or select it. Draft/cancelled events fail closed; turn OFF before cancellation/draft/deletion. OFF retains history. Repeated identical toggles are idempotent. Changed state records server timestamp and authenticated shared-admin actor in an append-only audit table (shared password cannot identify a named person).

Sender eligibility requires the SAME selected event registration approved + confirmed + admin checked in. Global pending/approved sender status and recipient policy are preserved; the recipient need not be on an event roster. Requests bind expectedEventId and recheck eligibility transactionally. Three lifetime submissions per event, duplicate rules, consent and profile checks remain.

Applicant availability refreshes using a private read-only narrow query every three seconds while visible and on focus; no session touches. Errors pause submission. Backend remains authoritative for stale requests.

## Validation
- 231 tests / 27 files pass (baseline190). Typecheck passes. Lint passes with7 existing warnings. Production build passes.
- Independent review: no high-severity issue; medium full-dashboard polling read amplification resolved with narrow getInterestEligibility and parity/no-session-write regression.
- Actual loopback Convex:20 independent-client ON races,21 OCC retries in final run, sender conditions, recipient off-roster, future/expired window, OFF/history/stale, lifecycle race and audit checks pass. Five source hashes match; see ops/interest-backend-validation.md.
- Desktop/mobile browser verification is recorded separately in ops/interest-browser artifacts.

## Release gate and limitations
No live applicant reads/writes, live toggle, backfill, production deployment or merge. Existing Vercel preview environment is not a verified isolated backend. Cloud preview must remain UI-review-only, APIs blocked and client/server backend URLs non-routable. Do not submit real applicant data. Functional hosted approval requires provisioned isolated synthetic Convex backend with matching server/client URLs and credentials; loopback proof does not establish hosted functional compatibility. Live deployment remains gated on explicit preview approval.

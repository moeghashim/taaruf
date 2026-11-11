# Issue 46 independent review — initial implementation snapshot

Reviewed 2026-11-10, base `49ea4f6ec825ec3eac0e37d28985b1a969653574`. Read-only source review; this report is the only authored file. No deployment, live data access, or profile mutations. Read repository AGENTS and Convex guidelines.

## Disposition

**Not a final implementation approval.** Backend/frontend workers were actively writing. At review cutoff, the DOB helper/schema/backend integration and clock did not yet exist as complete reviewable changes. Partial frontend/API changes were inspected. Do not interpret intermediate missing imports/partially written files as final defects. Parent should request a follow-up against the finished diff. No test execution claimed; baseline 785 tests is another worker's recorded evidence.

## Actionable findings in the reviewed frontend/API diff

### P2: Leaving a legacy birthday blank stops working after interacting with its input

`src/components/date-of-birth-field.tsx` promises an unknown birthday may be left blank, but calls `onChange(event.target.value)` and distinguishes only `undefined` from known DOB. Both owner forms validate every non-undefined DOB; both POST routes likewise validate every supplied DOB. Reproduction: load legacy owner with no birthday, enter a date, then clear it, and save another profile change. State becomes empty string rather than undefined, so blank is rejected. This unnecessarily blocks an unrelated save despite the explicit compatibility promise. Preserve an initial-known-DOB flag and omit a cleared field only for legacy unknown-DOB owners; do not silently permit deleting an existing DOB. Test both session and token editors.

### P2: Unchanged DOB will block all profile edits on the owner's 100th birthday

Both owner editors submit `dateOfBirth` whenever it is present, even unchanged; `src/app/api/applicant/profile/route.ts` and `src/app/api/profile/[token]/route.ts` unconditionally enforce the 18–99 rule whenever DOB is supplied. Therefore an existing DOB-backed profile naturally turning 100 cannot save education/bio/photo-consent changes. The scope document says eligibility applies to **new signup and changed birthdays**, and aging must not silently remove membership. Send DOB only when changed (and have backend compare supplied DOB against stored DOB before applying update-specific eligibility), or explicitly resolve a different product rule. Add a test with unchanged DOB aged 100 plus unrelated profile update, and a test rejecting a genuinely changed DOB producing age 100.

## Architecture audit and acceptance requirements

- Current schema stores `registrations.age` as a number. Existing admin queries frequently return/spread complete registration documents (registration list/details, interest/match joins, profile share admin list). Put DOB only in a separate private table indexed uniquely by registration ID; never join DOB into generic registration objects. Private-table helpers must not expose a public arbitrary-registration lookup.
- Owner session reads/writes are `convex/applicantProfile.ts:getProfile/updateProfile`; identity derives from `applicantSessions` and `sessionAllowed`. Owner bearer-link reads/writes are `convex/registrations.ts:getByProfileAccessToken/updateProfile`, gated by `profileCapabilityAllowed`. Perform authorization before private-table access and preserve session expiration/revocation/security-cutoff behavior. No caller-selected registration ID should override owner identity.
- The inspected API diff validates DOB before constructing Stripe checkout and does not place it in Stripe metadata. Good direction; final date helper must accept unknown runtime values safely and reject malformed/impossible dates before any Stripe call. Both API and Convex mutation need authoritative validation; ignore forged client age in favor of DOB-derived age.
- Existing public age projections include `convex/applicantInterests.ts:safeCounterparty` and `convex/profileShares.ts:getByShareToken`. Admin interest/match/profile queries return registrations indirectly. Review all such surfaces, not only the registration list. Never return DOB to counterparties, share-token owners, attendee records, checkout receipts, email/outbox payloads, or logs.
- `Date.now()` in a Convex query does not itself invalidate cached results/subscriptions when midnight passes. Every DOB-derived query needs a tracked clock document read and an internal scheduled mutation that changes it at the appropriate cadence. A query that does not read the clock remains stale. Define acceptable rollover delay; no browser/server-local timezone drift. Scheduler deployment is required eventually but is not authorized live in this task.
- Use America/Chicago calendar dates, not UTC instant parsing or 365-day arithmetic. February 29 becomes a new age on March 1 in non-leap years. Shared frontend/server implementation should agree at Chicago midnight (UTC offset changes with DST).
- Unknown DOB must preserve stored numeric age exactly; never fabricate or backfill a birthday. Automatically aged existing members must not be removed or clamped at 99.
- `registrations.ts:findExistingParticipantProfile` uses stored `registration.age` for name/gender/age fallback matching. If DOB-backed age is calculated only in output projections, this secondary matching branch can become stale after a birthday. Use current age consistently or document intentional legacy identity semantics.
- Existing public event signup may reuse a profile based on email/phone/name+age without an authenticated owner session. **Do not use that branch to overwrite or initially populate an existing person's private DOB from submitted signup data.** Only fresh registration creation and authenticated owner changes should write it. Verify private records are cleaned up with actual registration deletion without touching permanent public-number allocation.

## Required focused tests before final review

1. Date parsing: null/object/number/empty/whitespace, non-ISO, impossible dates (April 31, February 30), non-leap February 29, future DOB, timezone-suffixed datetime. Return generic validation errors that never echo DOB.
2. Eligibility: one day before/at 18, final day of 99/at 100, Chicago midnight while UTC calendar differs, winter/summer offsets, leap-day March 1 transition.
3. Stripe spies: every invalid DOB results in HTTP 400 and zero checkout calls; forged age is ignored; valid DOB remains absent from metadata/product text/logs.
4. Owner session/token roundtrips; update cannot target another owner; invalid/revoked/expired/cutoff capabilities cannot read/write; supplied extra ID cannot redirect ownership.
5. Legacy unknown DOB preserves age and allows unrelated updates; entered-then-cleared legacy input; unchanged DOB after age 100; rejection of genuinely changed invalid DOB.
6. Recursively inspect admin lists/details, both interest directions, matches, event attendees, share-token response, receipts, and outbox/email payloads for DOB keys AND synthetic DOB value. Owner-only endpoints are the explicit exception.
7. Clock dependency: validate same-argument age query after clock mutation and birthday rollover, including share and nested counterparty/admin projections. Unit fake timers alone do not prove Convex production cache invalidation; inspect tracked dependency wiring and cron declaration too.
8. Existing-event identity reuse must leave DOB untouched; second new signup cannot create duplicate private records; delete behavior and permanent applicant numbers remain unchanged.

## Follow-up boundary

At cutoff the frontend/API diff was present but backend implementation was still being written. Final schema, helper, clock, cron, full projection coverage, actual privacy tests, and full suite/typecheck/build results remain unreviewed. The two frontend findings above are against the observed partial diff and should be rechecked after workers finish.

# Issue 46 — final independent review

Reviewed 2026-11-10 ~21:40 CST against the uncommitted implementation on base `49ea4f6ec825ec3eac0e37d28985b1a969653574`. Source-review only except local synthetic tests. No source changes, live data access, deployment, or real profile writes. This report is the only file authored by this reviewer. Concurrent frontend fixes were not assumed complete.

## Disposition: changes requested

One additional actionable P2 remains in backend event identity reuse. No new DOB disclosure or authorization bypass was identified in the inspected implementation. The two earlier owner-editor findings (legacy entered-then-cleared input and unchanged DOB at age 100) are assigned to another worker and are not duplicated here; their resolution and regression tests remain prerequisites for approval.

### P2 — event signup fallback matches against frozen age after a birthday

`convex/registrations.ts:197–210`, `findExistingParticipantProfile`, compares both canonical-name and legacy-name candidates using `registration.age === args.age`. For DOB-backed registrations that stored number is intentionally unchanged on daily rollover, while the incoming signup age is freshly calculated from DOB at lines 423–430.

Reproduction from inspected control flow: create a member born 2000-11-11 on November 10, 2026 (stored age 25); advance to November 11 (displayed age 26); submit an event signup with the same normalized name/gender/DOB but changed email and phone. Email/phone branches miss; both name branches compare 25 against 26 and miss; `create` allocates a new registration and public applicant number rather than reusing the existing member. Before the birthday that fallback succeeds. A second same-name candidate can also be chosen based on stale rather than current ages.

Fix: use `await currentAge(ctx, candidate)` for eligible same-name/gender candidates in both fallback branches, preserving existing ambiguity behavior and unknown-DOB numeric fallback. Add a synthetic event-reuse test across birthday rollover with changed contact identifiers, asserting the original registration ID, original permanent number, unchanged DOB, and unchanged registration count. This was explicitly called out as an acceptance requirement in the initial review and remains unresolved. This finding is source-proven; no temporary reproduction test was added.

## Verified architecture and behavior

- DOB is stored only in `registrationBirthdays`, not spreadable registration documents. Helpers are ordinary exported TypeScript functions, not public Convex query/mutation endpoints. The only registered birthday endpoint is internal `tick`.
- Session owner reads/writes resolve identity from the session and apply `sessionAllowed`; bearer-profile access applies `profileCapabilityAllowed` before joining or writing DOB. No new caller-selected registration ID is accepted. Existing expiration/revocation/security-cutoff checks remain in place.
- Public event signup reuse returns before `saveDateOfBirth`, so submitted DOB cannot overwrite or initially populate an existing person’s private birthday through that unauthenticated flow. New registrations write DOB transactionally; existing owner edits upsert a single indexed row. Registration deletion removes that private row without modifying the permanent-number high-water mark.
- `currentAge` reads the indexed `birthdayCalendarDay` setting before deriving age. Empty index-range reads also create a tracked dependency, allowing the first tick insertion to invalidate existing queries. Cron runs at 05:00 and 06:00 UTC, covering Chicago midnight in summer and winter; unchanged local days cause no write. The existing crons are preserved. This is a sound tracked-clock design, with normal scheduler execution latency rather than a guaranteed exact-second rollover. Actual hosted scheduling/subscription behavior was not exercised.
- Current-age projection covers registrations/admin lookup/list, applicant session/profile, both applicant counterparties through `safeCounterparty`, female review, admin interest and match joins/workbench, event registration/waitlist serializers, and share responses. `eventAttendees` explicitly projects no age or birthday. The remaining stale-age use found is identity reuse above.
- Calendar arithmetic uses America/Chicago and March 1 for Feb 29 in non-leap years. Unknown DOB retains stored numeric age; normal reads do not clamp naturally aged members at 99.
- Checkout validates unknown runtime input before Stripe calls and ignores forged client age. DOB is absent from Stripe metadata/product text; generic checkout logging does not echo it. Owner-only response objects are the intended DOB exceptions. No changed mail, outbox, or receipt payload acquires DOB.

## Tests run independently

- `npm test -- convex/birthdays.test.ts src/app/api/birthday.test.ts convex/registrations.test.ts convex/events.test.ts`: **4 files / 71 tests passed**.
- `npm test`: **70 files / 824 tests passed**, 3.12s, run started 21:39:58 CST.
- No build, typecheck, browser test, hosted backend test, or deployment claimed by this review.

The tests establish signup/private storage, authoritative validation, owner persistence/omission, invalid/revoked/expired session rejection, unknown-DOB fallback, Chicago/DST/leap calendar boundaries, admin rollover, deletion, and absence of DOB from tested admin/share/match outputs. Existing broader security suites also pass. The birthday-specific suite does **not** yet explicitly exercise event reuse with a birthday, nested interest/event rollover plus DOB-value absence, or real Convex subscription invalidation; do not represent those as tested. Static isolation/projection wiring was inspected for those paths.

## Approval gate

Fix the stale-age event fallback and prove its regression test; complete the separately assigned two owner-editor fixes (including backend unchanged-DOB handling, not just client omission); rerun tests against that final diff. Subject to those changes and the parent’s type/build/UI checks, no other implementation blocker was found. Hosted persistence verification still requires the isolated backend described in `docs/issue46-birthday-review.md`; this report does not authorize live deployment.

## Independent closeout — 2026-11-10 21:42 CST

**Disposition: approved for UI-only preview, subject to the parent’s type/build/UI checks.** The three reported source defects are resolved in the inspected checkout; no remaining blocker to that limited preview was found. This supersedes the changes-requested disposition above, not the live-deployment restrictions.

- Both canonical-name and legacy-name event identity fallbacks now project current age before comparing. The new `convex/birthdayIdentity.test.ts` passes a birthday rollover with changed contact identifiers, reuses the original registration ID, and proves the private birthday is not overwritten.
- Both owner editors capture the loaded original DOB, use `changedDateOfBirth` for field validation and submission, omit a cleared originally-unknown value and an unchanged age-100 DOB, and reload the original after saving. Clearing a known DOB remains rejected.
- `saveDateOfBirth` checks equality with the existing private row before eligibility validation; both authenticated mutation paths use it. Regression tests exercise unrelated saves with omitted and explicitly unchanged DOB after turning 100, while rejecting a changed age-100 DOB.

Independent focused run at 21:41:46 CST: `npm test -- convex/birthdayIdentity.test.ts convex/birthdays.test.ts src/lib/date-of-birth.test.ts src/app/api/birthday.test.ts convex/registrations.test.ts convex/events.test.ts` — **5 files / 75 tests passed**. The named `src/lib/date-of-birth.test.ts` does not exist; helper/editor-policy regressions actually reside in `src/app/api/birthday.test.ts` and were run. No browser, build, typecheck, full-suite rerun, hosted backend verification, or deployment was performed in this closeout.

Nonblocking evidence limitations for this UI-only preview: the new identity test directly covers the canonical fallback, not a separately forced legacy fallback; it asserts ID and private-row preservation but does not explicitly assert permanent-number or total-registration-count invariants. Both fallback fixes were inspected. Full production acceptance still needs the isolated-backend persistence/subscription verification and broader evidence described above. HTTP routes still reject an explicitly supplied age-100 DOB; current editors correctly omit unchanged values, while the direct backend mutations independently accept them.

Signed: independent closeout reviewer `b8c3561d-a43e-47ee-9791-213f03389baa` (OpenAI GPT-6 Astra). Review-only: this appendix is the only authored change; no source edits or deployment.

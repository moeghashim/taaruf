# Independent privacy review — implementation snapshot 20:33 CST

Read-only implementation review; synthetic tests added, no deployment/data/email. This is an evolving snapshot, not final signoff.

## Findings (latest update20:33:16)

1. **FIXED DURING REVIEW — retained contact-shared records could be physically deleted.** `convex/matches.ts` resetPair deletion loop (~188) and deletePairConnection (~343) do not exempt new presented/contact-shared manual records. Synthetic repro: create → present → approve both → releaseContacts → resetPair deletes match (test passes proving defect). Ordinary admin reset must not remove these retained records. Both reset/delete now have retention guards at matches.ts191/335. Independent reset regression passes. Registration deletion interaction remains worth checking.
2. **P1 unlinked bearer profile shares bypass individual withdrawal.** `convex/profileShares.ts:14-22` guards context-free shares only while isManualMatchDraft; once presented that becomes false permanently, even after withdrawal. Repro: present → profileShares.create without matchId/interestId → applicant withdraw → getByShareToken still returns profile. The same context-free create also succeeds after withdrawal. Require explicit lifecycle-aware pair authorization for new shares and deny prior lifecycle-linked context-free shares after withdrawal without revoking older legitimate linked history. Alternatively disallow new context-free shares for lifecycle pairs and bind presented share creation to matchId.

## Fixed during review

Initial `markContactSharedNotificationSent` timestamp-only bypass was fixed concurrently before test execution: attempting receipt on unpresented draft now throws “Contacts must be released before recording notification”. This was independently observed in test run, not remaining blocker.

## Evidence

`convex/issue97IndependentReview.test.ts`: at20:33:16 three tests pass: two fixed regressions and ONE REMAINING unsafe-behavior repro for context-free share withdrawal. Convert that final repro to regression expectations after repair; do not ship it asserting unsafe behavior.

Other observations: presentation transaction checks both current optins and profile eligibility; contact release uses mutual explicit approval; global optout does not invalidate already presented match (consistent with future-only scope). no/ask photo policy denies photos. Followup projection includes authorRegistrationId; owner already noted minimizing it. Pending notification sender integration intentionally excluded from this intermediate review.

## Repair verification
Context-free shares now require explicit match lifecycle binding for presented pairs. Tests cover both directions, stale bearer links after withdrawal, and preservation of older legitimate history; unsafe repro converted to regression.

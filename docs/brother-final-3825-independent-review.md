# Independent initial security review — implementation gate

Reviewed baseline 5a80a4d, not final patch. No production operations.

1. Initial Accept must not invoke recordPairApproval or return approved; brotherAcceptedAt must never be fallback informed consent.
2. Sister final must persist even if no match yet (either order).
3. Explicit source markers must never propagate to sibling rows. Legacy flags, timestamps and final_approval_given events are ambiguous because old Accept wrote them.
4. applicantInterests.giveFinalApproval must require interestBioVisible exact-interest predicate, not synthetic bioVisibleAt. ensureFlow/join can synthesize timestamps without recipient acceptance.
5. femaleInterestWorkflow.getReviewAccess email/phone should use validated contactsVisible result, not only workflow.state/adminReleasedAt.
6. Preserve actual same-event reciprocal explicit decisions; no copied initial consent/photo consent. Existing matches narrowly grandfathered must not authorize new unmatched reciprocal rows.
7. Unmatched legacy fresh explicit evidence must be recordable without clearing history or treating old flags as consent. Existing matches preserve identity/status/history; unreleased legacy re-confirmation is a separate explicit release-policy decision.

Final review must cover repeated/stale/race clicks, either final order, same/cross-event reciprocal evidence, reset/archive/revoke/expiry, malformed linkage, contact release validation, and both role browser actions. Baseline tests must be updated to assert actual three-step consent flow, not weaken gates.


## Final-diff review, first pass: NOT APPROVED
- Generic final bio gate and contact projection fixes assigned with genuine regression tests.
- Additional high-severity finding: excluding historical revoked/closed/reset female origins made their propagated reciprocal legacy approval flags appear genuine. Provenance resolution must inspect preserved historical same-event origins, not only active rows. Fix and dedicated tests assigned.
- Accepted-but-expired reviews cannot currently be renewed by createReview. Recovery policy remains an explicit separate decision; do not reset or resurrect legacy links as part of this patch.
- Browser results use isolated synthetic route fixtures, not a deployed isolated backend.


## Final fixed-diff review: APPROVED FOR PR-ONLY STAGING
Independent reviewer verified all three fixes and found no remaining blocking findings in the final diff against 5a80a4d. Reviewed separate actions, either final order, retries, contradictory decisions, reciprocal provenance, lifecycle guards and frontend stage handling. Independently ran 1,372 tests across 114 files, all passed, plus diff check. Historical-match release compatibility, expired-review recovery and deployed isolated-backend proof remain release gates—not implied approvals.


## Integrated live-PR148 final review: APPROVED FOR PR-ONLY STAGING
Reviewed substantive application SHA 830c4af3abc431b2db643cf066e7b2bd61788f4b plus tests/documentation-only follow-up. Verified live ec45f483 ancestry. Independently passed 1,378 tests / 115 files, typecheck and diff check. Prior integrated lifecycle fixture blocker resolved with no-match assertion before brotherFinal. Inspected actual localhost browser→Next→Convex scripts/proof/logs (10 browser POSTs HTTP200, both approval orders and either decline); application files match reviewed source. Historical admin-release compatibility remains an explicit policy gate. Preexisting shared Inbound placement of sister selected controls is not a new regression. No deployment or human certification granted.

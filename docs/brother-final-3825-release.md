# Initial acceptance and explicit final bio consent

## Scope and base
- Isolated branch starts at live PR147 SHA 5a80a4d729514cfdab5f8ad3007ca73844241611.
- PR148 candidate 4d12c3f23be590885f13e576572a14d617e4e614 is NOT an ancestor and is not included.
- No production backend/frontend deployment, migration, applicant mutation, email activation, configuration change, or human DCO authorization is part of implementation.
- Original dirty checkout and existing worktrees/history are preserved.

## Release gate (backend first)
1. Review exact candidate source SHA, independent consent/security review, backend transition tests, route tests, browser fixtures, types/lint/build.
2. An isolated preview backend is required for genuine end-to-end applicant approval testing. A frontend-only Vercel preview does NOT prove backend behavior; do not submit real applicant decisions there.
3. Obtain contribution-specific human DCO and explicit preview/release approval. This document is neither.
4. Recheck serving ancestry/module hashes at release time, preserving any intervening releases. Deploy additive backend/schema to the serving backend first, then the matching frontend. Do not deploy to default tidy-panda.
5. Old frontend initial Accept against new backend must remain initial-only. New frontend must not synthesize final authority from missing stage metadata on an old backend. Verify both skew cases before release.
6. Rollback must retain additive schema/evidence fields and must not restore the old implicit-final backend once new approvals are stored.

## Match versus contact disclosure
An internal pending-admin match is not contact release. Both explicit final consents permit existing pair aggregation to create/link the internal match; sharing email/phone still requires the independent admin release gate. Initial acceptance alone must never call pair joining, even if another approval exists. Do not broaden creation rules beyond separating initial and final consent.

## PR148 compatibility
PR148's overlapping female-reviews hunk dispatches applicant-interest-updated following a successful POST; its classification changes are separate. Preserve that event when combining later; do not cherry-pick the full candidate into this release. Re-test outbound routing and final-stage notification classification on the eventual combined head.

## Historical handling
- Optional requesterExplicitFinalAt/recipientExplicitFinalAt record only fresh authenticated source actions; they are never propagated onto reciprocal rows.
- Ambiguous unmatched brother approvals (including old propagated events) do not authorize joining. Preserved closed/revoked/reset same-event female origins are considered when detecting ambiguity. Missing origin acceptance timestamps conservatively require fresh consent. Genuine timestamp-distinct reciprocal final events remain recognized.
- No bulk backfill, clearing, match mutation, or migration runs on deployment. A fresh explicit final action records its own new evidence; it is not a retrospective certification of the old click.
- Already matched historical records retain their previous admin-release eligibility and disclosure history. Approval retries do not retroactively certify them. **Release decision required:** approve this compatibility boundary, or separately authorize a historical audit/reconfirmation policy. This implementation does not pretend all historical matches have newly informed consent.
- Accepted-but-expired brother reviews fail closed. Current admin reissue only supports the initial stage. **Separate recovery decision required** for those rows; no resets, silent token resurrection, or bulk renewal included.

## Changed deployed modules
- schema.ts: additive optional source-consent fields.
- femaleInterestWorkflow.ts: initial-only acceptance, separate brotherFinal, independent sister final, private stage projection, validated contact fields.
- contactGate.ts: source-only evidence, conservative historical same-event provenance, reciprocal joining without invented initial acceptance.
- applicantInterests.ts: exact-interest bio gate for generic final actions and action availability.
- sisterConfirmationActivation.ts: stop confirmation eligibility after the sister has explicitly confirmed even while brother final is outstanding.
- Frontend/API: applicant female-review route, FemaleReviews, ReviewNextSteps, stage-aware received-interest notification helper.

## Validation boundary
Convex-test executes real backend handlers against isolated in-memory data. Browser tests exercise real frontend components with synthetic API interception and outbound-network blocking. Hosted preview APIs remain disabled by existing preview-isolation middleware; a deployed isolated backend is still required for live-like full-stack approval testing.

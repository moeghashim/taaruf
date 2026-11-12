# Initial acceptance and explicit final bio consent

## Scope and base
- Isolated branch starts at live PR147 SHA 5a80a4d729514cfdab5f8ad3007ca73844241611.
- Initial candidate fb83129565e44b9d3c7a6dfd0298fdc39b40c1e9 excluded then-unreleased PR148. Superseding user instruction: PR148 is now LIVE at ec45f4838c0d7a74c461bdfbb42f43781e7ecffe; merge 830c4af preserves that ancestry append-only. Both original candidates and published history remain intact.
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
PR148 is now integrated from its certified live SHA. The overlapping female-reviews hunk retains applicant-interest-updated following a successful POST, with sister reviews routed under Outbound. Integrated tests must cover outbound routing plus final-stage notification classification.

## Historical handling
- Optional requesterExplicitFinalAt/recipientExplicitFinalAt record only fresh authenticated source actions; they are never propagated onto reciprocal rows.
- Ambiguous unmatched brother approvals (including old propagated events) do not authorize joining. Preserved closed/revoked/reset same-event female origins are considered when detecting ambiguity. Missing origin acceptance timestamps conservatively require fresh consent. Genuine timestamp-distinct reciprocal final events remain recognized.
- No bulk backfill, clearing, match mutation, or migration runs on deployment. A fresh explicit final action records its own new evidence; it is not a retrospective certification of the old click.
- Already matched historical records retain their previous admin-release eligibility and disclosure history. Approval retries do not retroactively certify them. **Safety consequence:** an unreleased legacy pending match whose brother approval came from the old initial click can still be released by an admin without a new post-bio brother final. The new source markers are required for new joins, not retroactively required by releasePairContacts for an existing match. **Explicit policy decision required before release:** either knowingly preserve this grandfathered eligibility, or separately authorize a narrowly scoped hold/reconfirmation design for unreleased legacy matches. No historic migration, hold, re-confirmation, reset, or contact release has been executed. Already disclosed contacts/history must remain preserved.
- Accepted-but-expired brother reviews fail closed. Current admin reissue only supports the initial stage. **Separate recovery decision required** for those rows; no resets, silent token resurrection, or bulk renewal included.

## Changed deployed modules
- schema.ts: additive optional source-consent fields.
- femaleInterestWorkflow.ts: initial-only acceptance, separate brotherFinal, independent sister final, private stage projection, validated contact fields.
- contactGate.ts: source-only evidence, conservative historical same-event provenance, reciprocal joining without invented initial acceptance.
- applicantInterests.ts: exact-interest bio gate for generic final actions and action availability.
- sisterConfirmationActivation.ts: stop confirmation eligibility after the sister has explicitly confirmed even while brother final is outstanding.
- Frontend/API: applicant female-review route, FemaleReviews, ReviewNextSteps, stage-aware received-interest notification helper.

## Validation boundary
Convex-test executes real backend handlers against isolated in-memory data. Eleven initial browser cases used synthetic interception. Superseding proof: actual Chromium → unmodified Next API → actual cached local Convex backend passed on application SHA 830c4af3abc431b2db643cf066e7b2bd61788f4b, fresh synthetic SQLite/storage, no mocks. Both final-approval orders and either final decline passed; initial-only no-final/no-match and pre-release contact privacy verified. Legacy pending-match release eligibility separately proved on synthetic data. Evidence: privateops/brother-final3825-fullstack/{README.md,proof.json,legacy-proof.json,SHA256SUMS}. No paid resources or hosted backend touched; local servers stopped. Hosted Vercel preview remains UI-review-only and SSO-protected; localhost proof is not hosted end-to-end proof.

Existing UI caveat preserved from live PR148: sister row is correctly Outbound, but selected review controls mount in the shared Inbound section (same FemaleReviews placement in latest live source). Actual outbound-row navigation and final controls work; relocating that shared panel is a separate UI correction, not a consent bypass.

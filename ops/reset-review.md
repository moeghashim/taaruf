# Admin test submission reset — release review

Baseline: live ac5db90. No production deployment or applicant data operation authorized/performed.

## Semantics
No existing test designation exists. An authenticated admin explicitly designates one selected submission as test data by confirming its applicant pair/event and giving a 10–500 character reason. No name heuristics, hardcoded applicant numbers, bulk reset or permanent quota exemption.

The transaction preserves the interest, original source, workflow and historical events; appends admin audit reason/time; closes the workflow and clears photo grant state. Quota and duplicate checks exclude only reset rows before limiting results. Repeat calls are no-ops. Normal closed/declined/withdrawn submissions still consume the three-per-event cap. A new submission after reset is a new record and consumes a slot normally.

Fails closed for missing workflow, any reciprocal history, pair match history (including closed), contact disclosure or pair-reset audit, and profile-share history. No cascading deletion, match cleanup, queue promotion, contact recall, notification or email. Already-issued/downloaded photo URLs cannot be recalled; no new grant or portal exposure is issued through the reset workflow.

Admin HTTP bridge verifies admin cookie, same-origin request, explicit confirmation and server-held service secret. Convex independently verifies service authorization. Reset records reject stale applicant/admin mutations and sharing; ordinary pair deletion cannot erase platform submissions/audit. See [the current authorization remediation](../docs/issue58-photo-consent.md#limits-and-release-gate) for the broader service boundary.

## Validation
249 tests pass (30 files), including nine new backend and eight bridge tests. TypeScript and scoped ESLint pass; design detector reports no findings. Independent review found and corrected pair-delete audit bypass, stale share creation, and 20/100-row truncation issues. Real isolated backend/browser proof tracked separately.

## Release gate
Preview approval is required before deployment to either live-serving Convex or website. Hosted preview without isolated backend is UI-review-only; API writes fail closed. Exact live record approval is separately required before any test reset. No live reset has been performed.

## Integration
Overlaps issue58 in schema.ts, applicantInterests.ts, interestRules.ts, profileShares.ts and potentially generated API. Preserve both consent and reset guards; explicitly reject reset interests in any new issue58 photo mutation/read path. Re-run combined tests before release.

# Hide public remaining-spots counts

## Scope
Home active-event pills now say “Sisters open” / “Brothers open”, or retain the gender-specific “waitlist” status. Numeric availability is removed from rendered markup, not hidden with CSS or accessibility labels. Registration routes/form and the applicant event listing already had no gender availability counts; regression checks cover these unchanged surfaces. Admin operational counts, event data, backend, schema, 60/60 caps, FIFO promotion to Pending, explicit approval, and receipt behavior are unchanged. This is not an API privacy change.

## Baseline and release gate
Based on `5c2ad0e` from still-open PR #41, not old main. Verified current production alias maps to Ready deployment `dpl_9caLwdSnUn3tSaceArLN58ypcS9L`, matching PRODUCTION-RELEASE-PROVENANCE.md. Application files at 5c2ad0e match deployed application snapshot 3819d32. Fresh live rendering on November 3 showed Sisters 12 open / Brothers 39 open (counts have changed since the supplied screenshot).

Production remains gated on explicit preview approval. This PR should target the release branch so only this narrow delta is reviewed; do not deploy old main or merge unrelated source. Existing preview middleware blocks API access without an isolated backend. Preview is UI-review-only: do not submit applicant data.

## Verification
- 138 tests in 21 files pass, including six new public-render/status/admin regression tests and existing waitlist, approval, receipt, and preview-isolation tests.
- TypeScript passes. ESLint has zero errors and seven existing warnings.
- Impeccable context and craft-floor reviewed; incumbent design retained. Detector returned no findings.
- Local build/render and hosted preview evidence are recorded in the release handoff.

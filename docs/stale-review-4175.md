# Stale review recovery (4175)

The selected female review is taken from the URL, not browser storage. Reset rows are excluded from the dashboard and denied by getReviewAccess. The detail request is independent of the list. Login intentionally preserves femaleReview in its next destination, so signing in again does not discard an obsolete selection. Retrying repeats the denied request. Empty lists cannot prove revocation (pagination), and the API uses409 for all non-auth backend exceptions; therefore automatically swallowing409 would also hide outages.

Add an explicit **Return to portal** action alongside the existing error/login/retry controls. It replaces the obsolete URL, removes femaleReview and reviewToken, synchronizes the portal selection and discards obsolete read responses. Existing errors remain visible until the applicant deliberately leaves; list failures remain retryable. Standalone reviews perform a real navigation to /me. No backend runtime logic, grants, consent, tokens, reset history or contacts are changed.

Validation:1471 tests across122 files; root and Convex typechecks; scoped lint; webpack production build. Synthetic reset-marker and new-session regression demonstrates absent list and denied old link remain unchanged after reauthentication; HTTP tests preserve401 and409 failures. Responsive browser proof is recorded separately in privateops/review4175. This identifies a reproducible mechanism matching the report, not the identity/state of the user's particular pair.

Preview only; production deployment and contribution-specific human DCO require fresh approval. A hosted preview may use the live backend: UI review only, no real submissions, decisions, resets, contact actions or emails.

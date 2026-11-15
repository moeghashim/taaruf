# Administrative removal of a paused real connection

This is not a test reset and does not assert participant decline or new consent.
The internal-only adminRemovePausedPair preview/remove functions require exact match ID,
directional registration IDs, permanent public numbers, a paused non-test match,
currently eligible profiles, and an unchanged SHA-256 state fingerprint. Unknown,
foreign, in-flight, oversized or changed state fails atomically. A distinct restricted
audit records the request and before snapshot; identical retries are idempotent.

Removal deletes only the selected match, closes its linked real platform interests
and flows, revokes female review capabilities and profile shares, clears only exact
active pointers, cancels unsent deliveries and removes unsent matchmaker notifications.
Historical participant decisions and sent/provider-accepted receipts remain intact.
Sent receipt match IDs intentionally remain historical provenance, not contact access.
No profile/search-status writes, queue promotion, match creation, or email scheduling.
A permanent adminRemovedAt marker prevents ordinary action paths reopening this history.
Previously disclosed contact information cannot be recalled.

## Validation and review

- 14 dedicated synthetic transactional tests: wrong ID/pair/number, stale fingerprint,
  foreign pointers/shares, in-flight delivery, canonical link, blocking match and
  eligibility guards; atomic rollback, exact pointers, no access/resurrection, receipts,
  unchanged profiles/queue, idempotent retry.
- Deletion-only isolated worktree suite: 1928 tests / 155 files pass; 22 focused tests pass.
  The historical stacked candidate had 1956 tests and is not this release.
- TypeScript and scoped ESLint pass. Independent read-only safety review: no findings.
- Real isolated local Convex HTTP/SQLite proof uses only synthetic profiles and no
  production credentials, with outbound action HTTP blocked. Private reproducible
  harness and results retained outside the release tree.

## Release gates (not performed)

This deletion-only candidate starts from certified serving baseline
90a1f9aa4bb2a257acba0023d55037d148f47e52 (fix/remove-test-matches5910).
It excludes all paused PR196 changes; historical PR197 is stacked on PR196 and must
not be merged or deployed wholesale. Fresh read-only reconciliation on 2026-11-15
at 16:58:38Z matched all 97 serving modules including schema/config/crons. The
compiled candidate has 98 modules with complete import closure and additive schema
changes only. Recheck serving parity immediately before any approved deployment.

The review artifact is this documentation and the synthetic isolated local Convex
HTTP/SQLite preview → remove → verify proof, not a hosted frontend. This operation
is internal-only and has no new frontend execution surface; no paid hosted backend
or provisioning is required. Any incidental Vercel URL is UI-review-only and must
not be used for real submissions. No live deployment or removal has been performed.
Explicit deletion-only preview approval and genuine contribution-specific DCO remain
required. Preserve concurrent modules, crons, schema fields and unrelated changes.

After approval: securely resolve the authorized pair, confirm the exact requested match
and paused state again, inspect the internal preview counts/fingerprint, then execute
only the reviewed exact request. Abort on any guard failure, including in-flight mail.
Verify match absence, historical closure, revoked access, unchanged eligibility/candidate
membership, unrelated queues and accepted receipts; record audit ID privately. Do not
send notifications, promote queues, reset participant answers or change availability
merely to force a passing preflight. Live removal has NOT been executed.

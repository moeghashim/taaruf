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
- Entire isolated worktree suite: 1956 tests / 156 files pass.
- TypeScript and scoped ESLint pass. Independent read-only safety review: no findings.
- Real isolated local Convex HTTP/SQLite proof uses only synthetic profiles and no
  production credentials, with outbound action HTTP blocked. Private reproducible
  harness and results retained outside the release tree.

## Release gates (not performed)

This PR is stacked on fix/approval-status5925 because main is not the serving baseline.
Do not merge the historical branch stack wholesale or deploy this checkout to live.
Reconcile the exact currently serving schema/module manifest and apply only this scoped
change plus necessary dependencies after explicit preview approval and genuine DCO.
Preserve concurrent modules, crons, schema fields and unrelated changes.

Hosted preview is UI-review-only until an authorized isolated hosted backend is attached;
no real submissions or production-backed functional testing. Hosted isolation is currently
unavailable and must not be provisioned without separate owner authorization.

After approval: securely resolve the authorized pair, confirm the exact requested match
and paused state again, inspect the internal preview counts/fingerprint, then execute
only the reviewed exact request. Abort on any guard failure, including in-flight mail.
Verify match absence, historical closure, revoked access, unchanged eligibility/candidate
membership, unrelated queues and accepted receipts; record audit ID privately. Do not
send notifications, promote queues, reset participant answers or change availability
merely to force a passing preflight. Live removal has NOT been executed.

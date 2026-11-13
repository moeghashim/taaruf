# Admin profile content copy (preview only)

This operation is distinct from account merging. It must retain the source account and all relationships, payments, approvals, login identifiers and privacy settings. Only reviewed participant content is copied. Photos must be new target-owned byte copies; original storage objects are never deleted.

Release gate: implementation approval does not permit a production deployment or profile mutation. Review a synthetic isolated-backend preview first, obtain explicit approval, deploy only the approved change, then re-read both live records and create a fresh dry-run fingerprint before applying. Never reuse an earlier live snapshot as concurrency authorization.

Current safety restriction: any existing target interest, match, profile share or interest-flow reference blocks copying until a separate disclosure review. Different source/target photo privacy also blocks it. This avoids applying existing recipient grants to newly copied content; it does not guarantee that a particular live pair is eligible.

The intended first operation is source public profile 163 to target public profile 144. Require explicit source and target confirmation and review changed field names. Do not transfer interests, event registrations, consent, approval, payment, identity or admin notes. The earlier 79-to-233 account-retirement procedure is not applicable.

Backups and raw profile data are private operational artifacts and must never be committed. Retain original photos and transactional before-images for rollback. A rollback must fail closed if either profile changed after applying. No notification is part of this operation.

## Operational API and interruption limits

POST /api/admin/profile-content-copy requires the existing admin cookie and exact same Origin. Operations: preview (sourceId, targetId, sourceNumber, targetNumber), apply (same pair plus operationKey and expectedFingerprint), status (operationKey), rollback (auditId). No client credential or arbitrary patch fields accepted. Responses are private/no-store.

Each successfully recorded photo clone is persisted in the audit. Status reports state, staged count and recoveryRequired without exposing profile content. An interrupted prepared operation intentionally cannot retry automatically: stop and reconcile its audit before any further operation. There is no public recovery/abandon endpoint in this candidate. Process death between storage.store and its receipt can leave an unattached orphan; originals and retained copies are never deleted. This is an explicit operational limitation, not automatic recovery.

Any ambiguous cross-account source/original photo attachment fails closed, including legacy ledgerless photos. A bounded 5,000-registration scan detects references; exceeding that bound requires a separately reviewed indexed approach.

Preview evidence: synthetic real Convex loopback backend 127.0.0.1:3468 and Next route 127.0.0.1:3470. These are local-only, not a hosted group-accessible preview. Hosted backend isolation is unprovisioned; do not use a hosted app preview for real submissions.

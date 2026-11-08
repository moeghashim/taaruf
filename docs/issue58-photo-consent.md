# Submit Interest photo consent — issue 58

## Status
Draft implementation; **not deployed**. The approved authorization remediation is implemented and undergoing final independent acceptance. Operational capability-remediation and repository attestation decisions remain with the owner; details are retained privately. No real applicant data access.

## Baseline and scope
Freshly inspected www.1plus1match.com on 2026-11-06: Ready deployment dpl_5DvdNAaTQok4DZR1AL9V4VU4iiRK, same deployment URL as supplied live baseline. Worktree starts at ac5db90 (PR57 scoped integration); retains manual event ON/OFF, reactive eligibility, same-event attendance checks, stale409 rejection and New match fixes. Existing dirty and pending consent/archive trees were untouched. Resumed implementation merges current PR60/reset-feedback frontend9987fcc and PR63 backend3384656 rather than deploying the old baseline. Fresh read-only comparison matches all35 live backend modules to3384656; reset implementation files are unchanged.

## Behavior
- Unselected Yes/No radios name recipient first name and permanent applicant number; changing recipient resets choice. Submission requires a choice. Clear choice writes nothing.
- Mutation derives sender from valid applicant session; verifies recipient number/name and current enabled event. Choice is atomically stored on the new interest, not on the profile. No backfill.
- In authenticated interest dashboard, explicit No overrides global Yes/legacy approval for sender-to-recipient access on this interest. Yes allows only that recipient, subject to existing profile/interest visibility. Without a recorded choice, existing global/flow permission remains. Reverse-direction photos use their own permissions.
- Female-to-male interests stay private/admin-first regardless of Yes. No new photo-request email or implied request mechanism. Existing male-to-female interest notifications unchanged for first submissions.
- Identical retry returns original interest without extra consent writes or email; different choice and closed interest reject. Retrying after revocation cannot restore permission.
- Sender can revoke on the interest. New dashboard reads no longer return URLs; closed/declined/withdrawn interests disappear. Already displayed/downloaded photos and previously obtained storage URLs cannot be recalled; no claim of expiring URLs.
- No uploaded photos: UI explains that Yes applies to later uploads for this interest. Currently the presence flag uses stored image references, not file-existence validation.
- Ask me first remains stored unchanged and is clarified as private until explicit sharing; there is no invented request email.

## Limits and release gate
Administrative backend operations now require server authorization; browser callers use a fixed-operation authenticated server bridge. Photo uploads have durable ownership, and share/token photo responses resolve permission and URLs in one backend snapshot. No permission backfill or blanket deletion. Do not use real applicants in previews. Final release requires independent acceptance and owner resolution of previously issued capabilities and repository attestation. Existing notification delivery is not a durable outbox; duplicate interest submissions do not recover failed notification delivery.

Validation: 261 tests across 29 files; TypeScript passed; ESLint 0 errors (7 existing warnings); candidate production build passed. Independent actual SQLite Convex + production Next/Chrome exercised 16 consent combinations plus desktop/mobile, revoke, retries, missing photos, malformed/unauthorized requests and real stale409. Eight synthetic screenshots are in ops/photo-browser-artifacts; report in ops/photo-runtime-validation.md. The isolated runtime independently confirmed the release-blocking inherited authorization issue. Both servers are stopped; no live-data access or email occurred. Screenshot visual inspection was unavailable due to tool path restrictions; browser assertions verified no overflow.

## Resumed verification — 2026-11-08
347 tests pass across39 files; TypeScript and production build pass; ESLint has0 errors and7 existing warnings. Actual isolated backend/browser rerun and final independent review are being completed against the final source snapshot; private operator reports contain detailed evidence. No production deployment, credential rotation, session invalidation or real email occurred.

# Profile preference for new interests — Omar2865/2870

Supersedes the new-submission question described in issue58-photo-consent.md.

- Existing saved profile Yes authorizes a new sender-to-recipient interest grant. No, missing, and legacy Ask Me First create a private snapshot. No fresh question is shown.
- The authenticated mutation reads the stored preference, never a client-supplied grant. Optional legacy `photoConsent: no` further restricts new grants; legacy Yes cannot override a private profile.
- Only newly created interests receive the snapshot. Retries preserve historical choices and revocations and do not resend notifications. No backfill or migration.
- Later profile edits affect future submissions, not saved interest snapshots. Existing recipient-specific revocation remains available; changing back to Yes cannot undo it.
- Existing photo-read, female admin visibility/review, contact release, hidden-name and share-token gates remain unchanged. This does not grant public access or change reverse-direction photo permission.
- Already obtained URLs/photos cannot be recalled.

## Release gates

Based on verified PR82 source `91549214af8eeab209a65ee11347f9df25158642`, not divergent main. Candidate requires independent review, isolated backend preview and explicit preview approval before production. New commit-specific DCO/certification must be separately authorized; prior approvals do not cover this work. Recovery/cutoff remains paused. Deploy compatible backend before the question-free frontend only after approval. Never use live data to test previews.

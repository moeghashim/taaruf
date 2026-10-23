# Production source of truth — 2026-10-23

**Do not deploy main until this release branch is integrated.** Production event waitlists and receipts are from `release/event-waitlists-2026-10-23`, application commit `3819d32055dcf800daa79cf0eb0d4190ac524b36` (feature commit `074c18c1f06eb5c6bf2af7dea504f125df968c4b`). Main did not contain this feature at deployment. An older main deployment would revert the frontend and may deploy an incompatible narrow Convex schema. Integrate/review this branch before the next main release; do not blindly roll back backend schema or delete ledger data.

Nov26 was explicitly published 2026-10-23 after validation via authenticated admin update, status-only request. Public URL: https://www.1plus1match.com/register/nov26 . Nov14 12:45–15:45 America/Chicago, ROIC, 60 male/60 female capacity preserved. Event-only overflow queues are active; promotion is FIFO to Pending, never automatic approval. No broadcasts, test attendees, or historical deletions were performed.

Credential incident remediation uses a short-lived dual-credential backend overlap, Next production environment replacement and redeployment of the exact application snapshot, then primary Convex replacement and removal of overlap. No secret values belong in this document. See operator evidence at `.worktrees/event-waitlists-release-notes/` outside deployable checkout for final revocation proof. Preview/development did not contain the affected credential and were not modified.

## Final remediation proof — 14:44 CDT

Rotation completed across Vercel production and the matching live Convex deployment. Old credential rejected; new credential accepted by read-only backend authorization; live authenticated admin bridge HTTP200; malformed requests return generic redacted HTTP400. Temporary overlap removed and exact original application backend source restored. Final frontend `dpl_9caLwdSnUn3tSaceArLN58ypcS9L` (`https://taaruf-i9l8raseq-bannaa.vercel.app`) is Ready and serves www.1plus1match.com. Public nov26 registration HTTP200, event scheduled, original date/time/location/60-60 capacities preserved, zero synthetic attendees and no broadcasts. Vercel sensitive-variable update had a CLI limitation; scoped `env add --force --sensitive` replaced only the existing production key.

Integration tracking: https://github.com/moeghashim/taaruf/pull/41 (open; not merged). This documents the deployment hold; it is not an enforced branch/deploy lock. Owner must integrate this release before deploying main.

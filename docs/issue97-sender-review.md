# Sender and lifecycle independent review

Added14 synthetic sender tests; with11 admin route tests all25 pass. Typecheck and sender/route lint pass. No real fetch/mail. Fixed sender link to actual `/me#matchmaker-matching` tab; fixed disabled repeated-Present response preserving duplicate-safe message assertion.

Remaining review findings for coordinator:
- P1 consent UX: `getMine.canWithdraw` requires active(m), excluding paused introductions. An admin can pause after both approvals; applicant then has no Withdraw control, admin can Resume and release using approvals the applicant could not withdraw. Backend withdraw supports paused correctly. Return canWithdraw for every unshared, not-yet-withdrawn presented record and separately disable approval while paused/closed; test paused -> withdraw -> resume/release denied.
- Sender activation blocker: 429 stops only this invocation; subsequent explicit Present may claim/send the still-pending second recipient before Retry-After. Persist cooldown checked atomically in claim, or consume/block all outstanding claims when throttled and require manual reconciliation. No real sender activation performed.
- Existing admin deleteRegistration deletes a profile; getMine skips matches whose partner is missing, so retained shared history disappears from survivor portal. Match document remains but no visible tombstone. Requirement may warrant retained record fallback, not broadly blocking authorized account deletion.

Permanent claims correctly prevent retry after unknown outcomes; default absent config makes no backend/provider calls. Allowlist checked before and after claim. Generic message has no partner details and uses stable provider idempotency key. Dedicated production approval required. Backend identity/withdrawal/contact-gate reviewed; earlier profileShares finding owned by repair lane.

## Resolved in final candidate
- Unshared paused/closed/declined introductions expose withdrawal independently from canApprove; regression tests prove paused withdrawal prevents resume/release.
- Missing partner returns a retained tombstone with followups rather than dropping history.
- Provider Retry-After persists in a backend setting; claim checks cooldown atomically across requests. Synthetic regression proves second pending recipient remains unclaimed during cooldown. No sender activated.

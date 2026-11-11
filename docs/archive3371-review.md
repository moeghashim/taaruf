# Archive and restore — preview review

Implements Layla3371: authenticated owner/admin archive cancels only upcoming event registrations, closes active matching, retains payment/attendance/disclosure records, and emits no rejection notice or refund. Only cancellation of a seat-holding row invokes FIFO promotion, and actual event/gender capacity is rechecked transactionally. At cap60:62→61 and61→60 promote none;60→59 promotes one eligible Pending. Archived/rejected/incomplete/failed-background candidates are skipped.

Restore clears availability metadata only: no booking, workflow, approval, photo or contact permission is restored. Persisted restoration generation prevents an old archive request undoing a newer restoration. Archived users retain global future-matchmaking opt-out.

Baseline: verified serving feature97 commit1ebc96a6d2ae8ae92cb19e2396fe5be8e0d48649. Birthday candidate e859650 was inspected and is not verified live; its provisional ancestry includes separate unapproved PR112, so neither is silently included. Live deployment was independently inspected as dpl_HgJQrhQVSBm5qqJ5Vs7ApFPXQpVp on2026-11-10. Recheck and integrate any subsequent actual release before production.

Validation:1019 tests/89 suites, root and Convex types, lint0errors8existing warnings, declared production build. Independent review identified ABA replay, hidden opt-out and residual partner-profile access; all corrected with regression coverage. Final review and real local runtime evidence are reported separately.

Hosted preview remains UI-review-only, Vercel-auth protected, with API middleware fail-closed until an isolated backend is configured. No real submissions. Existing account has no eligible isolated hosted backend; no resource provisioning is authorized. Local synthetic backend evidence is not hosted end-to-end approval.

No production backend/frontend deployment, data/config change, email, refund, paid resource or dirty-main edits. Explicit approval of the exact final preview/release commit remains required before any live deployment.

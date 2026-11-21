# Future-only approval welcome (6577)

Implemented, **not enabled**. Deployment, activation, live sends, and human DCO certification are not authorized by this change. Exact-source DCO and preview approval remain release gates.

Only the authenticated normal registrations.updateStatus transition into approved queues a notice. Signup, pending saves, event approval and historical approved profiles are not scanned. A durable, transactionally unique row per registration is retained across reversals/reapprovals. Archive cancels queued work; retired, archived, suppressed, changed-recipient or no-longer-approved profiles fail closed at claim. Merge tooling blocks identities carrying welcome-delivery history.

Delivery uses the established Resend transport, the approved literal copy in convex/approvalWelcomeNotice.ts, sender 1Plus1 Match <contact@1plus1match.com> and reply-to 1plus1@plus1htx.org. Provider failure cannot undo the committed approval. Accepted means provider acceptance, not confirmed inbox delivery. A frozen payload and stable per-notice idempotency key support retries (six attempts maximum, within 23 hours of first attempt); ambiguity beyond that requires reconciliation, never a fresh key. As with other transactional outboxes, a reversal after claim cannot retract an already in-flight provider request; late acceptance is preserved as evidence.

## Release gates — do not execute during preview

After exact-source DCO and preview/release approval, the matching backend must be released separately. Automatic sending additionally requires APPROVAL_WELCOME_NOTICE_APPROVED=true, APPROVAL_WELCOME_NOTICE_DELIVERY=live, the exact live CONVEX_CLOUD_URL, and a configured dedicated or shared Resend credential. An explicit internal approvalWelcomeNotice.activate operation creates the immutable activation timestamp once; generic settings mutation cannot forge/reset it. Deployment and cron never activate it. Disable the approved flag to stop new work/claims. Per-profile approvalWelcomeSuppressedAt suppresses this workflow. Existing approved profiles are not backfilled, including repeated approved saves after activation.

## Preview limitations

No isolated preview backend has been provisioned or deployed for this change. A Vercel preview alone is **UI-review-only**, not end-to-end approval validation. Do not submit applications or change statuses on it: inherited configuration may connect to live data. The welcome transport is intentionally denied on non-live Convex deployments even if credentials are copied. Local convex-test tests use synthetic data and a mocked provider; no real email or applicant mutation is needed.

## Baseline

Read-only preflight on 2026-11-20 matched all 108 live module hashes against privateops/closed-match-fix6469/compiled.json and verified live frontend 9ddb81e9c197e1e41f363af3d741580cca8bcc62. Private evidence and test logs are under privateops/approval-welcome-6577 (not committed).

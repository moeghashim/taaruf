# Issue97 — background matchmaking preview

Extends PR104 draft restoration. Separate applicant Matchmaker Matching tab, explicit future-only opt-in, atomic both-person consent check on admin Present, private drafts, individual withdrawal before sharing, mutual approval plus explicit admin contact release, retained shared records, independent dated followups reflected in workbench. Missing legacy consent is not opt-in; no migration/backfill. Current no/ask photo permissions remain private; this adds no new ask-photo grant flow.

## Notifications
Presentation creates exactly one durable notification row per participant. Only explicit Present calls the dedicated sender. Default disabled; it never inherits existing email credentials/rollout approval. Dedicated MATCHMAKER_EMAIL_MODE (isolated/production), MATCHMAKER_RESEND_API_KEY, MATCHMAKER_EMAIL_FROM and MATCHMAKER_PORTAL_URL required. Isolated mode requires MATCHMAKER_EMAIL_ALLOWED_RECIPIENTS; production additionally MATCHMAKER_PRODUCTION_APPROVED=true and approved live portal origin. No values configured by this change. Enabling real delivery requires separate operational approval.

Claims are permanent and provider idempotency keys stable. Failed/ambiguous sends are not automatically retried; reconcile with provider before a separately designed manual retry. Provider acceptance is not proof of inbox receipt. No cron or automatic notification backfill. Portal availability remains even when email is disabled.

## Preview boundary
No production frontend/backend deployment, real applicant writes, or emails. Hosted Vercel preview backend is not isolated: existing API503 and disabled direct Convex provider stay active. Frontend Ready means UI-review-only, not functional end-to-end approval. Use synthetic local proof; do not submit real data. Compatible isolated hosted backend remains required before hosted interaction approval.

## Validation
Synthetic in-memory auth/privacy/consent/legacy tests, genuine loopback Convex OCC races, mobile1440/390/320 portal/draft checks, root+Convex types/lint/build. See ops/issue97-race-validation.md for exact source hashes and observed race outcomes; final receipt includes suite/build counts. Independent review found a context-free profile-share withdrawal bypass; repaired by requiring lifecycle binding and regression tests in convex/issue97IndependentReview.test.ts.

Final isolated suite: **855 tests in73 files**, root+Convex types, full lint (zero errors;8 existing warnings), production build passed. Final loopback race rerun recorded23 real OCC retries and source parity. Follow-up review repairs include paused withdrawal, retained deleted-partner tombstones and persisted provider cooldown.

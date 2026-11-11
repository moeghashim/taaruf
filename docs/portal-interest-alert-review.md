# Portal interest invitation — review candidate

Base: live source 7317b0815ee1e24315f415ce0b1897fd5b39751f (PR86), not divergent main. PR83–86 ancestry retained. No production deployment, live sends, backfill, recovery/cutoff changes or archive product changes.

## Surface
Existing Operate surface, restrained cream/forest brand preserved. Impeccable context and craft floor read; narrow refinement inferred from the delegated brief (no interview tool). A large “Someone is interested in you” heading, readable explanation, explicit contact-privacy reassurance and minimum 48px primary Review profile link appear directly after the portal greeting. Multiple invitations have distinct accessible link names. Resolved/paused history is not promoted as a new invitation; internal enum labels are replaced. Authenticated review decisions remain unchanged.

## Email diagnosis
Previously the admin share transition did not enqueue a brother email at all; only later workflow stages used the existing durable provider outbox. This candidate adds the missing stage, not a new transport. See female-website-interest-flow.md for idempotency, retry and fail-closed configuration. No current live configuration values have been inspected or changed. Delivery activation must not blindly retry historical failed deliveries: current examples and old queues are outside authorization.

## Verification / release gates
- Synthetic browser suite exercises the actual Next UI with intercepted transport at 1280px and 390px; review CTA, first viewport, 48px target, keyboard focus, multiple/resolved/empty/error states, accept transition and existing login/privacy/pause regressions.
- Convex tests use isolated in-memory databases and mocked provider fetch; no external mail.
- Provider “exactly once” means one outbox row/stable idempotency key with safe retries, not a promise of arbitrary network exactly-once semantics. Existing 23-hour reconciliation cutoff retained.
- Preview backend isolation and provider delivery configuration remain release gates. A Vercel frontend preview with blocked APIs is UI-review-only, not functional approval evidence. Do not enter real applicant data.
- New source commit requires fresh exact-SHA human DCO authorization; earlier PR certifications do not cover it. Do not merge/deploy without preview approval and release gate resolution.

Local evidence: ops/interest-alert-runtime/ logs and test-results/portal-interest-alert-*/portal-*.png. Screenshots are synthetic; generated artifacts remain outside source commit.

## Independent review
Independent security/UX review found no new auth/privacy or legacy-queue regression and inspected both rendered screenshots. Its P2 expired-review finding was fixed: expired invitations show an explicit expiry/team-reissue message without the prominent banner or review link; desktop/mobile browser coverage added. Cancellation remains terminal: reissuing a cancelled expired email row does not resend it. This intentionally preserves no-duplicate semantics; any explicit resend workflow is a separately scoped product decision, not an implicit recovery change.

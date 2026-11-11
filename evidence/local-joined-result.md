# Local joined rejection validation — 2026-11-10

Final grace integration: d71da53 (additive cherry-pick of4379848 onto684012c); final evidence commit follows. Layla3350 policy confirmed; no lifetime-policy blocker. Harness retained under evidence/joined (opt-in, not a mandatory browser dependency in unit suite).

## What actually ran
Built Next frontend at http://127.0.0.1:3197, Chromium 390px, real Next route handlers, real admin cookie/origin authentication, real applicant session hashing and database session lookup, actual Convex query/mutation/action implementations through convex-test with actual schema and in-memory synthetic data. Browser API transport is adapted via Playwright to those handlers; getConvexClient is adapted to convex-test; next/headers cookie access is adapted to the incoming browser cookie. NO fixture JSON API responses. This is the explicitly allowed full-route + real-function synthetic E2E equivalent, NOT a native Convex backend, hosted functional preview, real HTTP Convex transport, or production cron-scheduler proof.

Browser external origins blocked. Every rejection worker fetch mocked; event-mail provider helper mocked. Next server backend URLs set to dead loopback, dedicated approval false. All enabled sender settings exist only in the synthetic Vitest process and are restored. No hosted resource, production data/config write, real recipient, real email or deployment.

## Passed scenarios
- Anonymous applicant 401, anonymous admin 401, incorrect admin origin 403.
- Eligible profile sees actual event title/location; real confirm mutation succeeds; real event email claim succeeds with mocked transport.
- Authenticated admin bridge transition creates one durable pending notice; duplicate save leaves one.
- Open UI revalidation after rejection removes private venue and Register/Confirm controls; reload retains status-only history. Actual events/me/eligibility response bodies omit private title/location.
- Rejected register/confirm writes denied (current routes report generic 500); all five event-email kinds including force:true cannot reach sender after rejection. Earlier eligible send count stays one.
- Worker timeout returns pending, retry with exact frozen payload/header/idempotency key records acceptance, subsequent drain does not duplicate.
- Approval reversal restores UI logistics; re-rejection after accepted notice produces no new row/send.
- Confirmed 15-minute durable grace: repeated saves preserve deadline; no dispatch at deadline-minus-1ms; exact deadline permits dispatch. Separate synthetic reset proves reversal cancels, cancelled-unattempted re-rejection receives a fresh15 minutes, old wakeup and fresh deadline-minus-1ms cannot dispatch, fresh deadline accepts once.
- Disabled dedicated gate prevents claim.

Final logs: grace-joined.log (1 joined browser E2E PASS), grace-tests.log (890 tests /73 files PASS), grace-types.log (root + Convex PASS), grace-lint.log (0errors,8 inherited warnings), grace-build.log (production build PASS), grace-browser.log (3 grace UI cases), grace-combined-browser.log (6 combined browser cases). Screenshot: local-joined-rejected.png. Independent review PASS; focused74 tests pass.

## Reproduce (local only)
In this worktree, with existing built frontend and installed Chrome:
1. NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:1 CONVEX_URL=http://127.0.0.1:1 PROFILE_REJECTION_NOTICE_APPROVED=false ./node_modules/.bin/next start -H 127.0.0.1 -p 3197
2. ./node_modules/.bin/vitest run --config evidence/joined/vitest.config.ts
3. Stop local server after test. No Convex CLI dev/deploy is needed.

## Actual activation mechanism (NOT executed)
Configure3310 already authorizes intended future automation. There is no extra invented authorization requirement; release/preview approval and technical readiness remain.
- On the exact approved Convex deployment, deploy reviewed schema/functions/crons via repository Convex deployment process (installed CLI: convex deploy defaults to production; verify selected deployment first). Frontend and backend must be compatible.
- Securely set dedicated backend environment variables PROFILE_REJECTION_NOTICE_RESEND_API_KEY (valid Resend send credential), PROFILE_REJECTION_NOTICE_FROM (verified sender identity), PROFILE_REJECTION_NOTICE_APPROVED=true. Not NEXT_PUBLIC variables; do not reuse/change FEMALE_WORKFLOW_* settings or generic event settings. Values never go in chat/logs.
- Installed CLI supports: npx convex env set PROFILE_REJECTION_NOTICE_RESEND_API_KEY --from-file <secure-key-file> --prod; npx convex env set PROFILE_REJECTION_NOTICE_FROM --from-file <secure-from-file> --prod; npx convex env set PROFILE_REJECTION_NOTICE_APPROVED true --prod. These are documented release actions only; --prod is appropriate ONLY after verifying this project's intended production target and release approval. Dashboard secure environment editing is equivalent.
- Invoke npx convex run profileRejectionNotice:activate '{}' --prod (do NOT add --push). Internal mutation checks all three vars then creates settings.profileRejectionNoticeActivatedAt timestamp once; public admin bridge cannot invoke it; generic settings cannot forge it. Activation does not sweep/backfill.
- Existing crons.ts schedules internal.profileRejectionNotice.drain every minute. Only subsequent authenticated non-rejected→rejected transitions enqueue. Accepted means provider acceptance, not delivery.
- Keep approval false/unset until release gates satisfied. Setting false stops claim/enqueue, does not recall an already in-flight provider request.

## Genuine remaining gates/limitations
Parent release/preview approval; secure deployment-specific sender credential + verified From readiness; exact production baseline/compatibility recheck and controlled deployment/activation at release. Hosted preview still SSO-protected/UI-only; no hosted backend verification claimed. Local synthetic joined testing is now completed and does NOT require a new hosted backend or a routine testing permission request. Native transaction contention, production cron execution, provider delivery and HTTP deployment plumbing are not proven by this harness. No live sender activation performed.

# Issue97 real local Convex race validation

2026-11-10 20:39 CST: PASS against actual precompiled Convex backend, SQLite, independent ConvexHttpClient per mutation. This is not convex-test.

- Four concurrent Present calls: one initial presentation, three idempotent replies, exactly two notification rows.
- Four concurrent delivery claims per recipient: exactly one successful claim each; retry returns null. No provider call made.
- Ordered optout rejects presentation without notifications. Eight independent-client optout/Present races all serialized optout first; no presentation/no notifications. The harness also permits valid Present-first ordering, but it was not observed in this run.
- Five withdrawal/contact-release races: exactly one succeeds; withdrawal won all five. No contradictory withdrawal plus contacts released.
- Explicit release separately succeeds after both approvals; simultaneous per-person followups preserve both values, authors and timestamps. Global optout after release preserves contact-shared record; withdrawal then rejects.
- No existing female-workflow delivery or event-email outbox rows. No email credentials configured or emails sent.
- **23 actual backend OCC retry warnings** demonstrate genuine overlapping transactions (Present, notification claim, consent race, withdrawal/release, followup). Raw /Users/moeghashim/taaruf/privateops/issue97/local-runtime-final/occ-retries.log.

## Isolation
Backend bound only 127.0.0.1:3368 and site proxy127.0.0.1:3369, beacon disabled, fresh SQLite/storage. Public development-only instance configuration copied from prior disposable race fixture into mode-600 files; no cloud config/provider credentials. Commands used CONVEX_DEPLOYMENT= CONVEX_DEPLOY_KEY= with explicit self-hosted loopback URL. Source copy/fixture under /Users/moeghashim/taaruf/privateops/issue97/local-runtime-final, fixture absent from release convex. Backend stopped after test. No cloud/production deployment or real applicant operations.

Harness: ops/issue97-race.mjs; disposable-only fixture ops/issue97-race-fixture.ts.txt; output ops/issue97-race-output.txt. Raw logs/source hashes/SQLite retained under /Users/moeghashim/taaruf/privateops/issue97/local-runtime-final.

## Exact tested hashes (SHA256)
- convex/matchmakerMatching.ts: bf5682e72aa7243fc18fde4a5a50384e4e809f698ac605b8c8ebf070edafe93e
- convex/contactGate.ts: f47d50d97ee1401738e1c395a8ea3935d6f2aa489876502cd5f66c3d2d5c7ad3
- convex/schema.ts: d9f70cc7aaf34f1503f183884d2044f7f6e32c9fa23120788183a25c3dbcb146
- convex/matches.ts: 120b098c7a1067955da25fc96a3d32d3be02bfa92cf5c229eebdfd38d1e8fed0
- src/lib/manual-match-draft.ts: 41113f21bc65e743c84c2588b2db13e8b41f71bc8961575c5dae27157f3eb378

All copied convex files matched the current source after the final run (only disposable raceFixture.ts differed); manual-match-draft.ts was freshly copied. A concurrent source edit was detected after an earlier run, so all convex files were recopied and the final run used another fresh database/storage. Final evidence supersedes that earlier run. Recheck hashes if implementation changes again. Hosted Vercel backend remains unisolated; these tests do not make the hosted preview functional. Notification provider delivery and mobile/UI are outside this lane.

## Final rerun receipt
- Backend precompiled-2026-10-22-1447815; harness exit 0.
- OCC retry breakdown: present 11, claimNotification 6, releaseContacts 5, followup 1 (23 total).
- Copied all convex files plus src/lib/manual-match-draft.ts and required src/lib/education.ts. No release implementation edits.
- CLI: CONVEX_DEPLOYMENT= CONVEX_DEPLOY_KEY= convex dev --once --typecheck disable --codegen disable, using disposable self-hosted loopback .env.local only; synthetic ATTENDANCE_ADMIN_SECRET set locally.
- An initial setup attempt used the wrong synthetic admin environment-variable name; it was discarded before the successful fresh-database runs. No cloud/provider credentials were loaded.
- Listener receipt listeners.txt proves both ports bound to 127.0.0.1; backend stopped and neither port had a listener afterward.

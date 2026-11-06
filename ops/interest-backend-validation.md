# Isolated real-backend interest acceptance — 2026-11-06

PASS, final run 10:55 America/Chicago. Real precompiled Convex backend + SQLite, not convex-test. No production reads/writes/deploys; synthetic profiles only. No release convex, src, or test modifications by this worker. No commit.

## Evidence
- 20 two-independent-HTTP-client simultaneous ON waves per run: exactly one success, one explicit “Only one event can be ON” conflict; exactly one enabled event after each wave.
- 42 actual OCC retry warnings across initial + final runs (21 each: 20 toggle races and one cancellation race). See interest-backend-occ.txt. These are backend transaction conflicts, not serialized client calls.
- Future event with already-expired historical submission window stays enabled; dates do not override ON.
- Approved + confirmed + attended same-event sender succeeds, with recipient absent from all event rosters.
- Missing event approval, missing confirmation, missing attendance, cancelled confirmation, attendance solely at other event, absent roster, wrong expectedEventId all reject. Dashboard also reports unavailable.
- OFF and switched-event stale forms reject. OFF preserves full interests, flows, and flow events byte-for-byte.
- Repeated ON/OFF preserve audit and state; final 45 audit entries have expected actor.
- Cancellation while ON rejects. Concurrent cancellation vs ON: cancellation committed, ON rejected after real OCC retry; never enabled+cancelled.
- All profile documents unchanged; zero email records; exactly two successful synthetic interests.
- Initial run preceded concurrent source changes. Final repeat refreshed events.ts (ConvexError) and applicantInterests.ts (narrow eligibility query), reseeded synthetic DB, passed all assertions. Final five tested source hashes exactly match release snapshot in interest-backend-hashes.txt. Later edits require rechecking hashes.

Artifacts: interest-backend-acceptance.mjs, interest-backend-output-final.txt (exit 0), interest-backend-output.txt (initial), interest-backend-occ.txt, interest-backend-hashes.txt. Runtime contains fixture.json, final-snapshot.json, push logs, backend.log, SQLite/storage. Fixture helpers exist ONLY in runtime copy. Reset helper deletes only this disposable synthetic runtime data and was used once for final repeat.

## Browser handoff — backend remains RUNNING
- Runtime: /Users/moeghashim/taaruf/.worktrees/verified-checkin-interest/interest-runtime
- API: http://127.0.0.1:3340 ; site proxy: http://127.0.0.1:3341
- Process tool session: clear-kelp; PID 56344; listener proven 127.0.0.1 only.
- Runtime .env.local has self-hosted loopback URL and disposable local admin credential, mode 600. Do not copy any live env. Do not commit runtime directory (contains credentials/DB).
- Next runtime must use CONVEX_URL=http://127.0.0.1:3340 and NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3340; ATTENDANCE_ADMIN_SECRET=synthetic-local-only.
- Selected ON event: k17fyjnqbnzz42bgbrfb3fxdfh8hqbgb (Synthetic Interest 0).
- Browser applicant cookie: applicant_session=synthetic-browser-7 (SHA256-backed session already seeded, unused eligible sender). Target applicant number 910, first name Synthetic10; 911/Synthetic11 also available. Synthetic browser cookies 0–11 exist; 1 lacks approval, 2 lacks confirmation, 3 lacks attendance, 4 cancelled, 5 attended only event 2, 6 missing roster.
- Raw backend sessionHash synthetic-interest-7 remains valid too, but is NOT the browser cookie value.
- Fresh fixture mapping: interest-runtime/fixture.json. Narrow getInterestEligibility query confirmed eligible with zero submissions for person 7 after final push.
- Harness hard-blocks fetch to every origin except http://127.0.0.1:3340. CLI pushes explicitly clear cloud deployment/key selectors and force self-hosted loopback. Beacon disabled; no email/Stripe secrets installed. Frontend worker must independently hard-block nonlocal requests in its browser/server proof.

## Isolated cloud preview feasibility (no configuration changes)
Read-only Vercel environment metadata query succeeded; see interest-preview-env-metadata.txt. Worktree is linked to existing taaruf project. Preview has CONVEX_URL/NEXT_PUBLIC_CONVEX_URL, ADMIN_PASSWORD and shared Resend/Stripe secrets; no isolated backend flag, attendance admin secret, or Convex preview deployment key listed. Existing docs/approved-issues-preview.md explicitly records preview URLs as live-backed and requires UI-only fail-closed isolation. Current encrypted values were NOT fetched, so that historical URL claim was not independently revalidated.

Conclusion: existing Vercel infrastructure can host UI preview but is NOT proven safe functional isolated infrastructure. No cloud preview deployed. Functional preview requires a separately provisioned synthetic-only Convex backend + explicitly verified isolated server/client URLs and matching synthetic credentials; suppress inherited mail/payment secrets. Loopback 3340 cannot serve a cloud deployment. Do not set PREVIEW_BACKEND_ISOLATED=true against unverified inherited URLs. No live settings or project config were modified.

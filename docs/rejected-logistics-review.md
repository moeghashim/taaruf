# Rejected-profile logistics review candidate
Base: live 612806ec81a72a092cb1afd0b41ac1e7a3c90ec4. Logistics privacy only; rejection outbox is separate.

Current profile loaded transactionally on every applicant event query. Rejected and explicitly failed-background-check profiles receive status-only history: no event documents, titles, codes/months, descriptions, location, start/end or attendance timestamps, nested profiles/notes. Stored history is unchanged. Dashboard/eligibility refresh flag hides stale portal logistics and registration/confirmation controls on existing three-second visible-tab/focus refresh; refresh failures also hide details. Previously received information cannot be erased.

Admin detail/getByRegistration remain authenticated. No applicant detail/calendar/ICS endpoint exists in this baseline. Public event endpoints/site intentionally unchanged; publicly published or emailed information cannot be revoked by portal controls. No schema/auth/notification changes.

## Verification
871 tests / 72 files passed, including six new actual Next route + convex-test integration tests covering all five event statuses, direct queries, rejection revalidation, anonymous denial, eligible/admin controls and record preservation. Root/Convex types passed. Lint zero errors/eight existing warnings. Production build passed.
Three synthetic local production-build Chromium tests passed (1280/390/320px): eligible details, rejection refresh/reload, status history and no overflow. All browser API traffic intercepted; authority tested separately via actual routes/convex-test. Mechanical UI detector empty. Screenshot view tool denied repository path; screenshots remain in test-results.
Independent review found missing eligibility API flag propagation; fixed and actual-route regression added. Final independent review found no remaining scoped blockers.

## Integration / publication boundary
No hosted resources created per task constraint: no GitHub PR, auto Vercel deployment or hosted Convex preview. Local synthetic UI preview http://127.0.0.1:3187/me; no backend configured. This is not a hosted functional preview.
Cherry-pick scoped commit alongside separate rejection-email commit on latest-live integration branch and rerun checks. Obtain preview approval before live; functional preview requires isolated compatible backend. Never deploy live backend to enable preview. Existing preview write safeguard untouched. Public info and previously emailed details remain outside revocation scope.

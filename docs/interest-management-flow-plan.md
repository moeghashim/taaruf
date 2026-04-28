# Interest Management Flow Implementation Plan

## Guiding Constraints

- Keep the existing Convex tables and admin routes working.
- Read `convex/_generated/ai/guidelines.md` before modifying Convex code.
- Do not expose applicant identity through client-supplied `registrationId`.
- Use indexed Convex queries for applicant-facing reads.
- Add new workflow state alongside current `interests.status` and `matches.status`.
- Keep sensitive information hidden by default and reveal it only through explicit timestamps/state.

## Phase 1: Confirm State Mapping

1. Map current records:
   - `interests.status` remains the operational queue status.
   - `interests.adminStatus` remains the management review marker.
   - `matches.status` remains the pair pipeline status.
   - New flow state tracks applicant-facing decisions and visibility.
2. Decide whether to store workflow fields directly on `interests` or in a new `interestFlows` table.
3. Default recommendation: add an `interestFlows` table keyed by `interestId` because the flow has many applicant decisions, timestamps, and audit-sensitive transitions.
4. Define exact terminal behavior for photo decline:
   - Confirmed: continue to automatic contact sharing after both final approvals even if photos are declined.
5. Contact sharing behavior:
   - Confirmed: contact sharing happens automatically after both applicants give final approval.
   - Implementation should not require management to manually release contact details unless management later adds an override/hold flag.
6. Visibility behavior:
   - Confirmed: applicant names become visible once the bio-review state opens.
7. Queue behavior:
   - Confirmed: each candidate is limited to one active bio-review flow at a time.
   - Keep the existing active-match queue behavior and apply the same principle to active bio-review flows.
8. Keep Open behavior:
   - Confirmed: Keep Open expires after a fixed number of days.
   - Add a configurable setting such as `keepOpenExpiresAfterDays`, defaulting to a management-approved value.

## Phase 2: Schema and Migration

1. Add tables:
   - `applicantLoginTokens`
   - `applicantSessions`
   - `interestFlows`
   - `interestFlowEvents`
2. Add indexes:
   - `applicantLoginTokens.by_tokenHash`
   - `applicantLoginTokens.by_registrationId`
   - `applicantSessions.by_sessionHash`
   - `applicantSessions.by_registrationId`
   - `interestFlows.by_interestId`
   - `interestFlows.by_fromRegistrationId_and_flowStatus`
   - `interestFlows.by_toRegistrationId_and_flowStatus`
   - `interestFlows.by_keepOpenExpiresAt`
   - `interestFlowEvents.by_interestFlowId_and_createdAt`
3. Backfill one `interestFlows` row for each existing `interests` row.
4. Map existing records:
   - `new`, `queued`, `active`, `deferred` -> `awaiting_inbound_response` or `bio_review` depending on existing match/share state.
   - `declined` -> `declined`.
   - `closed`, `withdrawn` -> `closed`.
   - `converted_to_match` -> infer from linked `matches.status`.
5. Preserve all existing interest and match IDs so admin links and existing UI do not break.
6. Add tests around migration mapping and active-match invariants.

## Phase 3: Applicant Authentication

1. Build `/login` page for applicant email entry.
2. Add a route handler to request login:
   - Look up approved registration by email.
   - Create one-time token.
   - Store only token hash in Convex.
   - Email `/login/verify?token=<rawToken>`.
3. Add `/login/verify` route:
   - Hash provided token and claim it once.
   - Create hashed applicant session record.
   - Set HTTP-only session cookie.
   - Redirect to `/me`.
4. Add logout endpoint to clear cookie and expire the session.
5. Add server helper to resolve the current applicant from the session cookie.
6. Keep applicant API access behind Next.js route handlers or server components so Convex mutations do not trust browser-provided identity.

## Phase 4: Convex Workflow API

1. Add internal helpers:
   - `getApplicantInterestFlowOrThrow`
   - `assertApplicantCanViewFlow`
   - `assertApplicantCanActOnFlow`
   - `appendInterestFlowEvent`
   - `deriveApplicantVisibleFields`
2. Add applicant-safe queries:
   - list inbound flows for current registration.
   - list outbound flows for current registration.
   - get one flow detail.
3. Add applicant action mutations:
   - accept inbound interest.
   - decline inbound interest.
   - keep inbound interest open.
   - create outbound interest when no pending inbound exists.
   - give final approval.
   - decline after bio review.
   - request photo.
   - approve photo request.
   - decline photo request.
4. Each mutation should:
   - Re-read the flow by indexed query.
   - Validate actor role and current state.
   - Patch workflow state atomically.
   - Append an event.
   - Return only safe data.
5. Update existing admin mutations where needed to keep `interestFlows` synchronized when admins convert, decline, close, or reset pairs.

## Phase 5: Email Flow

1. Extend `src/lib/email.ts` with templates:
   - applicant magic login.
   - new inbound interest.
   - bio review opened.
   - final approval requested.
   - photo requested.
   - photo decision made.
   - contact shared.
   - management approval needed.
2. Add route handlers or actions to send emails after state transitions.
3. Store send timestamps and errors either on `interestFlows` for latest state notifications or in `interestFlowEvents` for full audit history.
4. Include applicant links to `/me/interests/<interestId>`.
5. Include management links:
   - `/admin/workbench?interest=<interestId>&step=<step>`
   - `/admin/workbench?match=<matchId>&step=<step>`
6. Update admin inbox to surface failed notification events.

## Phase 6: Applicant UI

1. Build `/me` dashboard:
   - Header with applicant name and logout.
   - Inbound Interests section.
   - Outbound Interests section.
   - Status labels matching the workflow states.
2. Build `/me/interests/[interestId]`:
   - Timeline/status panel.
   - Action buttons relevant to the current applicant and current state.
   - Bio comparison section that appears only when `bioVisibleAt` is set.
   - Photo section that appears only when `photosVisibleAt` is set.
   - Contact section that appears only when `contactSharedAt` is set.
3. Add outbound initiation:
   - Block when pending actionable inbound interests exist.
   - Do not show a broad browseable list of all eligible completed profiles.
   - Show only existing inbound interests or management-approved safe suggestions.
   - For management-approved suggestions, expose only the minimal safe details management permits until bio review opens.
   - Create interest through the applicant workflow API.
4. Use the existing admin design language where appropriate, but keep applicant UI simpler and privacy-focused.

## Phase 7: Admin UI Updates

1. Update `/admin/workbench` to read `step` query param and highlight the relevant action area.
2. Add management action controls for:
   - approve bio review.
   - approve contact sharing.
   - override photo decline outcome.
   - close/reopen flow where allowed.
3. Add flow timeline to workbench using `interestFlowEvents`.
4. Update `/admin/inbox` to show:
   - inbound acceptances awaiting management approval.
   - both final approvals completed.
   - photo request decisions.
   - contact-ready flows.
   - notification failures.
5. Preserve current actions: progress, convert, decline, notify, reset pair, and create share link.

## Phase 8: Contact Sharing

1. Implement a single server-side transition to `contact_shared`.
2. In that transition:
   - Set `interestFlows.contactSharedAt`.
   - Patch linked `matches.status` to `contact_shared` when a match exists.
   - Preserve existing active-match queue behavior from `matches.updateStatus`.
   - Send both applicants a contact-shared email.
   - Run automatically when both final approvals are present, even if a photo request was declined.
3. Applicant UI should reveal:
   - name.
   - email.
   - phone.
   - any management-approved notes.
4. Ensure contact info never appears in earlier API responses.

## Phase 9: Tests

1. Convex unit tests:
   - inbound accept/decline/keep open.
   - outbound blocked by pending inbound.
   - outbound allowed when no pending inbound exists.
   - bio visibility after accept/initiation.
   - final approval from both sides.
   - photo request and approval.
   - photo decline does not block contact sharing.
   - contact sharing visibility.
   - contact sharing happens automatically after both final approvals.
   - Keep Open expires and releases the flow.
   - only one active bio-review flow is allowed per applicant.
   - unauthorized applicant action rejected.
   - admin close/reset syncs workflow state.
2. Route handler tests where practical:
   - magic login token claim is one-time use.
   - expired token fails.
   - applicant session resolves only valid sessions.
3. UI verification:
   - applicant dashboard sections render.
   - action buttons only appear in valid states.
   - admin workbench link opens the correct interest/match.

## Phase 10: Rollout

1. Deploy schema additions first.
2. Run backfill in development and verify admin dashboard.
3. Run tests and lint.
4. Deploy to staging/preview.
5. Test with two seeded applicants and one admin:
   - inbound flow.
   - outbound flow.
   - decline path.
   - photo approval path.
   - contact sharing path.
6. Enable applicant login emails.
7. Send a limited pilot to management-created test records.
8. Monitor notification failures and admin inbox.

## Conflict Avoidance Checklist

- Existing `/profile/[token]` remains only for completing/updating profiles.
- Existing `/share/[token]` remains usable for admin-created manual profile shares.
- New applicant portal does not reuse profile-completion tokens as login sessions.
- Existing admin password cookie continues to protect `/admin/*`.
- Existing interest statuses are not removed.
- Existing match status queue-release behavior remains centralized.
- Existing `internal_only` visibility semantics are preserved.
- Existing tests in `convex/interests.test.ts` continue to pass.

## Resolved Product Decision

- Applicants cannot browse profiles that have not shown interest.
- Outbound selection must not show all eligible completed profiles.
- Outbound initiation should come from one of two safe sources:
  - Existing inbound interests, where the other person already expressed interest.
  - Management-approved suggestions, where management intentionally exposes minimal safe details without revealing the full profile.
- Full names and bios still remain hidden until the bio-review state opens.

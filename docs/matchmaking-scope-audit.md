# Matchmaking scope audit — 2026-11-04

## Result: provenance/product decision blocks complete enforcement

Inspected local baseline e059e5d58649f1cfd3e288eaefa23842b8290b72 and the existing local remote-tracking PR48 ref, origin/fix/workbench-new-match at 91844a6a7ddc02812fb511e660c4d5b10136296d. Audit worker did not merge, cherry-pick, read applicant data, deploy, or email. Coordinator freshly fetched remote refs and read Vercel production metadata: www.1plus1match.com resolves to dpl_BQKVupxSrMArvzUXytrvGQKfb5Ex, sourceCommit e059e5d58649f1cfd3e288eaefa23842b8290b72. PR48 remains open at 91844a6. No production mutations.

The preference contract is explicit: only matchmakingPreference === "beyond_events" authorizes beyond-event consideration. Missing/legacy and events_only are not permission. Approval, completed profiles, active search, attendance, payment, and photo consent cannot substitute. Both participants need current permission for a beyond-event operation, not merely permission at candidate-list time.

**No existing backend endpoint or persisted match has an explicit beyond-event scope discriminator.** It would be unsafe to label all admin-created/unlinked matches beyond-event, or gate every match/interest/profile share and thereby disable event participation. No matching runtime gate was added based on inferred provenance. This is a concrete release blocker, not a claim that preference storage alone enforces opt-in. No new matching API was introduced solely to create an unused gate.

## Surface-by-surface audit

| Surface | Evidence and treatment |
| --- | --- |
| Applicant event interests | applicantInterests.submitInterestNumber -> createApplicantInterestWithRules -> createInterestWithRules. Event eligibility is resolved by findEligibleInterestSubmissionEvent; required interests.eventId is persisted. Keep this event path eligible without beyond-event consent. Do not change attendance, submission limits, or target rules in this task. |
| Admin/manual interests | interests.create requires eventId and uses createInterestWithRules. Sources admin_entered/email/whatsapp describe capture channel, NOT scope. An event label does not prove both people attended; assertCanCreateInterest does not impose co-attendance. Product must decide whether this facility legitimately includes off-event introductions and how those are recorded. Do not silently reclassify it or add a new attendance restriction. |
| Interest conversion / mutual matches | interestRules.createMatchFromInterest and createMutualInterestMatch persist interestId and initiatedBy=interest_signal. Their linked interest provides an event context; neither records beyond-event scope. Preserve conversion and mutual event flows. |
| Existing candidate/general admin data | registrations.getAll is a general administrative list, not an identifiable beyond-event candidate endpoint. Baseline matching workbench consumes interests.getAll/matches.getAll/profileShares.getAll. Globally filtering these would hide event/admin records. A purpose-specific beyond-event candidate endpoint is needed once product identifies that workflow. |
| Existing matches | matches schema has optional interestId and initiatedBy (admin_recommendation/interest_signal); no scope or direct eventId. Missing interestId, missing/deleted interest, legacy missing initiatedBy, and admin_recommendation are not proof of beyond-event origin. Preserve historical rows; do not backfill scope from these heuristics. |
| Match advancement | matches.updateStatus can review/reopen and perform existing bilateral contact consent checks; applicantInterests.respondToInbound/giveFinalApproval advance linked interest flows. There is no safely identifiable beyond-event subset to gate today. Once explicit scope exists, recheck both preferences transactionally on future advancement, including reopening. Preserve withdrawal/decline/close availability. |
| Queued promotion | interestRules.promoteOldestQueuedForRegistration/activateInterestAndQueueCompetitors can resume work following closure. Current interests are event-labelled. Any future explicitly beyond-event queue must skip opted-out people rather than activate stale consent. Do not block existing event queues. |
| Profile shares | profileShares.create takes optional interestId/matchId, so even a share can be unlinked. getByShareToken exposes an existing share. Neither is a scope marker. Existing photo consent remains independent and unchanged. Product must specify future sharing and already-issued-link behavior for revoked, explicitly beyond-event connections. |
| Notifications / external actions | matches.markNotificationSent/markContactSharedNotificationSent are receipt bookkeeping, not authorization before sending. A check there would be too late. src-owned API send/share routes need purpose-aware pre-send authorization once scope exists; do not confuse an audit marker with a delivery gate. No messages sent. |

## Pending PR48: do not merge unchanged as an opt-in-compliant feature

PR48 adds matches.create and /api/admin/create-match plus NewMatchDialog. The dialog reads registrations.getAll, then filters approved + completed + active search + no activeMatchId. The mutation rechecks those eligibility rules plus admin secret, gender/self, duplicate pair, and note length. **Neither candidate selection nor creation checks matchmakingPreference.** It inserts status=new, interestType=admin_suggested, initiatedBy=admin_recommendation, without interestId, eventId, or scope. The route carries no scope either. It does not send email, grant consent, or share contacts/photos.

The feature is described as an admin-only suggestion; that does not establish whether an admin can suggest people met at an event. Therefore PR48 is ambiguous, not automatically beyond-event. It was inspected only, not imported or modified in this worktree.

Required product decision: Is New match exclusively beyond-event matchmaking, or a mixed event/beyond-event tool?

- If exclusively beyond-event: declare that contract; filter candidates by exact beyond_events server-side and in the dialog; reject direct create calls unless both current preferences are beyond_events; persist explicit scope for subsequent actions. An admin credential must not bypass this.
- If mixed: require an explicit purpose in UI/API/backend. Event mode needs a defined event-association/eligibility contract; beyond-event mode needs the exact preference gates above. Persist the distinction. Do not let a client choose event mode as an unvalidated consent bypass.
- Legacy records require a separate evidence-based/manual classification decision. Do not classify all PR48-shaped or admin-recommendation rows as beyond-event solely from shape.

## Revocation and in-progress decisions

Revocation must immediately exclude an applicant from future identifiable beyond-event candidate consideration, creation, review/reopen, automatic promotion, and new outreach/sharing. Checks must read current preferences for both parties, not cached candidate eligibility or a stored consent snapshot. Preference updates must not delete matches, cancel event registrations, change photo permission, revoke approvals, clear activeMatchId, or rewrite contact consent.

Before enabling scope-aware in-progress behavior, product must decide:

1. Treatment of new/reviewing suggestions versus already mutually accepted introductions: stop future beyond-event advancement without deleting history; how should an admin see the block?
2. Whether existing bio/profile-share URLs remain readable after revocation, and what retention/history is visible. Stopping new use does not justify silently altering already-issued photo/contact permissions.
3. Already contact-shared matches: retain record and pointers; do not pretend disclosed contact data can be recalled. Decide future follow-up/reminders and whether the person remains occupied for other queues.
4. Whether closing or pausing a blocked match should promote other queues, and how a later re-opt-in resumes work. No automatic reopening or retroactive approval.
5. How ambiguous existing/manual records are classified with auditable evidence, and how event-labelled admin introductions outside actual attendance are treated.

Until these decisions and persisted provenance exist, full “revocation stops future beyond-event use” cannot truthfully be declared implemented across matching. Storage/UI work can be reviewed separately, but operational release must carry this blocker.

## Validation

Added matchingScope.test.ts with synthetic Convex coverage: event-labelled interest creation and conversion remain available for missing/events_only/beyond_events preferences; changing to events_only preserves existing match, event attendance, independent photo consent, and current match state; ambiguous legacy/admin match advancement is deliberately not reclassified. Existing matchingWorkflow/interests suites protect event and bilateral disclosure behavior. Tests are local/in-memory only, not live verification. Executed: npx vitest run convex/matchingScope.test.ts convex/matchingWorkflow.test.ts convex/interests.test.ts — 3 files, 28 tests passed (6 new). npx eslint convex/matchingScope.test.ts and npx tsc --noEmit both passed against the concurrent worktree at audit time.

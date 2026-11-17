# Admin Interests filters (preview approval only)

Source baseline: c094dda006f174d6d9861fdf4ad68c37ecbbb4f7, the verified serving source of release6343. Includes repair127 and audited267 refund; no backend functions/schema/config changes. Unrelated dirty main checkout untouched.

## Semantics
- Dataset: existing authenticated full consistent paginated interests.getAll bridge projection, with canonical alias deduplication unchanged. Global counts cover this complete dataset across all events, visibility, search and gender, not only rendered/filter results. Counts count interests, not unique people.
- Gender: submitting/from participant, explicitly labeled. Missing submitter gender contributes to Total but neither Male nor Female.
- Canonical workbenchReview is authoritative. Closed and Contacts released are Closed. Queued and Deferred are Queued. Explicit Waiting on initial/final decisions and validated admin contact-release approval are Waiting for Approval. Paused, blocked, unverified, not-yet-shared and other unresolved rows stay Open without being falsely labeled Waiting. Thus Queued + Waiting need not equal Open.
- Missing canonical projection uses conservative raw lifecycle fallback; never infers approval from legacy flags. These are display categories only, not operational state transitions.
- Status, open substatus, submitting gender, search, event, visibility and mutual-only compose. Search matches either public applicant number exactly (including # / Applicant #) and existing visible names; existing notes/source/event matching retained. No internal applicant numbers.
- Stat click changes its dimension and keeps other filters/search. Open/Closed resets substatus; Queued/Waiting selects Open. Total and Clear Filters reset everything including event/visibility/mutual/search.

## Updates
Authenticated same-origin POST stream subscribes server-side to every existing workbench and disclosure page, including terminal pages; sends only invalidations. Complete consistent snapshots are serialized and coalesced. No browser secrets, new public data projection, periodic full-roster polling, operational writes, schema change or backend deployment. Streams rotate at55s for hosting limits and reauthorize; bounded retry1–30s. Existing note editors remain mounted. Other existing admin queries retain incumbent behavior.

## Verification
- 2128 tests /166 files pass in isolated worktree (includes25 new filter tests and20 transport tests).
- TypeScript passes; scoped lint only incumbent img warning after removal of unused icon.
- Browser synthetic actual /admin/interests desktop1440 and mobile390/320:3 tests pass. Composite filters, global invariant, search, zero-result, clear, statistic click, keyboard Enter, simulated live record refresh, no horizontal body overflow and zero mutations.
- Six synthetic screenshots in evidence/interests6370. Screenshot visual model inspection is currently blocked by local-media policy; DOM/accessibility and layout checks passed, not claimed visually inspected.
- Independent review found canonical precedence issue; fixed and three regression combinations added. Final transport review found warning-clearing and silent-stall issues; both fixed with separate error channels and a25s watchdog plus7 regression tests.
- No live deployment, participant mutations or emails. Hosted preview is build-Ready at https://taaruf-git-feat-interests-admin6370-bannaa.vercel.app/admin/interests (PR207). Browser verifies admin login and UI-review-only backend-disabled banner. Isolated hosted backend is not configured for this branch; no config changes were authorized. Functional hosted streaming remains unverified; never use production participants for acceptance. DCO requires human certification; automated Codex review failed rather than passing.

# Approved issue release: preview gate

This branch is based on origin/main after PRs #34 and #35. It does not incorporate the unrelated dirty checkout or PRs #1/#5.

## Backend and privacy

- No live backend deployments, migrations, uploads, real test emails, or merges were performed.
- Existing Vercel Preview CONVEX_URL and NEXT_PUBLIC_CONVEX_URL both point at the live clever-meerkat backend. No preview deploy key is present in the available project environments. Therefore this preview **must not** be used for functional acceptance or real submissions.
- Preview middleware blocks API access (including GET magic-link/session mutations), except local admin sign-in. The client provider uses a non-routable backend and the page shows a UI-review-only notice. This is fail-closed, not a functioning isolated backend.
- Functional preview requires a separately provisioned Convex deployment containing this branch, synthetic fixtures only, matching server credentials, and PREVIEW_BACKEND_ISOLATED=true only after both backend URLs have been verified isolated. Do not set that flag on the current live-backed preview environment.
- Configure ATTENDANCE_ADMIN_SECRET identically on the isolated Next/Convex services; attendance APIs fail closed if absent. Contact sharing requires ADMIN_PASSWORD configured identically on the isolated Next/Convex services.
- Contact sharing means actually revealing contact details in both authenticated portals after bilateral final approval. The admin action does not send emails. Photos require separate owner consent; legacy share links no longer override a refusal.
- Existing broad legacy Convex admin APIs are not a full authentication redesign in this PR. Newly introduced attendance and contact-sharing actions are server credential protected. A broader authorization audit remains advisable before any live rollout.

## Attendance semantics

“Latest event” is interpreted as the latest completed, already-ended event in the existing 1plus1_match series. Existing interest-window restrictions remain. Real Talk (real_talk) is attendance-only and cannot grant matching eligibility or supersede matching events. Both requester and target must be on that event's new attendance sheet. No old interests are modified.

The new sheet uses a dedicated eventAttendees table with an indexed pair check and insertion in the same serializable transaction, so concurrent additions cannot duplicate a pair. Event deletion is refused while attendance history exists, consistent with existing related-record deletion protection. Existing event-registration attendance is not silently migrated: administrators must verify/import the actual attendance sheet before enabling submissions. Maximum three applicant submissions per matching event includes withdrawn/declined entries; existing open-interest cap also remains.

## Data blocker

Read-only live query on 2026-10-20 found 240 registrations: 38 have no imageStorageIds, 202 have resolved image URLs, and 0 have storage references but no resolved URLs. This indicates absent upload references rather than a URL-resolution outage for these 38 cases. Issue #21 remains a data-recovery/re-upload blocker; the admin profile now distinguishes missing uploads from unavailable/broken images. No missing applicant photos may be manufactured or reconstructed from unrelated uploads. Keep any remaining absent-upload cases open for source recovery or applicant re-upload.

# Approved issue release: preview gate

This branch is based on origin/main after PRs #34 and #35. It does not incorporate the unrelated dirty checkout or PRs #1/#5.

## Backend and privacy

- No live backend deployments, migrations, uploads, real test emails, or merges were performed.
- Existing Vercel Preview CONVEX_URL and NEXT_PUBLIC_CONVEX_URL both point at the live clever-meerkat backend. No preview deploy key is present in the available project environments. Therefore this preview **must not** be used for functional acceptance or real submissions.
- Preview middleware blocks API access (including GET magic-link/session mutations), except local admin sign-in. The client provider uses a non-routable backend and the page shows a UI-review-only notice. This is fail-closed, not a functioning isolated backend.
- Functional preview requires a separately provisioned Convex deployment containing this branch, synthetic fixtures only, matching server credentials, and PREVIEW_BACKEND_ISOLATED=true only after both backend URLs have been verified isolated. Do not set that flag on the current live-backed preview environment.
- Configure isolated service credentials according to [.env.example](../.env.example), including for contact sharing.
- Contact sharing means actually revealing contact details in both authenticated portals after bilateral final approval. The admin action does not send emails. Photos require separate owner consent; legacy share links no longer override a refusal.
- Current authorization remediation and acceptance status are owned by [the photo-consent release gate](issue58-photo-consent.md#limits-and-release-gate).

## Attendance semantics

Current submission eligibility is owned by the [event registration reference](event-registration-and-interest-prd.md#shared-event-interest-requirements). That contract supersedes the original latest-ended-event/window proposal and attendance-sheet gate in this preview note.

The dedicated eventAttendees sheet preserves attendance history separately; it is not silently migrated. Event deletion remains refused while related attendance history exists. Per-event submission quota and explicit test resets are documented in [the reset guide](../ops/reset-review.md).

## Data blocker

Read-only live query on 2026-10-20 found 240 registrations: 38 have no imageStorageIds, 202 have resolved image URLs, and 0 have storage references but no resolved URLs. This indicates absent upload references rather than a URL-resolution outage for these 38 cases. Issue #21 remains a data-recovery/re-upload blocker; the admin profile now distinguishes missing uploads from unavailable/broken images. No missing applicant photos may be manufactured or reconstructed from unrelated uploads. Keep any remaining absent-upload cases open for source recovery or applicant re-upload.

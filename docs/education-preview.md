# Request 3176 — education editing preview

Port of PR42 (d3248392), based on verified live commit 6410109f779defd40fdb9cfa6057cb3bb5ae0599 (PR93). Vercel production alias inspection on 2026-11-10 identified deployment dpl_2WQZ45Jqii3qYB41KExbdVgu3cCu and matching gitCommitSha. PR93 remains open; production is ahead of origin/main. This is a stacked, education-only PR against fix/profile-review-3052. Independent capacity PR96 is not included.

- Education is loaded, edited and saved in /me#profile and the token completion editor. Shared choices cover all 11 degrees, including Associate’s degree, Trade school and Other; signup and existing display surfaces share labels.
- Omitted education and unchanged historic strings survive updates; new unsupported values are rejected. Legacy College signup compatibility remains. No schema/data migration.
- Existing server credentials, session/capability cutoff, image ownership, safe projections and newer profile behavior remain intact.

## Verification

- Isolated worktree npm test: 756 tests / 64 files passed. Convex-test uses actual queries/mutations against synthetic in-memory storage, never hosted applicant data.
- Typecheck passed; lint passed with 8 existing warnings / 0 errors; production build passed.
- Playwright: 3 tests passed against production build with synthetic API interception. Both editors preserve initial historic value, save/reload all 11 degree options and ethnicity; signup exposes all 11 options. This is not hosted-backend E2E.

## Hosting / approval gate

No live backend deployment, real profile changes, email or merge. Hosted preview remains UI-review-only: middleware blocks API access with 503 until a verified isolated backend is configured. Do not set PREVIEW_BACKEND_ISOLATED=true against the live backend. No isolated hosted Convex deployment is available in this work; hosted authenticated save/reload acceptance remains blocked. Synthetic browser interaction and in-memory backend persistence are separate evidence, not a hosted roundtrip.

Preview approval and matching backend release approval are still required before live use. If capacity PR96 ships meanwhile, rebase/integrate this scoped education change on that newly verified live baseline and rerun validation before any future live release; do not deploy this older full tree over it.

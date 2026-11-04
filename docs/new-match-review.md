# New match button repair

Base: e059e5d (PR44), retaining 5c2ad0e / PR41 live-release lineage. Do not deploy old main.

## Root cause
The shared admin Topbar New match button was an inert shell stub: no onClick, link, DialogTrigger, or mounted creation form. Present since e56e3e7. Workbench only exposed existing interests/matches; no direct admin-match create API existed. Independent of the Convex URL provenance question.

## Scope
Exact top-right control opens an accessible Radix dialog with eligible applicant selectors and optional notes. Authenticated admin API bridge calls a secret-protected transactional mutation. Records are admin-only suggestions, status new, without fabricated interests or consent. Workbench reacts to query-parameter updates so same-page creation selects the new row.

No emails, profile changes, contact disclosure, photo permission changes, applicant-number changes or event changes. Eligibility rechecked server-side; duplicate/self/gender guards fail closed. Existing bilateral consent guard remains unchanged. A suggestion does not establish an applicant consent workflow.

## Verification
42 new Convex/API regression tests, including actual POST handler bridged to in-memory convex-test persistence. Browser harness drives actual Topbar/dialog with production CSS and synthetic query/API adapters at desktop 1440 and mobile 390: opening, selection, failure with retained input, retry/success navigation, Escape. Not full hosted-backend E2E. Typecheck, scoped lint and production build pass; existing img warning remains.

## Release gate
Production untouched. Publish non-live preview only. Hosted previews remain UI-review-only without PREVIEW_BACKEND_ISOLATED=true; never submit real applicant data. Functional hosted approval requires isolated compatible Convex and server-only admin secret. After explicit approval, deploy reviewed backend addition and matching frontend together, preserving PR41/44 lineage and branch/DCO checks. Do not deploy old main or bundle other issue work.

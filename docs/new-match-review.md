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

## Real isolated backend verification — November 3, 22:57 CST
Actual precompiled Convex backend bound only to 127.0.0.1:3340 (fresh SQLite), actual Next dev server on 127.0.0.1:3342, real browser/admin cookie/API/mutation chain. No hosted resource creation or external email credentials. Synthetic fixtures exist only in untracked .local-validation/convex, never release convex/.

Desktop 1440 and mobile 390 both passed: exact top-right click, applicant selection, persisted match creation, same-page workbench navigation, repeat-pair error displayed. Snapshot checks prove unchanged synthetic profiles/interests/consent flows/shares/email records. Invalid mutation secret rejected. Both servers stopped after verification. This exposed and fixed Next loopback URL normalization causing valid same-origin requests to be rejected; five additional regression tests cover proxy-facing Host and malformed/cross-origin values. Full suite: 185 passed; typecheck and scoped lint pass.

Read-only authenticated live parity: current event-waitlists-release tree exactly matches all 33 live backend module hashes, no changed or remote-only modules. Byte-for-byte comparison confirms its entire convex/ source equals e059e5d baseline (including generated files; excluding test files). Candidate differs from that baseline only in matches.ts and new tests. Alternate worktree bundle hashes vary with path/source-map/dependency resolution, so use the proven source equivalence rather than claiming candidate raw bundles already match live. Target verified: clever-meerkat-940.eu-west-1.convex.cloud. No merge47 or other issue changes included.

Remaining gate is explicit preview approval under AGENTS.md “Approval and preview workflow (2026-10-15)”: approving implementation/apply-a-fix is not preview approval. Hosted preview is Vercel-protected and remains UI-review-only; functional local backend verification is now complete. No production deployment performed.

# Sister outbound review routing — request3861

Narrow Operate-mode refinement preserving existing visual design, inferred from the explicit brief (subagent; no design interview needed).

Female-initiated review controls, own decision status and authorized profile render within Outbound Interests; brother-initiated inbound remains separate. Links and selection are keyed by interestId, not participant identity. Legacy inbound fragment links still resolve the selected sister review into Outbound. Counts include distinct authorized review-only records, with selectable fallback rows, and no contradictory empty footer. Browser history restores exact selections. Archived applicants do not mount workflow actions.

Validation: 1378 Vitest tests across115 files; root and Convex TypeScript; ESLint zero errors (13 incumbent warnings); production build; 8 Chromium desktop1280/mobile390 tests covering before acceptance, pending final, approved and declined; reciprocal inbound and two independent outbound selections; back navigation, focus, contact withholding, no overflow. Browser fixtures intercept all API and websocket traffic and block writes: synthetic UI evidence, not a live-data or backend integration claim. Impeccable detector: no findings.

Base: 3ceaf5a68f2303e2336062f446706bd8ecde8723 (PR149 remediation descendant of approved bb23b478e8e60b2f7cbb2ec1fdf22db198fb5430). No backend/data/email changes or production deployment. Fresh exact-SHA human DCO and release approval required.

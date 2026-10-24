# Education editing preview

Adds education to the signed-in Profile section and token-based completion editor, with shared options/labels across signup, profile cards, admin detail/list/CSV and shared profiles. Adds Associate’s degree, Trade school and Other; retains High School, Bachelor’s, Master’s, PhD, JD, MD/DO, MD/PhD and JD/PhD. Ethnicity remains editable alongside education.

Saved strings remain unrestricted in the schema: no migration or rewriting. Updates may omit education (old clients) or echo the existing historic string; changes must select a supported value. Signup rejects unsupported values, retaining the existing legacy College input at the backend.

## Verification
- npm test: 98 passed across 14 files (21 new education/API cases).
- npx tsc --noEmit: passed.
- npm run lint: passed, 0 errors / 7 pre-existing warnings.
- NEXT_PUBLIC_CONVEX_URL=https://synthetic-test.convex.cloud npm run build: passed.
- npx playwright test --config playwright.education.config.ts: 3 passed using installed Chrome and the production build. Synthetic API interception proves options and education/ethnicity save/reload in both editors, plus signup selection. This is not hosted-backend E2E.
- Convex-test runs actual queries/mutations against its isolated in-memory database: all 11 degrees saved/read through signup and both editors; old values/omission preserved, invalid values rejected, other applicant unchanged, missing/expired/revoked sessions rejected. API tests verify cookie-derived ownership and forwarding.

## Release gate / limitations
No live Convex deployment, real-profile mutation, email or merge was performed. The hosted preview is UI-review-only: existing middleware fails closed with HTTP 503 on API access unless PREVIEW_BACKEND_ISOLATED=true is explicitly configured. Do not set that flag for the live backend. No isolated hosted Convex environment was provisioned; signed-in profile editing cannot be tested against that hosted preview yet. Local synthetic browser tests and isolated Convex-test persistence are separate evidence, not a live roundtrip.

After preview approval, the matching backend must be deployed as part of the approved release before real use of the new frontend. Preserve the approval gate.

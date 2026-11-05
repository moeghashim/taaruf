# Explicit matchmaking preference — review candidate only

Base freshly verified 2026-11-04: live Vercel source e059e5d58649f1cfd3e288eaefa23842b8290b72 (PR44 on PR41/5c2ad0e), not old main. Isolated branch feat/explicit-matchmaking-opt-in. PR48 remains separate, unmerged. No deferred merge47 or other issue changes.

## Implemented
- Required mutually exclusive registration choices, neither selected initially. Exact requested copy; existing blanket-consent text removed.
- Optional schema fields retain unknown legacy preferences. Strict backend enum, server timestamp, copy version matchmaking-2026-11-04-v1, append-only history. Returning event checkout preserves consent; generic profile saves cannot alter it.
- First-class authenticated /me control: saved state, opt-in, withdrawal, re-opt-in. Dedicated session-only mutation and revision check prevent stale forms restoring permission. Admin detail distinguishes unknown from opt-in.
- Photo/contact permission, event eligibility/registrations and existing matches unchanged.

## Release blockers / decisions
**Not an operational opt-in enforcement release.** Existing matching records do not distinguish event versus beyond-event use. See matchmaking-scope-audit.md. Product must define whether PR48 New match is exclusively beyond-event or mixed; mixed needs validated event provenance. Then gate purpose-specific candidates, creation, advancement, reopening, queued promotion and outreach using both current preferences. Decide in-progress match/link treatment; no retroactive deletions or implicit photo/contact changes.

Independent review found inherited public profile-token exposure/setter and public chosen login-token issuance. Candidate removed the added profile-token consent mutation entirely and gates login-token issuance with existing server-only ADMIN_PASSWORD, forwarding it from both legitimate server callers. No live configuration altered. This prerequisite must be coordinated across Next and Convex before any eventual release; absent/mismatched secrets fail closed. Existing public registration/profile-token APIs remain a separate inherited privacy issue; no claim of comprehensive auth remediation.

Independent re-review PASSED the targeted repair, not production release. Previously forged sessions remain usable and unconsumed legacy login tokens remain claimable; old expiry was caller-controlled, so normal TTL waiting is insufficient. Operational release requires explicitly authorized invalidation/re-authentication remediation. We made no such production changes.

## Verification
- 171 tests, 24 files passed (138-test baseline). Typecheck passed. Full lint: zero errors, seven pre-existing warnings. Production build passed with preview safety enabled.
- Four Playwright UI checks at desktop 1280/mobile 390 (synthetic adapters): registration unselected radios, keyboard selection, profile control saved state and conflict handling. artifacts/matchmaking-*.png.
- Actual disposable Convex backend 127.0.0.1:3350 + actual Next UI 127.0.0.1:3352: desktop 1440/mobile 390 keyboard opt-in/reload/withdraw/stale rejection/re-opt-in; history persisted; photo/event/match/share/email states unchanged; anonymous update rejected. No email credentials or real data.
- Final backend auth test: unauthorized token issuance/forged session denied, legitimate synthetic server issuance/session-owned preference update succeeds, removed token-based mutation unavailable.
- Local raw logs, SQLite, fixture and harness kept OUTSIDE release tree in ../matchmaking-opt-in-validation. Fixture not in release convex/. No cloud backend deployments, production mutations, emails or real applicant reads.

Hosted preview is UI-review-only: inherited middleware blocks API routes except admin-cookie sign-in and provider disables live Convex access unless explicit isolated-backend flag. Do not submit real data. Local functional evidence does not mean hosted backend is configured.

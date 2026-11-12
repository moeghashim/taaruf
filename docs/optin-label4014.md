# New match explicit opt-in labels — 4014/4015

Append exactly ` (opted in)` after the existing applicant number/name only when `backgroundMatchmakingOptIn === true`. Both native selectors retain IDs, ordering, eligibility and selected labels. False/missing and unrelated event/online consent never qualify. No mutation, auto-opt-in, draft restriction or presentation-consent change.

The existing admin-only Convex `matches.getCandidates` and authenticated Next route both omitted this field; each projection now includes only this additional optional boolean. No shared applicant projection or schema changes. A compatible backend query deployment is required after explicit release approval; the hosted preview remains UI-review-only with existing API guards unchanged.

Validation: 1405 tests / 119 files; root + Convex types; scoped ESLint; production Next build. Independent review found no production/security defects; its invalid test-fixture status finding was fixed to `in_progress`, then full suite passed. Built Next UI synthetic browser checks at 1440, 390, 320 verify both option lists, every selected label (true/false/missing/string/number), preserved IDs, no overflow of dialog, and draft submission with false/missing consent. All API requests intercepted and external traffic/WebSockets blocked; no real writes.

Reproduce browser checks: build, start on 127.0.0.1:3404 with ADMIN_PASSWORD=synthetic ADMIN_TOKEN_SALT=synthetic-salt, then `node scripts/test-optin-label4014.mjs`. TEST_OUTPUT can set artifact directory. Local evidence: `/Users/moeghashim/taaruf/privateops/optin4014/`. Screenshots captured; visual image inspection blocked by tool directory policy, so no pixel-inspection claim.

Live baseline freshly verified c45880fed33b2718984216d4f8de2e0f2782f5d7. Concurrent signup tree untouched. No production deploy, merge, email, preference change or human DCO certification performed. Exact-SHA human certification and preview/release approval remain required.

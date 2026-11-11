# Match workbench event filter (3043)

Based on serving release a8c0790fe82cdfba5b186de2ddfe274416dcae60. Omar3077 approved the separate **No recorded event** option.

- Interests use their persisted eventId, never participant event registrations.
- Matches use a valid primary interest: matching interest ID, reciprocal match backlink, correct distinct participant pair, no test-reset marker. Otherwise they appear only in All events / No recorded event.
- Both selectors, contextual records, counts and nested match actions use normalized scoped records. Reciprocal interests may reference the same valid match only within its event.
- Event changes clear selections and notices. Invalid/stale deep links never fall back to a different record. Use event, interest or match URL parameters for initial selection.
- Authenticated bounded queries scan all pages (100 rows/page), including empty pages after reset filtering; no 1000-record limit. Only complete scans are displayed. Errors hide stale data and offer Retry.
- Global conflict checks, consent, contact gates, authentication, reset helpers and email activation remain unchanged. Outside-filter active matches produce a generic safety warning without displaying other-event records.

## Validation

735 unit tests; root and Convex types; declared npm run build (Turbopack); synthetic production-browser tests at 1280/390/320; authenticated serving-backend dry run with enabled types and before/after unchanged module hashes. No backend deployment or production data operations. Browser requests are intercepted, including all APIs; no real messages/submissions.

Browser reproduction: build, then start with ADMIN_PASSWORD=synthetic-workbench ADMIN_TOKEN_SALT=synthetic-salt npm start -- --port 3143, and run npx playwright test -c playwright.workbench-event.config.ts (installed Chrome).

Preview APIs remain fail-closed without an explicitly isolated backend. Preview is UI-review-only; synthetic browser evidence is not a live-data acceptance test. Exact new automation commit needs fresh human DCO/release approval; prior approvals do not apply. Profile task3052/3055 is separate.

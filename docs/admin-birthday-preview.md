# Admin birthday display — preview only

Request4634 adds Date of birth immediately after Age in the admin profile drawer, only when recorded. Missing/invalid values hide the row. The formatter treats DOB as a UTC calendar date (e.g. February29,2000), never browser-local midnight. Age and applicantnotes are unchanged.

## Privacy boundary
- Existing registrationBirthdays private storage unchanged; no data migration or backfill.
- adminBirthday.get requires the server admin bridge credential before any lookup and accepts exactly one registrationId.
- The authenticated same-origin admin bridge exposes only this dedicated detail operation, private/no-store.
- No DOB added to registrations.getAll, ordinary profile records, matching, shared profiles, or public responses.
- Drawer query keys include profile ID, so switching profiles cannot reuse the previous birthday.

## Verification
Full isolated suite:133files/1605tests, application and Convex TypeScript pass. Includes admin auth/missing configuration, absent/deleted profile, read-only lookup, broad-response privacy, bridgecookie/origin/cache protection, invalid dates and timezone cases. Existing matching/shared birthdayprivacy tests retained. Real component synthetic browser proof at1440desktop and390mobile in Kiritimati/Honolulu: recorded/absentDOB, unchangedage, profileswitch, no overflow, no external requests/errors.

## Preview boundary
https://taaruf-fl9dnspjh-bannaa.vercel.app is a READY static synthetic UI-only preview; Vercel team sign-in required. It renders the real drawer with synthetic fetch responses, blocks all outbound connections via CSP, and has no live backend or credentials. Only index.html,preview.js,preview.css and deploymentconfiguration uploaded; private snapshots/evidence excluded. Buttons do not submit real changes. Backend permission behavior is tested locally, not deployed to an isolated hostedbackend; this is NOT a full-stack approval environment.

Livefrontend978fc88 remains unchanged. Releasebranch starts at approved live-compatible e798567 and separately preserves the already-deployed registrationMerge repair, so a future release must not revert it. New DOBreader is isolated in adminBirthday.ts rather than added to the widely imported birthdays utility. A normal bundle adds oneentry and may regenerate dependencychunks; any eventual live release needs fresh baseline/manifest review and explicit previewapproval. No production deployment/datawrites/configchanges authorized or performed.

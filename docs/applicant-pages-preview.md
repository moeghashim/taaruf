# Applicant portal organization — preview only

Four distinct views: /me (Overview default), /me#applicant-interests, /me#profile, /me#matchmaker-matching. Native fragment links support history and refresh; existing section and connection links remain valid. Profile state stays mounted across views; unload/logout warns, session expiry retains dirty edits.

Preserves cream/green serif identity, existing actions and permissions. Events on Overview; reviews/submission/inbound/outbound/private on Applicant Interests; all profile edits including DOB/education on My Profile. No backend changes, real records or emails.

Validation: 1,038 tests, TypeScript, production build, lint zero errors (8 existing warnings), eleven production-rendered synthetic browser scenarios at 1280/820/390/320px for both genders. Covers directlinks/refresh/back-forward, DOB/education save, event registration, interest submission, consent and dirty/session-expiry state. Desktop/mobile screenshots inspected. Independent review findings fixed.

Integrated live baseline: b5320f98d493e0c1748c22455f609ebfe849bc26 (PR118), preserving rejected-profile logistics suppression and removed internal draft copy. Rejected logistics tested across all four views; Events remain on Overview. Any subsequent live changes require release reconciliation. Production deployment NOT authorized.

Hosted preview middleware blocks backend access: UI-review-only, no real submissions. Browser checks inject synthetic responses into the production frontend. Real backend roundtrips are not claimed.

# Isolated browser proof — 2026-11-06

PASS using installed Google Chrome via Playwright, desktop 1440×1000 and mobile viewport 390×844. Actual Next dev on 127.0.0.1:3388 and actual isolated Convex on 127.0.0.1:3340; no mocked application responses. Next launched with env -i and only PATH/HOME, development mode, telemetry disabled, loopback Convex URLs, synthetic admin password/salt and runtime attendance secret. No app URL or email/provider credentials. All browser HTTP and WebSocket non-loopback destinations hard-blocked, service workers disabled. No external request attempts observed. Dev server stopped after proof.

- Events detail: accessible ON/OFF switch and exact requested helper text.
- Second event ON: visible conflict instructs turning current event OFF first.
- Future event, expired old close date: eligible applicant can submit.
- Admin attendance undo/attended and OFF/ON remove/reveal applicant interest forms without reload (one document request total).
- Real browser form held in flight while admin switched OFF: backend HTTP 409 and visible actionable error. No fabricated response.
- Successful real form submission: sender 907 to recipient 910, whose registration has zero event roster rows.
- Desktop and mobile admin/applicant screenshots: document scrollWidth equals viewport width. Mobile OFF also removes forms live.
- Zero event email records. Notification safely records failure because app URL absent, rather than attempting email.

Artifacts: interest-browser-proof.log, interest-browser-result.json, interest-browser-final-snapshot.json, interest-browser-artifacts/*.png (9 screenshots). Repro script: interest-browser-proof.mjs. Existing runtime browserSessions helper SHA256 matched raw synthetic-browser-7 cookie. A duplicate synthetic session from helper re-execution was deduplicated using runtime-only interestFixture:dedupeBrowserSessions; no release application code modified.

Caveats: UI calls this the Submit Interest panel/forms, not a separately named ribbon. Screenshot files captured successfully, but assistant image viewer denied this worktree path; overflow verified programmatically, not claimed as visual human review. Google font build download failed and fallback font rendered. Mobile is real Chrome viewport emulation, not a physical phone.

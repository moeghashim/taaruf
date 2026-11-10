# Isolated test-pair reset verification

Never run fixtures against a shared or production backend. These scripts require a disposable Convex backend on 127.0.0.1:3820 and Next on 127.0.0.1:3822. No production credentials or email settings are needed.

Copy fixture.ts.txt to the disposable copy's convex/resetFixture.ts (never deploy it with the release). Import **synthetic** registration documents using the two fixed IDs from adminPairTestReset.ts and public numbers 219/220; names Sister Synthetic/Brother Synthetic, approved completed profiles, female/male respectively. Fixed IDs must be preserved by the import; use an empty disposable database. Deploy the candidate plus fixture only there. Set the synthetic backend secret runtime-synthetic-secret. The verifier uses a disposable .local-admin-key file in its working directory, not an application credential.

Copy verify.mjs to the disposable project root with node_modules. It seeds attendance/sessions and third-party controls, executes four cycles of actual submitInterestNumber calls in both directions, checks stale concurrent resets, post-write rollback, replay/no-op, preservation, quota accounting, review/share revocation and pending-delivery cancellation, then accepts two fresh normal submissions. It writes proof.json. Run once per fresh fixture.

Run Next with ADMIN_PASSWORD=synthetic-admin-only, ADMIN_TOKEN_SALT=synthetic-salt, ATTENDANCE_ADMIN_SECRET=runtime-synthetic-secret and NEXT_PUBLIC_CONVEX_URL pointing only to the disposable backend. Copy browser.mjs to that project root. It checks nonadmin/origin/foreign-pair denial and actual confirmed reset at desktop/mobile sizes, writing screenshots and browser-proof.json. Browser uses installed Chrome.

Evidence for this candidate: privateops/admin-pair-reset-3002/runtime/{proof.json,browser-proof.json,desktop.png,mobile.png}. Complete unit suite: 708 passed. Production build, typecheck and targeted lint passed.

Existing route-level notification emails are not retractable once started. UI warns they may arrive after reset; retired workflow links cannot restore access. Outbox attempts/in-flight leases fail closed for reconciliation. No global outbox changes or email sends are part of reset.

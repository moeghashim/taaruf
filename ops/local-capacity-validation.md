# Real local Convex capacity validation — 2026-10-23

PASS at 14:31 America/Chicago. Actual precompiled Convex backend (not convex-test), SQLite, CLI/client Convex 1.34.1. No cloud deployment, production endpoint, real applicant data, or email API used.

## Evidence
- Both genders: first 60 registrations Pending; 61st–63rd Waitlisted.
- Same waitlisted applicant independently registered Pending in a second event.
- Third event prefilled to 56/gender, then seven bounded four-independent-HTTP-client waves (28 registrations total), reaching **60 reserved + 10 waitlisted per gender**. Every wave asserted reservations <=60 and unique event/profile pairs.
- Backend logged **4 real OCC retry warnings** for registerForEvent; all calls ultimately succeeded. These are genuine overlapping database transactions, not a single HTTP client's serialized mutation queue.
- Four simultaneous retries per gender returned identical row IDs, no duplicates.
- Removal of an Approved seat promoted only oldest queued applicant to Pending, without approvedAt; cancelling a second seat promoted exactly the next applicant. Third remained Waitlisted. Tested both genders.
- Re-registering withdrawn applicant twice through admin addRegistration reused its original row and queued it.
- All **140 complete profile documents** deep-equal before/after (including profile approval/background fields). Independent event rows deep-equal before/after removals. Zero email records.

Output: local-capacity-race-output.txt. Actual OCC warnings: local-capacity-race-occ.txt (synthetic IDs only).

## Executed code scope
Actual application mutations: events:create, registerForEvent, addRegistration, updateRegistrationStatus, updateRegistrationConfirmation. Only synthetic profile/session seeding and read-only snapshots use fixture helpers. Fixture exists only in isolated copy, never release convex/.

SHA-256 of tested files:
- events.ts: 3e2a4d4b7c8911a0f4310086d83d7e7daab9a110c6505b74d2355777f854f8f1
- eventCapacity.ts: e131b9a7091b9b6bb7d8b8f0cc62db44c922e98ac0bbe99d4ef56677a43a8e80
- schema.ts: 2bc29df103122d39985a7940531a8a5d116b1e12afc534c2a0382fd79e7f64c3

The parent concurrently edited release code. An initial successful run was repeated against refreshed events.ts/eventCapacity.ts (including admin-authenticated create). Final tested mutations/capacity helper matched release at completion. Release schema then gained unrelated checkoutLinks/receiptDeliveries tables and optional receiptAttempt; these latest schema additions were **not** in the tested copy. This evidence does not cover checkout/email changes or later mutation edits; compare hashes before treating as final-release evidence.

## Isolation and precise commands
Working copy: /Users/moeghashim/taaruf/.worktrees/event-waitlists-race. Created by copying convex/ and package.json, symlinking release node_modules, **without copying any .env or cloud configuration**. Public upstream development-only instance credentials from the matching backend tag were stored only in mode-600 files in the isolated directory. Credential values are intentionally not included in evidence. This public dev credential configuration is suitable only for disposable loopback testing, never production.

Inspected binary --help. Final backend command, from isolated directory:

```
~/.cache/convex/binaries/precompiled-2026-04-19-53c780f/convex-local-backend \
  --interface 127.0.0.1 --port 3320 --site-proxy-port 3321 \
  --instance-name carnitas --instance-secret "$(cat .local-instance-secret)" \
  --disable-beacon --local-storage ./storage3 ./race3.sqlite3 > backend3.log 2>&1

cp ../event-waitlists-release/ops/local-race-fixture.ts.txt convex/raceFixture.ts
# .env.local contains only CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3320
# and CONVEX_SELF_HOSTED_ADMIN_KEY from the disposable development fixture.
CONVEX_DEPLOYMENT= CONVEX_DEPLOY_KEY= node_modules/.bin/convex dev --once --typecheck disable --tail-logs disable > push3.log 2>&1
CONVEX_DEPLOYMENT= CONVEX_DEPLOY_KEY= node_modules/.bin/convex env set ATTENDANCE_ADMIN_SECRET synthetic-local-only
node ../event-waitlists-release/ops/local-capacity-race.mjs > ../event-waitlists-release/ops/local-capacity-race-output.txt 2>&1
```

The adminSecret above is a deliberately public synthetic test value, not an existing credential. Harness hardcodes loopback; fixture rejects nonempty profile tables. No email provider credentials were configured. Beacon disabled. Listener verified as 127.0.0.1:3320. Backend stopped via process tool after completion; SQLite/logs remain isolated for inspection. To rerun use a fresh database/storage path; seeding intentionally fails on a reused database.

An intermediate repeat failed safely at events:create because concurrent review added required adminSecret; harness was corrected and final run used another fresh database and exited 0. No application files in release were modified by this validation task.

## Final combined source repeat — parent 14:35 CDT
Repeated full real-backend harness with fresh race-final.sqlite3/storage-final, latest combined source including checkoutLinks/receiptDeliveries schema and ATTENDANCE_ADMIN_SECRET receipt authorization. PASS, same counts/profile invariance/FIFO/no duplicates; output local-capacity-race-final.txt. Backend stopped. This repeat had no logged OCC retries; earlier run above proves real OCC retry behavior.
Tested SHA256:
- events.ts d132c019f86d71820203403fa962bf42f8c462ad34cead7704921729d537da7a
- eventCapacity.ts e131b9a7091b9b6bb7d8b8f0cc62db44c922e98ac0bbe99d4ef56677a43a8e80
- schema.ts d1f43c287589581b7146bf2a9e0d23f29ff8e49aa15f46bf49d60eec5140a949
- registrations.ts b75664f224a78114f7ba5d9cf19b23d04c0da802120e2c6b8a4d4fd630266316

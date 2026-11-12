# Issue58 isolated actual-runtime validation — 2026-11-06

**Authenticated consent flow PASS; release BLOCKED by independently reproduced inherited authorization bypasses.** Private security evidence stays inside ignored photo-runtime; do not publish exploit details or describe preview as privacy-safe.

## Actual execution
- New disposable SQLite Convex backend at loopback3450/3451; production-built Next15 frontend loopback3490. No convex-test/mocked backend or mocked browser responses.
- 48 synthetic example.invalid profiles; one generated 1px PNG uploaded into disposable storage. No real applicant data, real photos, cloud deploy, or copied production env.
- Backend matrix: both genders × global unknown/ask_me_first/no/yes × explicit yes/no =16 cases. Male recipient sees photos only for explicit yes; explicit no overrides global yes. Female interest remains private/admin-first and absent from recipient dashboard even with yes. Profiles unchanged.
- Identical retries preserve entire interests/flows/audit/profile snapshot byte-for-byte. Changed choice retries reject. Owner revoke removes recipient URLs; unauthorized revoke rejects; repeated revoke idempotent; yes retry after revoke cannot re-enable. Withdrawn/closed interest invisible and retry rejects. Both genders without photos submit yes with no URLs.
- Real Chrome desktop1440x1000 and mobile390x844: no default consent; submit disabled until choice; identity edits clear choice; Clear choice/cancel writes nothing; failed name400 writes nothing; yes desktop and no female mobile submit200; HTTP retries byte-identical; female recipient has no disclosure through dashboard; actual UI revoke; no-photos helper. Held real POST after event OFF returns409 and visible actionable error, zero interest/profile/audit writes.
- Malformed API null/array/missing or boolean consent/string applicant number/empty name returns400; unauthorized API401. Zero event email rows, no mail credentials/app URL; original notification route intentionally reports email unavailable rather than sending.
- Browser HTTP+WebSocket nonloopback hard-block; service workers blocked. Final blocked array empty (no external attempts). Harness fetch loopback-only. Backend beacon disabled. Frontend/build launched env -i, loopback-only Convex configuration.

## Proof artifacts
- photo-runtime/backend-result.json (passed true), backend-proof.log, backend-proof.mjs
- photo-runtime/browser-result.json (passed true,19 evidence entries), browser-proof.log, browser-proof.mjs
- photo-browser-artifacts/:8 screenshots; all asserted no horizontal overflow. Visual-image inspection tool rejected local allowed-directory access; screenshots still captured by actual Chrome.
- photo-source-hashes.json: SHA256 of125 runtime src/convex source files; zero mismatches against candidate at acceptance. Generated bindings and tests excluded; runtime-only fixture excluded.
- photo-runtime/security-result-private.json and security-proof-private.log: anonymous synthetic profile/photo/private-interest exposure reproduced; release blocked. No live read used.

## Build caveats and lifecycle
Initial Turbopack build failed resolving next/font/google internal font module. Unmodified production source built successfully with webpack (npx next build); build-webpack-final.log. Initial fixture typing error fixed only in disposable ops fixture. No production sources edited by runtime verifier.
Backend and frontend stopped after acceptance, avoiding orphan previews. Local review URL while restarted is http://127.0.0.1:3490/me with synthetic applicant_session cookie photo-runtime-44 (empty mobile profile), photo-runtime-32 (submitted/revoked male), or photo-runtime-35 (private female). No remotely accessible preview claimed. Runtime contains public development key only and MUST NOT be committed.

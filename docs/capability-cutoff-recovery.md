# Capability cutoff and recovery

Release preparation; activation is separate from code deployment.

The authenticated `settings.set` operation accepts the durable `capabilitySecurityCutoffMs` floor. It must be a positive, nonfuture, nondecreasing epoch-millisecond integer. Once present, missing issuance timestamps and issuance at/before that floor are rejected for profile links, share links, pending login tokens and applicant sessions. Invalid stored configuration fails closed.

Deploy and verify fixed authorization paths and compatible cutoff readers on every serving backend/frontend **before** activation. Verify the serving deployment identity and recovery access. Activate once using authorized operator tooling; never put credentials or reusable links in logs. Prove old denial and new recovery on the actual serving stack. No bulk data rewrite or email is part of activation.

Expired or cutoff-denied applicant sessions return HTTP 401, and `/me` redirects to `/login` for recovery. Fresh sign-in establishes a new session after email ownership verification. Authenticated recovery-only profile-token rotation changes the capability/issuance fields without resetting profile completion or content. Replacement shares must still satisfy current recipient consent and lifecycle checks. Never refresh an old token timestamp or reuse an old bearer as recovery.

The cutoff is not a reversible feature flag: never remove/lower it, restore older settings, or roll back to readers that ignore it. Retain the security floor during restore/rollback; otherwise stop traffic and forward-fix. Raising it again requires a fresh impact decision.

Existing direct storage URLs or downloaded images are not recalled by this mechanism. Storage deletion/migration and bulk notifications are excluded. Historical applicant content, interest/match/event/check-in records and audit history are preserved.

Saved photo preferences and recipient-specific overrides are documented in [photo consent](issue58-photo-consent.md#behavior).

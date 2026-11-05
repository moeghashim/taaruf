# Narrow authentication remediation — release prerequisite

Source audit: inherited public registrations.getAll/getById expose profile bearer tokens; public setProfileAccessToken can replace them. Therefore no new consent or archive operation may trust that credential. Consent uses only applicantSessions; archive must do the same. Existing profile-token APIs remain a separate legacy privacy issue, not fixed wholesale here.

Inherited applicantAuth.createLoginToken accepted any caller's email and chosen tokenHash; claimLoginToken then exchanged that known token for a chosen sessionHash. Candidate requires a nonempty matching server-only ADMIN_PASSWORD for issuance; the two legitimate Next server call sites pass their server environment secret. claimWelcomeReceipt already has separate ATTENDANCE_ADMIN_SECRET authorization. No deployment/session mutation has been performed.

## Does everyone need forced sign-out?
Not intrinsically. Only potentially untrusted sessions/tokens must be excluded. However existing rows do not record a trustworthy issuing channel or proof of mailbox verification. Their createdAt/expiry alone cannot prove legitimacy; expiry on old login issuance was caller-controlled. Without trustworthy external issuance evidence, it is unsafe to promise selective remediation from database timestamps alone.

Minimal options requiring explicit approval:
1. Gate only the NEW sensitive consent/archive operations behind newly issued, server-proven sessions after a repair cutoff. Legacy sessions can remain logged in for existing functionality but must reauthenticate to change consent/archive. This minimizes disruption, but does not repair inherited account access generally. Add trusted issuance/version provenance before enabling this.
2. Revoke all pre-fix sessions and invalidate ALL unconsumed pre-fix login tokens (not merely wait 30 minutes); then require fresh magic-login authentication. This is broader operational remediation and needs explicit authorization. Legitimately authenticated fresh sessions need not be revoked.
3. Selective invalidation is acceptable only if reliable external evidence distinguishes legitimate server issuance, never by assumed age or normal TTL.

Neither forced signout nor token invalidation was executed. No evidence of actual exploitation was sought or claimed; no applicant records were read.

## Configuration check
Read-only check of production Vercel ADMIN_PASSWORD presence and the live backend dev:clever-meerkat-940 ADMIN_PASSWORD returned: Vercel value present, backend value absent, equality false. No values printed or saved. Thus the candidate issuance guard would fail closed until separately authorized, coordinated secret setup. PR48 matches.create actually requires backend ADMIN_PASSWORD too; the fresh absence check is therefore also a live configuration warning, not proof the newly deployed button works. Backend ATTENDANCE_ADMIN_SECRET is present, production Vercel ATTENDANCE_ADMIN_SECRET is absent, and production Vercel ADMIN_PASSWORD does not equal that backend attendance secret. New archive must use an explicitly aligned server bridge, not pass a mismatched admin password. No configuration was changed.

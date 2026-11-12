# Explicit shared Resend transport — request4284

Implementation only; not deployment, activation, permission to send, or approval of other preview changes. This branch preserves every PR164 change on live PR163 ancestry. Review the complete candidate before any release.

## Selection and scope

FEMALE_WORKFLOW_EMAIL_CREDENTIAL_SOURCE defaults to dedicated (the existing FEMALE_WORKFLOW_RESEND_API_KEY). No automatic fallback exists. Explicit shared-resend selects the existing backend RESEND_API_KEY only when ALL hold:

- FEMALE_WORKFLOW_EMAIL_MODE=brother-final-request-production
- FEMALE_WORKFLOW_PRODUCTION_APPROVED=true
- FEMALE_WORKFLOW_EMAIL_FROM=1Plus1 Match <contact@1plus1match.com>
- FEMALE_WORKFLOW_PORTAL_URL uses HTTPS www.1plus1match.com or 1plus1match.com without URL credentials
- RESEND_API_KEY is present.

Unknown selections fail closed; a missing selected key never falls back. Shared transport is rejected in isolated, generic production, and every other mode. Isolated tests retain dedicated fake credentials and allowlists. Production-scope unit tests mock every provider call and use fake keys only.

Changing credential source does not enable email mode, create activation timestamps, enqueue historical messages, alter immutable payloads or retry keys, or bypass eligibility/send-time checks. Brother inbound and bilateral final-request activation boundaries remain independent. The scoped mode excludes sister_confirmation, pending_review and contacts_ready.

## Secure operator steps remaining — NOT executed

1. Obtain exact-source preview/release approval and applicable human DCO covering the entire integrated candidate (including PR164). Verify latest live ancestry. Publish matching backend/frontend only after approval, with email mode disabled.
2. Presence-only inspection on November 12 found a nonempty RESEND_API_KEY in serving backend clever-meerkat-940; dedicated workflow key and all workflow mode/sender/origin/approval/credential-source settings were absent. No key value was printed, copied or logged. Presence is not proof of validity/domain permission. Do not confuse this serving backend with unused tidy-panda or frontend environment.
3. In the secure backend operator console, verify the existing key is authorized for the approved sender/domain in Resend, without sending a test to a real participant. Reuse in place: no copying key into source, chat, logs, shell arguments, or preview. If absent in the future, use an authorized secure secret-reference/operator flow rather than requesting secrets in chat.
4. With separate configuration authorization, set credential source to shared-resend, exact FROM above and portal https://www.1plus1match.com. Keep mode disabled and production approval false until the activation plan is approved. There is no need to duplicate RESEND_API_KEY into FEMALE_WORKFLOW_RESEND_API_KEY.
5. Read-only queue/cutoff inventory before enabling. Previously eligible pending messages may resume on a mode change; do not reset cutoffs, retry tombstones, backfill or edit old rows. Obtain separate explicit authorization for brother_review and both-sex final_request future sending. Set the scoped mode and approval flag only under that authorization, then invoke internal femaleWorkflowDelivery:activateBrotherReview {} and femaleWorkflowDelivery:activateFinalRequests {} individually as authorized. Existing boundaries are immutable and must not be renewed. Never activate sister_confirmation for this request.
6. Confirm only future authorized transitions; distinguish provider acceptance from actual mailbox delivery. Emergency stop: mode disabled (in-flight requests cannot be recalled).

Reuse means shared rotation/revocation: revoking or rotating RESEND_API_KEY affects every service using that same credential, not just these notifications. It does not mean automatic activation. Dedicated credentials remain the default and retain independent revocation.

## Preview limitation

Hosted frontend preview alone is UI-review-only, not an isolated backend functional proof. No real submissions. Before functional preview acceptance, provision a compatible isolated backend with fake transport/allowlisted synthetic identities and no shared production key. No live backend deployment is authorized merely to make the preview work.

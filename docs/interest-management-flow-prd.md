# Interest Management Flow PRD

## Overview

Applicants need a private portal where they can review interest activity, respond to inbound interests, track outbound interests, review bios, approve progression, request photos, approve photo requests, and receive contact information only after both sides complete the required approval steps.

Management needs protected approval links that take them directly to the relevant pair so they can supervise, override, or unblock sensitive steps without disrupting the current admin dashboard.

## Goals

- Let each applicant see two sections: Inbound Interests and Outbound Interests.
- Let recipients respond to inbound interests with Accept, Decline, or Keep Open.
- Reveal bios to both applicants only when the flow reaches a bio-review state.
- Require final approval before the photo-request stage.
- Let either applicant request photos after final approval.
- Let the other applicant approve or decline a photo request.
- Reveal photos to both applicants only after photo approval.
- Share contact info with both applicants only after the final required approval state is reached.
- Send email notifications for new required applicant actions and management approvals.
- Provide management links that open the protected admin workbench for the exact interest or match.
- Preserve the current registration, interest, match, profile share, and admin dashboard setup.

## Non-Goals

- Replacing the existing admin dashboard.
- Replacing the existing profile-completion flow.
- Replacing Stripe registration/payment behavior.
- Building chat or direct messaging between applicants.
- Making applicant photos or contact info public.
- Allowing applicants to bypass management review where management approval is required.

## Current System Context

The current app already has these foundations:

- `registrations`: stores applicant profile data, shareable bios, image storage IDs, contact details, profile access tokens, and `activeMatchId`.
- `interests`: stores directed interest signals with `fromRegistrationId`, `toRegistrationId`, source, status, visibility, admin status, and optional `matchId`.
- `matches`: stores paired applicants, match status, notification state, and queue-release behavior.
- `profileShares`: stores tokenized profile share records with `includeImages`.
- Applicant profile update links already use tokenized URLs under `/profile/[token]`.
- Shared profile links already use tokenized URLs under `/share/[token]`.
- Admin matching tools already exist under `/admin/interests`, `/admin/pipeline`, and `/admin/workbench`.
- Emails are sent with Resend from `src/lib/email.ts`.

The new flow should extend these concepts rather than introducing a competing matching system.

## Personas

- Applicant: a registered candidate who needs to view and respond to interest activity.
- Management/Admin: internal team members who supervise matching, approve sensitive transitions, and resolve exceptions.

## Applicant Portal

### Access

Applicants must be able to log in from a private applicant portal.

Recommended first implementation:

- Add passwordless email login using a one-time magic link.
- Reuse each registration email as the applicant identity.
- Store only hashed login/session tokens.
- Issue an HTTP-only applicant session cookie after successful magic-link verification.
- Resolve the applicant server-side from the session cookie before reading or mutating interest data.

Do not accept `registrationId`, email, or user ID from the browser as proof of identity.

### Routes

- `/login`: applicant requests a magic link by email.
- `/login/verify?token=...`: verifies token and creates applicant session.
- `/me`: applicant dashboard with Inbound Interests and Outbound Interests.
- `/me/interests/[interestId]`: detail page for one interest or match flow.

### Dashboard Sections

Inbound Interests:

- Shows people who expressed interest in the logged-in applicant.
- Before bio reveal, show only approved anonymous details such as applicant number, age range, gender, and high-level profile status.
- Shows current step and available actions.
- Women may see multiple pending inbound interests from men.
- Multiple pending inbound interests can be visible at the same time, but only one accepted interest can move into active bio review at a time.

Outbound Interests:

- Shows people the logged-in applicant expressed interest in.
- Shows current status: sent, waiting for recipient response, bio available, final approval needed, photo requested, photo approved, contact shared, declined, closed, or kept open.
- The only way any applicant expresses interest is by submitting the applicant/event number of the person they are interested in.
- Visible outbound interests are sent by male applicants to female applicants after the male applicant submits the female applicant's number.
- Female applicants can document private interest signals by submitting a male applicant's number; these are visible to themselves and admins only until a match is in place.
- Female dashboards must include a note explaining that documented interests are private and help management understand preferences.

## Inbound Interest Flow

Initial state:

- Applicant receives an inbound interest.
- Applicant sees Accept, Decline, and Keep Open.

Accept:

- Mark recipient response as accepted.
- Reveal both candidates' bios to each other.
- Notify both candidates that the bio-review step is open.
- Notify management with a protected review link.

Decline:

- Mark the interest declined.
- Do not reveal bios, photos, or contact info.
- Notify the requester that the interest was closed.
- Release the requester to initiate another eligible interest.

Keep Open:

- Mark recipient response as keep open.
- Keep the interest visible in Inbound Interests.
- Do not reveal bios, photos, or contact info.
- Do not consume the recipient's final approval.
- Allow management to see that the applicant deferred the decision.

Bio Review:

- Both candidates can view each other's shareable bio.
- Each candidate can give final approval or decline.
- If either declines, close the flow and notify the other candidate with non-sensitive wording.
- If both give final approval, the flow moves to the photo-request step.

Photo Request:

- Either candidate can request pictures.
- The other candidate can approve or decline the request.
- If approved, both candidates' approved profile photos become visible to both sides.
- If declined, photos stay hidden, but the pair can still proceed to contact sharing after both final approvals.

Contact Sharing:

- Contact info is shared to both candidates only after final approval is complete.
- Contact sharing should happen automatically after both applicants give final approval.
- Management does not need to manually approve contact sharing.

## Outbound Interest Flow

Eligibility:

- Visible outbound interests are male-initiated.
- Male applicants can send outbound interests only by submitting the female applicant's number.
- Existing cap of three open outbound interests should remain unless management changes it.
- Existing opposite-gender and completed-profile rules remain.
- Male outbound initiation must avoid exposing full female profiles before bio review opens.
- Female applicants can document interests only by submitting the male applicant's number.
- Female-documented interests are visible only to the female applicant and admins before a match is in place.
- Female-documented interests should use the existing `internal_only` privacy model and must not notify the male applicant.
- Female-documented interests can help admins understand preferences and identify mutuality.

Interest Sent:

- Create an interest from the male applicant to the female target identified by submitted applicant/event number.
- The female applicant sees the inbound interest in her dashboard.
- Bio becomes visible to both candidates only after the female applicant accepts the inbound interest.
- Notify the female recipient that she has an interest to approve, decline, or keep open.
- Notify management with a protected approval/review link.

Recipient Approves:

- Both candidates move to the next step.
- Either candidate can request a picture.
- If a picture request is approved by the other candidate, both candidates can see each other's pictures.
- Once final approval is made, contact info is shared to both.

Recipient Declines:

- Close the interest.
- Notify the requester that the interest was closed.
- Release the requester to initiate another eligible interest.

## Management Approval Link

Every email that requires management awareness should include a protected management link:

- Interest review link: `/admin/workbench?interest=<interestId>&step=<step>`
- Match review link: `/admin/workbench?match=<matchId>&step=<step>`

The existing admin password cookie should continue to protect these routes. If management is not logged in, the admin login page should redirect back to the requested approval link after authentication.

Management actions:

- Approve or reject a pair moving from interest to bio review.
- Override stuck or inconsistent applicant decisions.
- Approve contact-sharing if the team wants manual control before contact release.
- View full applicant profiles and internal notes.
- See email notification status and retry failures.

## Email Notifications

Applicant emails:

- Initial interest notification and outbound confirmation.
- Interest response messages for accepted, declined, keep open, final approval, and photo request outcomes.
- Match/contact info share message.
- Follow-up messages when there is no response to an interest.
- Follow-up status update messages for matched participants.
- Magic login link.
- New inbound interest received.
- Inbound interest accepted by recipient.
- Bio review is available.
- Final approval requested.
- Photo request received.
- Photo request approved or declined.
- Contact info shared.
- Interest declined or closed.

Management emails:

- New outbound interest created.
- New female-documented private interest recorded.
- Inbound interest accepted.
- Both final approvals completed.
- Photo request approved or declined.
- Contact ready to share.
- Email delivery failure requiring retry.

All emails should:

- Avoid exposing photos or contact info in email body.
- Link applicants to `/me` or the specific `/me/interests/[interestId]` detail page.
- Link management to the admin workbench URL above.
- Record sent/error timestamps in Convex for retry visibility.
- Use the template catalog in `docs/interest-management-message-templates.md`.

## Data Model Requirements

Extend the existing model instead of replacing it.

Recommended additions:

- `applicantSessions`: hashed session token, registration ID, expiration, created timestamp, last-used timestamp.
- `applicantLoginTokens`: hashed one-time login token, registration ID, expiration, consumed timestamp.
- `interestFlowEvents`: append-only audit trail for applicant/admin actions, email sends, and state transitions.
- New fields on `interests` or a dedicated `interestFlows` table for:
  - `flowStatus`
  - `recipientDecision`
  - `recipientDecisionAt`
  - `bioVisibleAt`
  - `requesterFinalApproval`
  - `recipientFinalApproval`
  - `requesterFinalApprovalAt`
  - `recipientFinalApprovalAt`
  - `photoRequestedByRegistrationId`
  - `photoRequestedAt`
  - `photoDecision`
  - `photoDecisionAt`
  - `photosVisibleAt`
  - `contactSharedAt`
  - `closedReason`

Use a dedicated `interestFlows` table if these fields would make `interests` too broad or if future workflow history needs to support multiple review cycles.

## Suggested Flow Statuses

- `awaiting_inbound_response`
- `kept_open`
- `bio_review`
- `awaiting_final_approvals`
- `awaiting_photo_request`
- `awaiting_photo_response`
- `photos_visible`
- `ready_for_contact`
- `contact_shared`
- `declined`
- `closed`

Keep existing `interests.status` values for queueing and admin compatibility. Map the new `flowStatus` to the existing status rather than removing the current values.

## Privacy and Access Rules

- Applicants can only read interests where they are `fromRegistrationId` or `toRegistrationId`.
- Applicants can only mutate actions available to their role in the current flow state.
- Bios are hidden until `bioVisibleAt` is set.
- Candidate names are hidden until the bio-review state opens.
- Photos are hidden until `photosVisibleAt` is set.
- Contact info is hidden until `contactSharedAt` is set.
- Female-submitted interests that are currently `internal_only` must remain protected according to existing privacy rules unless management explicitly exposes them.
- Female-documented interests are visible only to the female applicant and admins before a match is in place.
- Female-documented interests must not notify the male applicant, reveal the female applicant's interest to him, or open bio review by themselves before a match is in place.
- Once a match is in place, normal match visibility rules can show that mutual interest exists.
- Admin-only notes never appear in applicant views.

## Confirmed Product Decisions

- Contact sharing is automatic after both applicants give final approval.
- Photo decline does not block contact sharing.
- Applicant names become visible once bio review opens.
- Keep Open decisions should expire after a fixed number of days.
- Candidates are limited to one active bio-review flow at a time, matching the current active-match queue behavior.
- Visible outbound interests are male-initiated.
- Women may receive and review multiple pending inbound interests.
- Men and women express interest only by submitting the other person's applicant/event number.
- Men submitting a woman's number creates a visible outbound interest that the woman can review.
- Women submitting a man's number creates a private documented interest visible only to the woman and admins before a match is in place.
- Female-documented private interests do not notify men and do not open bio review by themselves before a match is in place.
- No applicant browsing is used to express interest.

## Success Metrics

- Applicants can independently check interest and match status without asking management.
- Management has direct links to approve or review every sensitive transition.
- No contact info is visible before the required approvals are complete.
- No photos are visible before explicit picture approval.
- Existing admin interest and match workflows continue to function.
- Email failures are visible and retryable from admin.

## Acceptance Criteria

- A registered applicant can log in with an email magic link and view `/me`.
- `/me` shows separate Inbound Interests and Outbound Interests sections.
- Inbound interests offer Accept, Decline, and Keep Open only when valid.
- Female dashboards explain that documented interests are private to the applicant and admins.
- Applicant interest submission uses applicant/event number entry only, not profile browsing.
- Accepting inbound interest reveals bios to both candidates.
- Declining inbound interest closes the flow and triggers the existing-style decline notification.
- Keeping inbound interest open preserves the interest without revealing bios.
- Male number submission creates a visible inbound interest for the female recipient.
- Female number submission creates an internal-only documented interest and does not notify the male applicant before a match is in place.
- Male outbound initiation does not open bio visibility until the female recipient accepts.
- Both candidates can give final approval after bios are visible.
- Either candidate can request a picture after final approval.
- Picture request approval reveals photos to both candidates.
- Contact info is shared to both only when the configured final sharing condition is met.
- Management emails include `/admin/workbench?interest=<id>&step=<step>` or `/admin/workbench?match=<id>&step=<step>`.
- Existing `/admin/interests`, `/admin/pipeline`, `/admin/workbench`, `/profile/[token]`, and `/share/[token]` behavior remains operational.

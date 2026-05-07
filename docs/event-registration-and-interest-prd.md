# Event Registration and Shared-Event Interests PRD

## Overview

The application needs event management as a first-class matching primitive. Admins should be able to create distinct events, applicants should be able to register for those events, admins should approve attendance and check attendees in, and applicants should only express event-based interest in people who attended the same event.

The current app already supports applicant registrations, applicant login, profile completion, interests, interest flows, matches, and admin matching workflows. This project should extend that system rather than replace it.

## Goals

- Let admins create, edit, schedule, complete, and cancel events.
- Let applicants register for specific upcoming events.
- Track per-event applicant registration status separately from the applicant's overall registration/payment/background-check status.
- Automatically waitlist event registrants when their gender capacity is full.
- Carry prior-event waitlisted applicants into the next event before new registrations consume capacity.
- Let admins approve, reject, cancel, waitlist, and check in event registrants.
- Show event history and upcoming event status in both applicant and admin views.
- Store an `eventId` on every interest.
- Require applicant-submitted interests to pass a shared-attended-event check.
- Require both applicants to have attended at least one same event before either can submit interest through the applicant portal.
- Limit applicant-submitted interests to the 7-day window after an event ends.
- Preserve the current gender-specific interest behavior:
  - male-to-female interests are visible/actionable for the female recipient.
  - female-to-male interests are private/internal first.
- Backfill current approved applicants as attended at the legacy April 2026 event.
- Send an initial event registration received email after event registration is submitted.

## Non-Goals

- Replacing the existing applicant registration/payment system.
- Replacing the existing interest flow, match flow, or applicant portal.
- Building full email automation for every event lifecycle state in the first pass.
- Building public event discovery for non-registered anonymous visitors beyond the event registration entry path.
- Allowing applicants to browse full opposite-gender profiles from an event.
- Using event registration as proof of payment or background-check completion.
- Blocking admins from manually creating interests outside event rules.

## Current System Context

The current system includes:

- `registrations`: applicant profile, payment status, approval status, profile completion, applicant contact info, and matching fields.
- `interests`: directed interest signals between registrations.
- `interestFlows`: applicant-facing interest state, decisions, timestamps, and contact-sharing progression.
- `matches`: pair-level matching records.
- `applicantLoginTokens` and `applicantSessions`: applicant portal authentication.
- Admin pages for profiles, interests, pipeline, workbench, and an Events page that currently shows a placeholder.
- Applicant dashboard at `/me` with profile management and interest submission by global applicant number.

This project introduces event tables and uses attendance records to validate future applicant-created interests.

## Personas

- Applicant: a registered user who can complete a profile, register for events, attend events, and express interest after attending.
- Admin: internal matchmaker/operator who creates events, approves attendees, checks people in, reviews event history, and can manually create or manage interests.

## Definitions

- Applicant registration: the existing global user record in `registrations`.
- Event: a distinct scheduled gathering, such as the May 17 event.
- Event registration: one applicant's registration for one event.
- Applicant number: the applicant's permanent global number in the system. It must not change from event to event.
- Approved member: an applicant whose existing global registration is already approved and paid/background checked.
- Awaiting background check: an applicant who is new or whose global registration/payment/background-check status is not complete.
- Pending event registration: the applicant has requested event attendance and is waiting for admin approval.
- Approved event registration: admin has approved the applicant to attend the specific event.
- Waitlisted event registration: capacity is full for the applicant's gender, so the applicant is waiting for the next available event spot and is not in the current event's active pending/approved capacity pool.
- Attended: admin/check-in has marked that the applicant actually attended the event.

## Applicant Number Model

Applicant numbers should be permanent global identifiers assigned at applicant registration.

Requirements:

- A registration gets one applicant number.
- The applicant keeps the same number for every event.
- Applicant number 24 is applicant number 24 at every event.
- Event attendee lists and interest submission should use the permanent applicant number.
- Event-specific numbering should not be introduced.

Current implementation note:

- The current app appears to derive applicant numbers from registration creation order in some places.
- Implementation should add a persisted applicant number field if one does not already exist.
- Existing registrations should be backfilled with their current derived number before event attendee lists depend on it.
- After backfill, future registrations should receive the next available permanent applicant number at creation time.

## Event Model

Add an `events` table.

Required fields:

- `title`
- `eventCode`
- `eventMonth`
- `series`
- `description`
- `location`
- `startsAt`
- `endsAt`
- `status`
- `maleCapacity`
- `femaleCapacity`
- `registrationOpensAt`
- `registrationClosesAt`
- `interestSubmissionClosesAt`
- `adminNotes`
- `createdAt`
- `updatedAt`

Event statuses:

- `draft`: admin is preparing the event; not available to applicants.
- `scheduled`: event is live or ready for applicant registration.
- `completed`: event has happened; attendance and shared-event interest eligibility can be processed.
- `cancelled`: event will not occur or was cancelled.

Capacity defaults:

- `maleCapacity`: `60`
- `femaleCapacity`: `60`

The admin must be able to change capacities after event creation.

Event identity:

- Events should be identified by month and series, not by freeform title alone.
- Default display title format: `1Plus1 Match Event - May26`.
- `eventCode` should be a compact lowercase month/year code such as `may26`.
- `eventMonth` should be an ISO year-month string such as `2026-05`.
- `series` should identify the event family, defaulting to `1plus1_match`.
- `series + eventMonth` should identify the normal monthly event for carryover logic.
- If more than one event exists in the same series and month, implementation should require a distinct `eventCode`.

Indexes should support:

- listing by status.
- listing by start time.
- listing by series and event month.
- listing scheduled/completed events for applicant portal.

## Event Registration Model

Add an `eventRegistrations` table.

Required fields:

- `eventId`
- `registrationId`
- `gender`
- `registrationStatus`
- `attendanceStatus`
- `eligibilityStatus`
- `confirmedAt`
- `confirmationRequestedAt`
- `confirmationExpiresAt`
- `waitlistCarryoverFromEventId`
- `approvedAt`
- `rejectedAt`
- `cancelledAt`
- `checkedInAt`
- `noShowMarkedAt`
- `adminNotes`
- `createdAt`
- `updatedAt`

Registration statuses:

- `pending`: applicant is in the active review pool and awaiting admin event approval.
- `approved`: admin approved the applicant to attend this event.
- `waitlisted`: gender capacity is full; applicant is waiting for a spot.
- `rejected`: admin rejected the event registration.
- `cancelled`: applicant or admin cancelled the event registration.

Attendance statuses:

- `not_checked_in`: default state before attendance is recorded.
- `attended`: applicant attended or was checked in.
- `no_show`: applicant was approved/registered but did not attend.

Eligibility statuses:

- `approved_member`: global applicant is already approved and has completed payment/background-check requirements.
- `awaiting_background_check`: applicant is new or still pending globally and needs background-check/payment completion before event approval.

Important separation:

- Global applicant status remains on `registrations`.
- Event attendance approval remains on `eventRegistrations`.
- An applicant can be globally approved but still pending for a specific event.

Indexes should support:

- event registrants by event.
- applicant event history by registration.
- event registrants by event and gender.
- event registrants by event and registration status.
- uniqueness checks for one registration per event.

## Event Registration Flow

### Prior Waitlist Carryover

When a new event is opened for registration, applicants who were waitlisted from the previous event in the same series should get first access to the new event.

Requirements:

- The previous event is the most recent earlier event with the same `series`, ordered by `eventMonth` and then `startsAt`.
- Existing waitlisted applicants from that previous event are automatically created or moved into the new event as `pending`.
- These carryover pending registrations count toward the new event's gender capacity.
- Carryover should happen before new applicant registrations are evaluated for capacity.
- `waitlistCarryoverFromEventId` should point to the event where the applicant was previously waitlisted.
- If carryover would exceed the new event's gender capacity, the system should not silently exceed capacity.
- Preferred implementation for overflow carryover: promote prior waitlisted applicants by original waitlist order until capacity is reached, and keep the remainder waitlisted for the next event unless admin explicitly overrides capacity.
- Admin can explicitly override capacity when promoting additional carryover applicants.
- Prior waitlisted applicants who are carried into the new event should be asked to confirm participation.
- When confirmation is requested, set `confirmationRequestedAt` and `confirmationExpiresAt`.
- The confirmation window is 48 hours.
- If the applicant does not confirm within 48 hours, the current event registration becomes `cancelled` and no longer counts toward capacity.
- Confirming participation does not approve attendance; it only preserves the applicant's pending event registration.
- Admin approval/background/payment checks still move `pending` to `approved`.

### Applicant Starts Event Registration

Applicant chooses a scheduled event and submits event registration.

Requirements:

- Applicant must be authenticated.
- Applicant must have a completed profile.
- Applicant cannot create duplicate active registrations for the same event.
- Cancelled/rejected duplicate behavior should be explicit during implementation:
  - preferred: allow a new request only if previous registration is `cancelled` or `rejected`.
  - otherwise patch/reactivate the existing record with a new status and timestamp.

Eligibility derivation:

- If global applicant is approved and payment/background-check requirements are complete, set `eligibilityStatus` to `approved_member`.
- If global applicant is pending, unpaid, new, or otherwise not fully approved, set `eligibilityStatus` to `awaiting_background_check`.

Capacity derivation:

- Count `pending + approved` event registrations for the applicant's gender.
- Do not count `waitlisted`, `rejected`, or `cancelled`.
- If count is below gender capacity, create as `pending`.
- If count is at or above gender capacity, create as `waitlisted` for the next event.
- New applicant registrations are evaluated after any prior waitlist carryover has consumed capacity.

### New Applicant Event Registration

New applicants should be able to start from an event registration path, but the system should still create and maintain a normal global applicant registration.

Requirements:

- A new applicant registering for an event must complete the standard registration/payment/profile requirements.
- The applicant should receive a permanent applicant number when their global registration is created.
- The event registration should be created as `pending` or `waitlisted` based on event gender capacity.
- The event registration should use `eligibilityStatus: "awaiting_background_check"` until payment/background-check approval is complete.
- Admin should be able to see that the applicant is both a new/pending global registration and a pending/waitlisted event registrant.

Confirmation:

- Prior waitlisted applicants who are carried into a new event can be asked to confirm participation.
- `confirmationRequestedAt` should be set when admin asks a waitlisted applicant to confirm.
- `confirmationExpiresAt` should be set to 48 hours after the confirmation request.
- `confirmedAt` should be set when the applicant confirms.
- If the applicant does not confirm before `confirmationExpiresAt`, the event registration should become `cancelled`.

### Admin Reviews Event Registrations

Admins can:

- approve `pending` event registrations.
- reject event registrations.
- cancel event registrations.
- move `waitlisted` registrations to `pending` if capacity is available.
- explicitly override capacity when moving waitlisted users if needed.
- request confirmation from carryover pending registrants.
- update admin notes.

When moving `waitlisted -> pending`:

- Re-check `pending + approved` gender capacity.
- If capacity is full and no override is provided, reject the transition with a clear error.

When moving `pending -> approved`:

- Confirm the applicant meets required event approval conditions.
- The desired business rule is that payment and background check are complete before approval.
- Implementation should enforce this from existing fields where reliable; if current data cannot distinguish background check completion from global `approved`, use global `registrations.status === "approved"` plus paid payment status as the first pass.

### Attendance and Check-In

Admins can mark attendance:

- `not_checked_in -> attended`
- `not_checked_in -> no_show`
- `attended -> no_show` only through explicit admin correction
- `no_show -> attended` only through explicit admin correction

After check-in:

- `checkedInAt` should be set when marking attended.
- `noShowMarkedAt` should be set when marking no-show.

Applicant profile and admin profile views must show event history.

## Applicant Event UI

Applicant dashboard should include:

- Upcoming events.
- Each event's registration status for the current applicant.
- Action to register for eligible scheduled events.
- Event history:
  - registered events.
  - pending/approved/waitlisted/rejected/cancelled statuses.
  - attended/no-show status after event.
- Post-event interest submission for eligible attendees who share an attended event inside the 7-day interest window.

Applicants should not see full attendee profiles from event attendee lists.

Eligible attendee list should show only:

- global applicant number.
- first name.
- gender may be omitted because the list should already be opposite-gender only.

Applicants should choose or enter an eligible attendee. They do not need to attach an event to the interest; the app verifies shared attendance server-side.

## Admin Event UI

Replace the current Events placeholder page.

Admin event list should show:

- event title.
- date/time.
- status.
- male and female capacities.
- male and female counts by status.
- total approved/pending/waitlisted counts.

Admin event detail should support:

- edit event fields.
- update status.
- update capacity.
- view registrants grouped/filterable by gender and status.
- approve/reject/cancel/waitlist registrants.
- move waitlisted users to pending.
- mark attendance/check-in.
- bulk mark no-shows after event if needed.

Admin profile detail should show:

- upcoming event registrations.
- past attended events.
- waitlisted/rejected/cancelled event history.
- shared-event eligibility for applicant-created interests where available.
- event-linked interests.

Admin interest creation:

- Admins may create interests without being restricted by same-event attendance.
- Admin-created interests must link to an event, but admins may choose the event manually and bypass applicant shared-attendance/deadline restrictions.
- Admin override behavior should be explicit in the mutation/API name or argument.

## Shared-Event Interest Requirements

Add required `eventId` to `interests`.

Important UX distinction:

- Applicants do not need to manually prove or point to an event.
- The backend must verify the requester and target share an eligible attended event.
- The backend then stores that shared event as `interests.eventId`.
- If more than one shared event is eligible, use the most recent shared event still inside the active interest window.

Applicant-created interests:

- must be allowed only when the requester and target share at least one attended event.
- must use server-side attendance records to verify shared event attendance.
- must not trust a client-selected event as proof of eligibility.
- must store the eligible shared event on `interests.eventId`.
- must require opposite-gender pairing.
- must require completed profiles as the current rules do.
- must preserve current visibility behavior:
  - male requester to female target: `admin_actionable`.
  - female requester to male target: `internal_only`.
- must be submitted within 7 days after at least one shared attended event ends.
- if the applicants share multiple attended events, use the most recent shared event that is still inside the submission window.

Admin-created interests:

- may bypass same-event attendance.
- may bypass the 7-day event interest window.
- must still provide an `eventId`.
- must use the dedicated `1Plus1 Manual/Admin Interest` event when the interest is not tied to a real attended-event flow.

Applicant target selection:

- The app returns eligible opposite-gender attendees who share an attended event with the applicant and are inside the active 7-day interest window.
- The attendee list shows applicant number + first name only.
- The mutation should still validate the selected target server-side.

## Duplicate Interest Rules

Current rules block duplicate open interests between the same pair globally.

New desired behavior:

- Prevent duplicate open interests for the same pair within the same event.
- Allow a future event to create a new interest between the same pair.
- Closed, declined, withdrawn, and converted interests should not block future event-specific interests.

Because interests store an event pointer, duplicate open interest checks should use:

- `fromRegistrationId + toRegistrationId + eventId`

Admin override behavior can remain more flexible.

## Legacy Backfill

Create a legacy past event:

- Title: `1Plus1 Match Event - Apr26`
- Event code: `apr26`
- Event month: `2026-04`
- Series: `1plus1_match`
- Location: `ROIC`
- Start: April 12, 2026, 3:00pm America/Chicago
- End: April 12, 2026, 5:30pm America/Chicago
- Status: `completed`
- Male capacity: `60`
- Female capacity: `60`
- Interest deadline: 3 weeks after end time as a one-time legacy exception.

Backfill:

- Create event registration records for all current approved applicants.
- Mark those April event records as `approved` and `attended`.
- Patch all existing interests to use the April 2026 event as `eventId`.
- Existing approved applicants should therefore satisfy the shared-attended-event check for the April 2026 event.
- Avoid overwriting existing future event registration records if the migration is rerun.

Migration should be idempotent.

Create a manual/admin event:

- Title: `1Plus1 Manual/Admin Interest`
- Event code: `manual-admin`
- Event month: `manual`
- Series: `admin_manual`
- Status: `completed`
- Purpose: required `eventId` target for admin-created interests that do not naturally belong to a real attended event.
- Applicant-created interests must not use this event.

## Data Migration Strategy

Follow Convex widen-migrate-narrow.

Deploy 1:

- Add `events` table.
- Add `eventRegistrations` table.
- Add optional `eventId` to `interests`.
- Add indexes needed for event, attendance, and shared-event eligibility queries.
- Update applicant interest creation to verify shared attendance and write `eventId` before creating an interest.
- Update admin interest creation to require an explicit `eventId`.

Migration:

- Create April 12 event if it does not exist.
- Create `1Plus1 Manual/Admin Interest` event if it does not exist.
- Backfill current approved applicants as approved and attended for the April 2026 event.
- Verify every current approved applicant has one April 2026 event attendance row.
- Patch existing interests lacking `eventId` to the April 2026 event.
- Verify every interest has `eventId`.

Deploy 2:

- Narrow `interests.eventId` from optional to required in the schema.
- Enforce shared-attended-event validation at the applicant mutation/API level.
- Keep admin/manual interest creation able to bypass shared-event validation through explicit admin-only code paths.

## Emails

First-pass required email:

- Event registration received.

Message behavior:

- Sent after an applicant registers for an event.
- States that registration was received.
- States that attendance is pending admin approval.
- States that the applicant will be notified when approved.
- For waitlisted users, copy should say the registration was received and they are currently waitlisted.

Later email phase:

- approved to attend.
- waitlisted confirmation request.
- moved from waitlist to pending.
- rejected/cancelled.
- event reminder.
- checked-in/attendance confirmation if desired.
- post-event interest window reminder.

Email sending should follow the existing pattern in `src/lib/email.ts` and API route handlers that record Convex send timestamps/errors.

## Access and Authorization

Applicant actions:

- Must resolve the applicant from the authenticated applicant session.
- Must not accept `registrationId` from the browser as proof of identity.
- Must validate profile completion and event eligibility server-side.

Admin actions:

- Continue using existing admin auth protection.
- Admin APIs/mutations must enforce intended admin-only access at the route layer and should avoid exposing unrestricted mutations directly to applicant UI.

## Validation Rules

Event creation:

- `endsAt` must be after `startsAt`.
- capacities must be positive numbers.
- status must be one of the defined values.

Event registration:

- event must be `scheduled`.
- registration must have completed profile.
- no duplicate active event registration.
- derive gender from registration, not client input.
- derive capacity status server-side.

Attendance:

- only admins can mark attendance.
- attendance can only be marked for known event registrants.

Interest submission:

- event must exist.
- requester and target must share at least one attended event.
- at least one shared attended event must be completed or otherwise eligible for post-event interest submission.
- current time must be within 7 days after at least one shared attended event end.
- target must be opposite gender.
- target must come from the server-validated eligible attendee set or pass the same server-side eligibility check when entered by number.
- interest must store the chosen/derived shared event as `eventId`.
- duplicate open interest for the same pair and event must be blocked.

## Reporting and Admin Counts

Event detail should expose:

- male pending count.
- male approved count.
- male waitlisted count.
- female pending count.
- female approved count.
- female waitlisted count.
- attended count by gender.
- no-show count by gender.

Capacity count:

- `pending + approved`.

Capacity does not count:

- `waitlisted`
- `rejected`
- `cancelled`

## Acceptance Criteria

- Admin can create a scheduled event with default 60 male and 60 female capacity.
- Admin-created monthly events use `title`, `eventCode`, `eventMonth`, and `series`.
- Waitlist carryover uses the previous event in the same `series`, ordered by `eventMonth` and `startsAt`.
- Applicant with completed profile can register for a scheduled event.
- Applicant without completed profile cannot register and is directed to complete profile.
- Prior-event waitlisted applicants are carried into the next event before new registrations consume capacity.
- Prior-event waitlisted applicants carried into the next event become `pending`, subject to gender capacity unless admin overrides capacity.
- Carryover pending applicants can be asked to confirm participation.
- Carryover pending applicants who do not confirm within 48 hours become `cancelled`.
- If gender capacity is available, event registration becomes `pending`.
- If gender capacity is full, event registration becomes `waitlisted`.
- Existing approved paid/background-checked applicant is labeled `approved_member` on event registration.
- Pending/new applicant is labeled `awaiting_background_check` on event registration.
- Admin can approve a pending event registration.
- Admin can move a waitlisted applicant to pending only when capacity is available or with explicit override.
- Admin can mark an approved or registered applicant as attended.
- Admin can see event history on an applicant profile.
- Applicant can see upcoming event registrations and event history.
- Applicant can see eligible opposite-gender attendees who share an attended event within the active 7-day interest window, by applicant number and first name only.
- Applicant cannot express interest in someone who does not share an attended event.
- Applicant cannot express interest after the 7-day window.
- Admin can manually create an interest without same-event restriction, but must choose an event for the interest record.
- Admin can use `1Plus1 Manual/Admin Interest` for manual interests that do not belong to a real attended event.
- Current approved applicants are backfilled as approved and attended for the April 2026 event.
- Existing interests are backfilled with the April 2026 event as `eventId`.
- Current male/female interest visibility behavior remains unchanged.

## Open Implementation Decisions

- Whether rejected/cancelled event registrations can be reactivated or whether a new record should be created.
- Whether event registration approval should strictly enforce payment status in the first pass if historical payment data is incomplete.
- Whether admin event check-in should support QR/token check-in later or only manual admin check-in now.
- Whether to support more than one `1plus1_match` event in the same month, and what admin workflow should create the distinct `eventCode`.

## Suggested Implementation Phases

1. Schema and Convex helpers:
   - Add tables, `interests.eventId`, validators, indexes, and server-side event helper functions.
2. Event registration backend:
   - Applicant event listing and registration mutations.
   - Admin event CRUD and registrant status mutations.
3. Migration:
   - Create April 12 Event.
   - Backfill current approved applicants as April 2026 approved attendees.
4. Interest rules update:
   - Add shared-attended-event applicant interest validation.
   - Add same-event attendance and 7-day validations.
   - Update duplicate open-interest checks to include `eventId`.
5. Admin UI:
   - Events list/detail, registrant review, capacity, and check-in.
   - Admin profile event history.
6. Applicant UI:
   - Upcoming events, registration status, event history, and shared-event eligible interest selection.
7. Email:
   - Event registration received email.
   - Record send status/errors.
8. Tests:
   - Capacity/waitlist behavior.
   - approval transitions.
   - attendance gating for interests.
   - 7-day deadline.
   - duplicate open interest by pair and event.
   - legacy backfill idempotency.

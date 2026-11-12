# Event Registration and Shared-Event Interests PRD

## Overview

The application needs event management as a first-class matching primitive. Admins should be able to create distinct events, applicants should be able to register for those events, admins should approve attendance and check attendees in, and applicant submissions should follow the [enabled-event eligibility contract](#shared-event-interest-requirements).

The current app already supports applicant registrations, applicant login, profile completion, interests, interest flows, matches, and admin matching workflows. This project should extend that system rather than replace it.

## Goals

- Let admins create, edit, schedule, complete, and cancel events.
- Let applicants register for specific upcoming events.
- Track per-event applicant registration status separately from the applicant's overall registration/payment/background-check status.
- Automatically waitlist event registrants when their gender capacity is full.
- Use the [current event-only queue policy](event-only-waitlists-review.md#implemented); automatic cross-event carryover is retired.
- Let admins approve, reject, cancel, waitlist, and check in event registrants.
- Show event history and upcoming event status in both applicant and admin views.
- Store an `eventId` on every interest.
- Apply the [current interest eligibility rules](#shared-event-interest-requirements).
- Preserve the current gender-specific interest behavior:
  - male-to-female interests are visible/actionable for the female recipient.
  - female-to-male interests are private/internal first.
- Preserve historical data under the [legacy compatibility policy](event-only-waitlists-review.md#parent-audit-correction--staged-compatibility-supersedes-initial-assumption).
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

The permanent-number invariant and issuance rules are owned by [AGENTS.md](../AGENTS.md#public-applicant-numbers-are-permanent-and-never-reused), with regression coverage in `convex/registrations.test.ts`. This plan does not authorize another number backfill.

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
- `series + eventMonth` identify the monthly event family; cross-event copying follows the [event-only policy](event-only-waitlists-review.md#implemented).
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

The schema owns registration status values; see [`eventRegistrationStatus`](../convex/schema.ts). Queue and cancellation semantics follow the [event-only policy](event-only-waitlists-review.md#implemented).

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

### Waitlist and Confirmation Policy

See [event-only waitlists](event-only-waitlists-review.md#implemented) for capacity, FIFO promotion, confirmation deadlines, expiration, and explicit cross-event copying. The original automatic carryover proposal is retired.

### Applicant Starts Event Registration

Applicant chooses a scheduled event and submits event registration.

Requirements:

- Applicant must be authenticated.
- Applicant must have a completed profile.
- Applicant cannot create duplicate active registrations for the same event.
- Rejoining a Withdrawn/Rejected row follows the [event-only queue policy](event-only-waitlists-review.md#implemented); receipt attempts follow the [receipt guide](signup-receipt-review.md#implemented).

Eligibility derivation:

- If global applicant is approved and payment/background-check requirements are complete, set `eligibilityStatus` to `approved_member`.
- If global applicant is pending, unpaid, new, or otherwise not fully approved, set `eligibilityStatus` to `awaiting_background_check`.

Capacity derivation follows the [event-only queue policy](event-only-waitlists-review.md#implemented).

### New Applicant Event Registration

New applicants should be able to start from an event registration path, but the system should still create and maintain a normal global applicant registration.

Requirements:

- A new applicant registering for an event must complete the standard registration/payment/profile requirements.
- The applicant should receive a permanent applicant number when their global registration is created.
- The event registration should be created as `pending` or `waitlisted` based on event gender capacity.
- The event registration should use `eligibilityStatus: "awaiting_background_check"` until payment/background-check approval is complete.
- Admin should be able to see that the applicant is both a new/pending global registration and a pending/waitlisted event registrant.

Confirmation follows the [event-only queue policy](event-only-waitlists-review.md#implemented).

### Admin Reviews Event Registrations

Admins can:

- approve `pending` event registrations.
- reject event registrations.
- cancel event registrations.
- move `waitlisted` registrations to `pending` if capacity is available.
- request confirmation according to the [event-only queue policy](event-only-waitlists-review.md#implemented).
- update admin notes.

When moving `waitlisted -> pending`, follow the [event-only queue policy](event-only-waitlists-review.md#implemented).

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
- Interest submission according to [current eligibility](#shared-event-interest-requirements).

Applicants should not see full attendee profiles from event attendee lists.

Applicants enter the recipient’s permanent applicant number and first name using Submit Interest. See [current eligibility](#shared-event-interest-requirements) and [submission consent](issue58-photo-consent.md#behavior).

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
- Admin-created interests follow [the event-context requirements](#shared-event-interest-requirements).
- Admin override behavior should be explicit in the mutation/API name or argument.

## Shared-Event Interest Requirements

Applicant submissions use exactly one explicitly enabled `1plus1_match` event with scheduled/completed status; missing flags, multiple enabled events, manual events, or cancellation fail closed. There is no automatic seven-day opening or closing rule. The sender must have an Approved, confirmed, attended event registration. The target must be globally Approved, opposite gender, and have a completed profile; both profiles must be completed. Target attendance at the enabled event is not required.

The browser sends `expectedEventId`; the mutation rechecks the active event, session-derived sender, target’s permanent applicant number and first name. Stale event submissions reject. Submit Interest accepts globally Pending or Approved senders meeting the event and profile requirements. There is no browsable attendee picker. The resulting interest stores the server-validated event ID.

Male-to-female interests are `admin_actionable`; female-to-male interests are `internal_only`. Photo choices, retry behavior, and revocation are owned by [the consent guide](issue58-photo-consent.md#behavior). Per-event quota/reset behavior is owned by [the reset guide](../ops/reset-review.md).

Admin-created interests require service authorization and an event ID. They may bypass applicant attendance checks; real-event creation still requires submissions ON. `1Plus1 Manual/Admin Interest` is the dedicated context for manual interests outside that flow.

## Duplicate Interest Rules

Open-interest checks are scoped to the directed pair and event:

- Prevent duplicate open interests for the same pair within the same event.
- Allow a future event to create a new interest between the same pair.
- Submission quota and retry rules remain subject to [the consent guide](issue58-photo-consent.md#behavior) and [reset guide](../ops/reset-review.md).

Because interests store an event pointer, duplicate open interest checks should use:

- `fromRegistrationId + toRegistrationId + eventId`

Admin override behavior can remain more flexible.

## Legacy Backfill

The April attendance/interest backfill is retired and rejects without writes. Historical records and the separate legacy holding list follow the [compatibility policy](event-only-waitlists-review.md#parent-audit-correction--staged-compatibility-supersedes-initial-assumption). Global approval must not manufacture attendance.

Create a manual/admin event:

- Title: `1Plus1 Manual/Admin Interest`
- Event code: `manual-admin`
- Event month: `manual`
- Series: `admin_manual`
- Status: `completed`
- Purpose: required `eventId` target for admin-created interests that do not naturally belong to a real attended event.
- Applicant-created interests must not use this event.

## Data Migration Strategy

The original April backfill and automatic carryover migration plan is retired; use the [legacy compatibility policy](event-only-waitlists-review.md#parent-audit-correction--staged-compatibility-supersedes-initial-assumption). This change does not authorize a historical rewrite or schema narrowing.

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

Receipt delivery, retries, and reconciliation are owned by the [signup receipt guide](signup-receipt-review.md). Manual lifecycle emails remain separate.

## Access and Authorization

Applicant actions:

- Must resolve the applicant from the authenticated applicant session.
- Must not accept `registrationId` from the browser as proof of identity.
- Must validate profile completion and event eligibility server-side.

Admin actions:

- Continue using existing admin auth protection.
- Administrative service authorization follows [the current remediation scope](issue58-photo-consent.md#limits-and-release-gate).

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

Interest submission follows [the eligibility contract](#shared-event-interest-requirements).

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

Capacity counts follow the [event-only queue policy](event-only-waitlists-review.md#implemented).

## Acceptance Criteria

Queue/confirmation acceptance follows the [event-only policy](event-only-waitlists-review.md#implemented); submission acceptance follows [current eligibility](#shared-event-interest-requirements) and [consent](issue58-photo-consent.md#behavior).

- Admin can create a scheduled event with default 60 male and 60 female capacity.
- Admin-created monthly events use `title`, `eventCode`, `eventMonth`, and `series`.
- Applicant with completed profile can register for a scheduled event.
- Applicant without completed profile cannot register and is directed to complete profile.
- Existing approved paid/background-checked applicant is labeled `approved_member` on event registration.
- Pending/new applicant is labeled `awaiting_background_check` on event registration.
- Admin can approve a pending event registration.
- Admin can mark an approved or registered applicant as attended.
- Admin can see event history on an applicant profile.
- Applicant can see upcoming event registrations and event history.
- Admin can manually create an interest without same-event restriction, but must choose an event for the interest record.
- Admin can use `1Plus1 Manual/Admin Interest` for manual interests that do not belong to a real attended event.
- Male/female review visibility follows the [current workflow guide](female-website-interest-flow.md).

## Open Implementation Decisions

- Whether event registration approval should strictly enforce payment status in the first pass if historical payment data is incomplete.
- Whether admin event check-in should support QR/token check-in later or only manual admin check-in now.
- Whether to support more than one `1plus1_match` event in the same month, and what admin workflow should create the distinct `eventCode`.

## Suggested Implementation Phases

1. Schema and Convex helpers:
   - Add tables, `interests.eventId`, validators, indexes, and server-side event helper functions.
2. Event registration backend:
   - Applicant event listing and registration mutations.
   - Admin event CRUD and registrant status mutations.
3. Legacy compatibility:
   - Preserve historical records under the [compatibility policy](event-only-waitlists-review.md#parent-audit-correction--staged-compatibility-supersedes-initial-assumption).
4. Interest rules update:
   - Apply [current eligibility](#shared-event-interest-requirements).
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
   - Enabled-event eligibility and stale-event rejection.
   - duplicate open interest by pair and event.
   - retired legacy backfill rejects without writes.

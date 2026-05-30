import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const DEFAULT_INTEREST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const APRIL_2026_INTEREST_WINDOW_MS = 21 * 24 * 60 * 60 * 1000;
export const DEFAULT_EVENT_CAPACITY = 60;
export const DEFAULT_EVENT_SERIES = "1plus1_match";
export const MANUAL_ADMIN_EVENT_CODE = "manual-admin";
export const APRIL_2026_EVENT_CODE = "apr26";

type ReadCtx = QueryCtx | MutationCtx;
type Registration = Doc<"registrations">;
type EventRegistrationStatus = Doc<"eventRegistrations">["registrationStatus"];
type EventConfirmationStatus = Doc<"eventRegistrations">["confirmationStatus"];

export function interestWindowMs(event: Doc<"events">) {
  return event.eventCode === APRIL_2026_EVENT_CODE ? APRIL_2026_INTEREST_WINDOW_MS : DEFAULT_INTEREST_WINDOW_MS;
}

export function interestSubmissionClosesAt(event: Doc<"events">) {
  return event.interestSubmissionClosesAt ?? event.endsAt + interestWindowMs(event);
}

export function isApprovedMember(registration: Registration) {
  return (
    registration.status === "approved" &&
    (registration.paymentStatus === "paid" || registration.paymentStatus === undefined)
  );
}

export function deriveEligibilityStatus(registration: Registration) {
  return isApprovedMember(registration) ? "approved_member" as const : "awaiting_background_check" as const;
}

export async function getEventByCode(ctx: ReadCtx, eventCode: string) {
  return await ctx.db
    .query("events")
    .withIndex("by_eventCode", (q) => q.eq("eventCode", eventCode))
    .first();
}

export async function getManualAdminEvent(ctx: ReadCtx) {
  const event = await getEventByCode(ctx, MANUAL_ADMIN_EVENT_CODE);
  if (!event) {
    throw new Error("Manual/admin event has not been created");
  }
  return event;
}

export async function getOrCreateApril2026Event(ctx: MutationCtx) {
  const existing = await getEventByCode(ctx, APRIL_2026_EVENT_CODE);
  if (existing) return existing;

  const now = Date.now();
  const startsAt = new Date("2026-04-12T15:00:00-05:00").getTime();
  const endsAt = new Date("2026-04-12T17:30:00-05:00").getTime();
  const eventId = await ctx.db.insert("events", {
    title: "1Plus1 Match Event - Apr26",
    eventCode: APRIL_2026_EVENT_CODE,
    eventMonth: "2026-04",
    series: DEFAULT_EVENT_SERIES,
    location: "ROIC",
    startsAt,
    endsAt,
    status: "completed",
    maleCapacity: DEFAULT_EVENT_CAPACITY,
    femaleCapacity: DEFAULT_EVENT_CAPACITY,
    interestSubmissionClosesAt: endsAt + APRIL_2026_INTEREST_WINDOW_MS,
    createdAt: now,
    updatedAt: now,
  });
  const event = await ctx.db.get(eventId);
  if (!event) throw new Error("April 2026 event not found after creation");
  return event;
}

export async function getOrCreateManualAdminEvent(ctx: MutationCtx) {
  const existing = await getEventByCode(ctx, MANUAL_ADMIN_EVENT_CODE);
  if (existing) return existing;

  const now = Date.now();
  const eventId = await ctx.db.insert("events", {
    title: "1Plus1 Manual/Admin Interest",
    eventCode: MANUAL_ADMIN_EVENT_CODE,
    eventMonth: "manual",
    series: "admin_manual",
    location: "Admin",
    startsAt: 0,
    endsAt: 0,
    status: "completed",
    maleCapacity: DEFAULT_EVENT_CAPACITY,
    femaleCapacity: DEFAULT_EVENT_CAPACITY,
    createdAt: now,
    updatedAt: now,
  });
  const event = await ctx.db.get(eventId);
  if (!event) throw new Error("Manual/admin event not found after creation");
  return event;
}

export async function ensureEventRegistration(
  ctx: MutationCtx,
  args: {
    eventId: Id<"events">;
    registration: Registration;
    registrationStatus: EventRegistrationStatus;
    confirmationStatus?: EventConfirmationStatus;
    attendanceStatus?: Doc<"eventRegistrations">["attendanceStatus"];
    waitlistCarryoverFromEventId?: Id<"events">;
  }
) {
  const existing = await ctx.db
    .query("eventRegistrations")
    .withIndex("by_eventId_and_registrationId", (q) =>
      q.eq("eventId", args.eventId).eq("registrationId", args.registration._id)
    )
    .unique();
  const now = Date.now();
  const patch = {
    gender: args.registration.gender,
    registrationStatus: args.registrationStatus,
    confirmationStatus: args.confirmationStatus ?? existing?.confirmationStatus ?? "not_confirmed",
    attendanceStatus: args.attendanceStatus ?? existing?.attendanceStatus ?? "not_checked_in" as const,
    eligibilityStatus: deriveEligibilityStatus(args.registration),
    waitlistCarryoverFromEventId: args.waitlistCarryoverFromEventId ?? existing?.waitlistCarryoverFromEventId,
    approvedAt: args.registrationStatus === "approved" ? existing?.approvedAt ?? now : existing?.approvedAt,
    cancelledAt: args.registrationStatus === "withdrawn" ? existing?.cancelledAt ?? now : existing?.cancelledAt,
    checkedInAt: args.attendanceStatus === "attended" ? existing?.checkedInAt ?? now : existing?.checkedInAt,
    updatedAt: now,
  };

  if (existing) {
    await ctx.db.patch(existing._id, patch);
    return existing._id;
  }

  return await ctx.db.insert("eventRegistrations", {
    eventId: args.eventId,
    registrationId: args.registration._id,
    gender: args.registration.gender,
    registrationStatus: args.registrationStatus,
    confirmationStatus: args.confirmationStatus ?? "not_confirmed",
    attendanceStatus: args.attendanceStatus ?? "not_checked_in",
    eligibilityStatus: deriveEligibilityStatus(args.registration),
    waitlistCarryoverFromEventId: args.waitlistCarryoverFromEventId,
    approvedAt: args.registrationStatus === "approved" ? now : undefined,
    cancelledAt: args.registrationStatus === "withdrawn" ? now : undefined,
    checkedInAt: args.attendanceStatus === "attended" ? now : undefined,
    createdAt: now,
    updatedAt: now,
  });
}

async function attendedRowsForRegistration(ctx: ReadCtx, registrationId: Id<"registrations">) {
  return await ctx.db
    .query("eventRegistrations")
    .withIndex("by_registrationId_and_attendanceStatus", (q) =>
      q.eq("registrationId", registrationId).eq("attendanceStatus", "attended")
    )
    .take(100);
}

export async function findEligibleSharedInterestEvent(
  ctx: ReadCtx,
  fromRegistrationId: Id<"registrations">,
  toRegistrationId: Id<"registrations">,
  now = Date.now()
) {
  const [fromRows, toRows] = await Promise.all([
    attendedRowsForRegistration(ctx, fromRegistrationId),
    attendedRowsForRegistration(ctx, toRegistrationId),
  ]);
  const targetEventIds = new Set(toRows.map((row) => row.eventId));
  const sharedRows = fromRows.filter((row) => targetEventIds.has(row.eventId));

  const events = await Promise.all(sharedRows.map((row) => ctx.db.get(row.eventId)));
  return events
    .filter((event): event is Doc<"events"> =>
      Boolean(
        event &&
        event.eventCode !== MANUAL_ADMIN_EVENT_CODE &&
        event.status === "completed" &&
        event.endsAt <= now &&
        interestSubmissionClosesAt(event) >= now
      )
    )
    .sort((a, b) => b.endsAt - a.endsAt)[0] ?? null;
}

export async function findEligibleInterestSubmissionEvent(
  ctx: ReadCtx,
  registrationId: Id<"registrations">,
  now = Date.now()
) {
  const attendedRows = await attendedRowsForRegistration(ctx, registrationId);
  const events = await Promise.all(attendedRows.map((row) => ctx.db.get(row.eventId)));
  return events
    .filter((event): event is Doc<"events"> =>
      Boolean(
        event &&
        event.eventCode !== MANUAL_ADMIN_EVENT_CODE &&
        event.status === "completed" &&
        event.endsAt <= now &&
        interestSubmissionClosesAt(event) >= now
      )
    )
    .sort((a, b) => b.endsAt - a.endsAt)[0] ?? null;
}

export async function listEligibleInterestTargets(ctx: ReadCtx, registration: Registration, now = Date.now()) {
  const targetIds = new Set<Id<"registrations">>();
  const eligibleEvent = await findEligibleInterestSubmissionEvent(ctx, registration._id, now);
  if (!eligibleEvent) return targetIds;

  const registrations = await ctx.db.query("registrations").take(1000);
  for (const target of registrations) {
    if (
      target._id !== registration._id &&
      target.gender !== registration.gender &&
      target.status === "approved" &&
      target.profileCompletionStatus === "completed"
    ) {
      targetIds.add(target._id);
    }
  }

  return targetIds;
}

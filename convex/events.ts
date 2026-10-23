import { requireEventAdmin, reservesCapacity, countCapacityUsed, registrationStatusForCapacity, promoteWaitlist } from "./eventCapacity";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  DEFAULT_EVENT_CAPACITY,
  DEFAULT_EVENT_SERIES,
  deriveEligibilityStatus,
  getEventByCode,
  interestSubmissionClosesAt,
  findEligibleInterestSubmissionEvent,
} from "./eventRules";

const eventStatus = v.union(
  v.literal("draft"),
  v.literal("scheduled"),
  v.literal("completed"),
  v.literal("cancelled")
);
const eventRegistrationStatus = v.union(
  v.literal("waitlisted"),
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("withdrawn")
);
const eventConfirmationStatus = v.union(
  v.literal("confirmed"),
  v.literal("not_confirmed"),
  v.literal("cancelled")
);
const eventAttendanceStatus = v.union(
  v.literal("not_checked_in"),
  v.literal("attended"),
  v.literal("no_show")
);
const eventRegistrationEmailKind = v.union(
  v.literal("approved"),
  v.literal("waitlisted"),
  v.literal("confirmation_request"),
  v.literal("cancelled"),
  v.literal("reminder")
);
const carryoverSourceStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("waitlisted")
);

type ReadCtx = QueryCtx | MutationCtx;
type EventRegistration = Doc<"eventRegistrations">;
type ConfirmationStatus = "confirmed" | "not_confirmed" | "cancelled";

function assertValidEventTimes(startsAt: number, endsAt: number) {
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) {
    throw new Error("Event end time must be after start time");
  }
}

function assertCapacity(capacity: number, label: string) {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new Error(`${label} capacity must be a positive integer`);
  }
}

async function getRegistrationForSession(ctx: ReadCtx, sessionHash: string) {
  const session = await ctx.db
    .query("applicantSessions")
    .withIndex("by_sessionHash", (q) => q.eq("sessionHash", sessionHash))
    .unique();

  if (!session || session.revokedAt || session.expiresAt <= Date.now()) {
    throw new Error("Unauthorized");
  }

  const registration = await ctx.db.get(session.registrationId);
  if (!registration) {
    throw new Error("Unauthorized");
  }

  return registration;
}

function requireCompletedProfile(registration: Doc<"registrations">) {
  if (registration.profileCompletionStatus !== "completed") {
    throw new Error("Complete your profile before registering for an event");
  }
}

function confirmationStatusForRow(row: EventRegistration): ConfirmationStatus {
  return row.confirmationStatus;
}

async function serializeEventRegistration(ctx: ReadCtx, row: EventRegistration) {
  const [event, registration] = await Promise.all([
    ctx.db.get(row.eventId),
    ctx.db.get(row.registrationId),
  ]);
  return { ...row, confirmationStatus: confirmationStatusForRow(row), event, registration };
}

async function serializeEventWaitlistEntry(ctx: ReadCtx, row: Doc<"eventWaitlistEntries">) {
  const [event, registration, sourceEvent] = await Promise.all([
    ctx.db.get(row.eventId),
    ctx.db.get(row.registrationId),
    row.sourceEventId ? ctx.db.get(row.sourceEventId) : Promise.resolve(null),
  ]);
  return { ...row, event, registration, sourceEvent };
}


async function carryOverRegistrationsFromEvent(
  ctx: MutationCtx,
  args: {
    sourceEventId: Id<"events">;
    targetEvent: Doc<"events">;
    sourceStatuses: Array<"pending" | "approved" | "waitlisted">;
    overrideCapacity?: boolean;
  }
) {
  if (args.sourceEventId === args.targetEvent._id) {
    throw new Error("Choose a different source event");
  }

  const sourceEvent = await ctx.db.get(args.sourceEventId);
  if (!sourceEvent) throw new Error("Source event not found");

  let copied = 0;
  let alreadyExists = 0;
  const skippedCapacity = 0;
  let skippedMissingRegistration = 0;
  const seenSourceRegistrationIds = new Set<string>();

  async function copyRegistration(registrationId: Id<"registrations">, waitlistCarryoverFromEventId: Id<"events">) {
    if (seenSourceRegistrationIds.has(registrationId)) return;
    seenSourceRegistrationIds.add(registrationId);

    const registration = await ctx.db.get(registrationId);
    if (!registration) {
      skippedMissingRegistration += 1;
      return;
    }

    const existing = await ctx.db
      .query("eventRegistrations")
      .withIndex("by_eventId_and_registrationId", (q) =>
        q.eq("eventId", args.targetEvent._id).eq("registrationId", registration._id)
      )
      .unique();
    if (existing) {
      alreadyExists += 1;
      return;
    }

    await promoteWaitlist(ctx, args.targetEvent._id, registration.gender);
    const status = await registrationStatusForCapacity(ctx, args.targetEvent, registration.gender);
    const now = Date.now();
    await ctx.db.insert("eventRegistrations", {
      eventId: args.targetEvent._id,
      registrationId: registration._id,
      gender: registration.gender,
      registrationStatus: status,
      waitlistedAt: status === "waitlisted" ? now : undefined,
      confirmationStatus: "not_confirmed",
      attendanceStatus: "not_checked_in",
      eligibilityStatus: deriveEligibilityStatus(registration),
      waitlistCarryoverFromEventId,
      createdAt: now,
      updatedAt: now,
    });
    copied += 1;
  }

  for (const sourceStatus of args.sourceStatuses) {
    if (sourceStatus === "waitlisted") {
      for await (const row of ctx.db.query("eventRegistrations").withIndex("by_eventId_and_registrationStatus", q => q.eq("eventId", sourceEvent._id).eq("registrationStatus", "waitlisted"))) {
        await copyRegistration(row.registrationId, sourceEvent._id);
      }
      // Existing holding-list records are read-only pending Danielle's retirement/orphan decision.
      continue;
    }

    const rows = await ctx.db
      .query("eventRegistrations")
      .withIndex("by_eventId_and_registrationStatus", (q) =>
        q.eq("eventId", sourceEvent._id).eq("registrationStatus", sourceStatus)
      )
      .take(500);

    for (const row of rows.sort((a, b) => a.createdAt - b.createdAt || a._creationTime - b._creationTime)) {
      await copyRegistration(row.registrationId, sourceEvent._id);
    }
  }

  return {
    copied,
    alreadyExists,
    skippedCapacity,
    skippedMissingRegistration,
    sourceEventId: sourceEvent._id,
    targetEventId: args.targetEvent._id,
  };
}

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query("events").withIndex("by_startsAt").order("desc").take(100);
    return await Promise.all(
      events.map(async (event) => {
        // Isolate statuses so historical rows cannot hide a new queue. Never return partial counts.
    const registrations = (await Promise.all(
      (["pending", "approved", "waitlisted", "rejected", "withdrawn"] as const).map(async (status) => {
        const statusRows = await ctx.db.query("eventRegistrations")
          .withIndex("by_eventId_and_registrationStatus", q => q.eq("eventId", event._id).eq("registrationStatus", status))
          .take(1001);
        if (statusRows.length > 1000) throw new Error(status + " roster exceeds 1000 rows. Complete counts unavailable; paginated review is required.");
        return statusRows;
      })
    )).flat();
        return {
          ...event,
          interestSubmissionClosesAt: interestSubmissionClosesAt(event),
          counts: {
            malePending: registrations.filter((row) => row.gender === "male" && row.registrationStatus === "pending").length,
            maleApproved: registrations.filter((row) => row.gender === "male" && row.registrationStatus === "approved").length,
            maleWaitlisted: registrations.filter(row => row.gender === "male" && row.registrationStatus === "waitlisted").length,
            femalePending: registrations.filter((row) => row.gender === "female" && row.registrationStatus === "pending").length,
            femaleApproved: registrations.filter((row) => row.gender === "female" && row.registrationStatus === "approved").length,
            femaleWaitlisted: registrations.filter(row => row.gender === "female" && row.registrationStatus === "waitlisted").length,
            attended: registrations.filter((row) => row.attendanceStatus === "attended").length,
            noShow: registrations.filter((row) => row.attendanceStatus === "no_show").length,
          },
        };
      })
    );
  },
});

export const getPublicActive = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const events = await ctx.db
      .query("events")
      .withIndex("by_startsAt", (q) => q.gte("startsAt", now))
      .order("asc")
      .take(20);

    const scheduledEvents = events
      .filter((event) => event.status === "scheduled")
      .sort((a, b) => a.startsAt - b.startsAt || b._creationTime - a._creationTime)
      .slice(0, 4);

    return await Promise.all(
      scheduledEvents.map(async (event) => {
        const maleUsed = await countCapacityUsed(ctx, event._id, "male");
        const femaleUsed = await countCapacityUsed(ctx, event._id, "female");

        return {
          _id: event._id,
          title: event.title,
          eventCode: event.eventCode,
          eventMonth: event.eventMonth,
          location: event.location,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          maleCapacity: event.maleCapacity,
          femaleCapacity: event.femaleCapacity,
          maleAvailable: Math.max(event.maleCapacity - maleUsed, 0),
          femaleAvailable: Math.max(event.femaleCapacity - femaleUsed, 0),
          maleWaitlisted: maleUsed >= event.maleCapacity,
          femaleWaitlisted: femaleUsed >= event.femaleCapacity,
        };
      })
    );
  },
});

export const getPublicByCode = query({
  args: { eventCode: v.string() },
  handler: async (ctx, args) => {
    const event = await getEventByCode(ctx, args.eventCode.trim());
    if (!event || event.status !== "scheduled") return null;

    const now = Date.now();
    if (event.registrationOpensAt && event.registrationOpensAt > now) return null;
    if (event.registrationClosesAt && event.registrationClosesAt < now) return null;

    const maleUsed = await countCapacityUsed(ctx, event._id, "male");
    const femaleUsed = await countCapacityUsed(ctx, event._id, "female");

    return {
      _id: event._id,
      title: event.title,
      eventCode: event.eventCode,
      eventMonth: event.eventMonth,
      location: event.location,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      maleCapacity: event.maleCapacity,
      femaleCapacity: event.femaleCapacity,
      maleAvailable: Math.max(event.maleCapacity - maleUsed, 0),
      femaleAvailable: Math.max(event.femaleCapacity - femaleUsed, 0),
      maleWaitlisted: maleUsed >= event.maleCapacity,
      femaleWaitlisted: femaleUsed >= event.femaleCapacity,
    };
  },
});

export const getWaitlistedRegistrationIds = query({
  args: {},
  handler: async (ctx) => {
    const activeRegistrationIds = new Set<Id<"registrations">>();
    const waitlistEntries = await ctx.db
      .query("eventWaitlistEntries")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(1000);
    for (const row of waitlistEntries) {
      activeRegistrationIds.add(row.registrationId);
    }

    return [...activeRegistrationIds];
  },
});

export const getDetail = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    // Isolate statuses so historical rows cannot hide a new queue. Never return partial counts.
    const rows = (await Promise.all(
      (["pending", "approved", "waitlisted", "rejected", "withdrawn"] as const).map(async (status) => {
        const statusRows = await ctx.db.query("eventRegistrations")
          .withIndex("by_eventId_and_registrationStatus", q => q.eq("eventId", args.eventId).eq("registrationStatus", status))
          .take(1001);
        if (statusRows.length > 1000) throw new Error(status + " roster exceeds 1000 rows. Complete counts unavailable; paginated review is required.");
        return statusRows;
      })
    )).flat();
    const waitlistRows = await ctx.db.query("eventWaitlistEntries")
      .withIndex("by_eventId_and_status", q => q.eq("eventId", args.eventId).eq("status", "active"))
      .take(1001);
    if (waitlistRows.length > 1000) throw new Error("Legacy waitlist exceeds 1000 rows. Complete roster unavailable; paginated review is required.");
    const linkedInterest = await ctx.db
      .query("interests")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .first();
    const linkedEmail = await ctx.db
      .query("eventRegistrationEmails")
      .withIndex("by_eventId_and_kind", (q) => q.eq("eventId", args.eventId))
      .first();
    const attendee = await ctx.db.query("eventAttendees").withIndex("by_eventId_and_registrationId", q => q.eq("eventId", args.eventId)).first();
    const deleteBlockedReason = attendee ? "Cannot delete an event with attendance history." : rows.length
      ? "Cannot delete an event after someone has signed up."
      : linkedInterest
        ? "Cannot delete an event linked to interest history."
          : linkedEmail
            ? "Cannot delete an event linked to email history."
            : waitlistRows.length
              ? "Cannot delete an event with waitlisted applicants."
              : null;
    return {
      ...event,
      interestSubmissionClosesAt: interestSubmissionClosesAt(event),
      canDelete: deleteBlockedReason === null,
      deleteBlockedReason,
      registrations: await Promise.all(rows.map((row) => serializeEventRegistration(ctx, row))),
      waitlistEntries: await Promise.all(waitlistRows.map((row) => serializeEventWaitlistEntry(ctx, row))),
    };
  },
});

export const getApplicantEvents = query({
  args: { sessionHash: v.string() },
  handler: async (ctx, args) => {
    const registration = await getRegistrationForSession(ctx, args.sessionHash);
    const events = await ctx.db.query("events").withIndex("by_startsAt").order("desc").take(100);
    const eventRegistrations = await ctx.db
      .query("eventRegistrations")
      .withIndex("by_registrationId", (q) => q.eq("registrationId", registration._id))
      .take(100);
    const byEventId = new Map(eventRegistrations.map((row) => [row.eventId, row] as const));
    const eligibleEvent = await findEligibleInterestSubmissionEvent(ctx, registration._id);

    return {
      upcoming: events
        .filter((event) => event.status === "scheduled")
        .map((event) => ({
          ...event,
          registration: byEventId.get(event._id) ?? null,
        })),
      history: await Promise.all(eventRegistrations.map((row) => serializeEventRegistration(ctx, row))),
      canSubmitInterest: Boolean(eligibleEvent),
    };
  },
});

export const getByRegistration = query({
  args: { registrationId: v.id("registrations") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("eventRegistrations")
      .withIndex("by_registrationId", (q) => q.eq("registrationId", args.registrationId))
      .take(100);
    return await Promise.all(rows.map((row) => serializeEventRegistration(ctx, row)));
  },
});

export const create = mutation({
  args: {
    adminSecret: v.string(),
    title: v.string(),
    eventCode: v.string(),
    eventMonth: v.string(),
    series: v.optional(v.string()),
    description: v.optional(v.string()),
    location: v.string(),
    startsAt: v.number(),
    endsAt: v.number(),
    status: v.optional(eventStatus),
    maleCapacity: v.optional(v.number()),
    femaleCapacity: v.optional(v.number()),
    registrationOpensAt: v.optional(v.number()),
    registrationClosesAt: v.optional(v.number()),
    interestSubmissionClosesAt: v.optional(v.number()),
    adminNotes: v.optional(v.string()),
    carryOverWaitlist: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    requireEventAdmin(args.adminSecret);
    assertValidEventTimes(args.startsAt, args.endsAt);
    const maleCapacity = args.maleCapacity ?? DEFAULT_EVENT_CAPACITY;
    const femaleCapacity = args.femaleCapacity ?? DEFAULT_EVENT_CAPACITY;
    assertCapacity(maleCapacity, "Male");
    assertCapacity(femaleCapacity, "Female");

    const existingCode = await ctx.db
      .query("events")
      .withIndex("by_eventCode", (q) => q.eq("eventCode", args.eventCode.trim()))
      .first();
    if (existingCode) throw new Error("An event with this code already exists");

    const now = Date.now();
    const eventId = await ctx.db.insert("events", {
      title: args.title.trim(),
      eventCode: args.eventCode.trim(),
      eventMonth: args.eventMonth.trim(),
      series: args.series?.trim() || DEFAULT_EVENT_SERIES,
      description: args.description?.trim() || undefined,
      location: args.location.trim(),
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      status: args.status ?? "draft",
      maleCapacity,
      femaleCapacity,
      registrationOpensAt: args.registrationOpensAt,
      registrationClosesAt: args.registrationClosesAt,
      interestSubmissionClosesAt: args.interestSubmissionClosesAt,
      adminNotes: args.adminNotes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });

    const event = await ctx.db.get(eventId);
    if (!event) throw new Error("Event not found after creation");
    if (args.carryOverWaitlist) throw new Error("Automatic cross-event waitlist carryover is retired");
    const carryover = null;
    return { eventId, carryover };
  },
});

export const update = mutation({
  args: {
    adminSecret: v.string(),
    eventId: v.id("events"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    status: v.optional(eventStatus),
    maleCapacity: v.optional(v.number()),
    femaleCapacity: v.optional(v.number()),
    registrationOpensAt: v.optional(v.number()),
    registrationClosesAt: v.optional(v.number()),
    interestSubmissionClosesAt: v.optional(v.number()),
    adminNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireEventAdmin(args.adminSecret);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    const startsAt = args.startsAt ?? event.startsAt;
    const endsAt = args.endsAt ?? event.endsAt;
    assertValidEventTimes(startsAt, endsAt);
    if (args.maleCapacity !== undefined) assertCapacity(args.maleCapacity, "Male");
    if (args.femaleCapacity !== undefined) assertCapacity(args.femaleCapacity, "Female");

    for (const gender of ["male", "female"] as const) {
      const cap = gender === "male" ? args.maleCapacity : args.femaleCapacity;
      if (cap !== undefined && cap < await countCapacityUsed(ctx, event._id, gender)) throw new Error("Capacity cannot be below reserved Pending and Approved places");
    }
    await ctx.db.patch(args.eventId, {
      title: args.title?.trim() ?? event.title,
      description: args.description?.trim() || event.description,
      location: args.location?.trim() ?? event.location,
      startsAt,
      endsAt,
      status: args.status ?? event.status,
      maleCapacity: args.maleCapacity ?? event.maleCapacity,
      femaleCapacity: args.femaleCapacity ?? event.femaleCapacity,
      registrationOpensAt: args.registrationOpensAt ?? event.registrationOpensAt,
      registrationClosesAt: args.registrationClosesAt ?? event.registrationClosesAt,
      interestSubmissionClosesAt: args.interestSubmissionClosesAt ?? event.interestSubmissionClosesAt,
      adminNotes: args.adminNotes?.trim() || event.adminNotes,
      updatedAt: Date.now(),
    });
    await promoteWaitlist(ctx, event._id, "male");
    await promoteWaitlist(ctx, event._id, "female");
    return args.eventId;
  },
});

export const deleteEvent = mutation({
  args: {
    adminSecret: v.string(),
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    requireEventAdmin(args.adminSecret);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");

    const attendee = await ctx.db.query("eventAttendees").withIndex("by_eventId_and_registrationId", q => q.eq("eventId", args.eventId)).first();
    if (attendee) throw new Error("Cannot delete an event with attendance history.");
    const existingRegistration = await ctx.db
      .query("eventRegistrations")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .first();
    if (existingRegistration) {
      throw new Error("Cannot delete an event after someone has signed up.");
    }

    const linkedInterest = await ctx.db
      .query("interests")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .first();
    if (linkedInterest) {
      throw new Error("Cannot delete an event linked to interest history.");
    }

    const linkedEmail = await ctx.db
      .query("eventRegistrationEmails")
      .withIndex("by_eventId_and_kind", (q) => q.eq("eventId", args.eventId))
      .first();
    if (linkedEmail) {
      throw new Error("Cannot delete an event linked to email history.");
    }

    const activeWaitlistEntry = await ctx.db
      .query("eventWaitlistEntries")
      .withIndex("by_eventId_and_status", (q) => q.eq("eventId", args.eventId).eq("status", "active"))
      .first();
    if (activeWaitlistEntry) {
      throw new Error("Cannot delete an event with waitlisted applicants.");
    }

    await ctx.db.delete(args.eventId);
    return args.eventId;
  },
});

export const carryOverRegistrations = mutation({
  args: {
    adminSecret: v.string(),
    sourceEventId: v.id("events"),
    targetEventId: v.id("events"),
    sourceStatuses: v.array(carryoverSourceStatus),
    overrideCapacity: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    requireEventAdmin(args.adminSecret);
    const targetEvent = await ctx.db.get(args.targetEventId);
    if (!targetEvent) throw new Error("Target event not found");
    if (targetEvent.status === "completed" || targetEvent.status === "cancelled") {
      throw new Error("Cannot carry registrations into a completed or cancelled event");
    }
    const sourceStatuses = [...new Set(args.sourceStatuses)];
    if (!sourceStatuses.length) {
      throw new Error("Select at least one source status");
    }

    return await carryOverRegistrationsFromEvent(ctx, {
      sourceEventId: args.sourceEventId,
      targetEvent,
      sourceStatuses,
      overrideCapacity: args.overrideCapacity,
    });
  },
});

export const moveEventRegistrationsToAprilWaitlist = mutation({ args: { eventId: v.id("events") }, handler: async () => { throw new Error("Legacy cross-event migration is retired; no data changed"); } });

export const registerForEvent = mutation({
  args: {
    sessionHash: v.string(),
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    const registration = await getRegistrationForSession(ctx, args.sessionHash);
    requireCompletedProfile(registration);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    if (event.status !== "scheduled") throw new Error("Event registration is not open");
    const now = Date.now();
    if (event.registrationOpensAt && event.registrationOpensAt > now) throw new Error("Event registration is not open yet");
    if (event.registrationClosesAt && event.registrationClosesAt < now) throw new Error("Event registration is closed");

    const existing = await ctx.db
      .query("eventRegistrations")
      .withIndex("by_eventId_and_registrationId", (q) =>
        q.eq("eventId", event._id).eq("registrationId", registration._id)
      )
      .unique();
    if (existing && !["withdrawn", "rejected"].includes(existing.registrationStatus)) {
      return { eventRegistrationId: existing._id, registrationStatus: existing.registrationStatus, event, registration };
    }

    await promoteWaitlist(ctx, event._id, registration.gender);
    const registrationStatus = await registrationStatusForCapacity(ctx, event, registration.gender);
    const payload = {
      eventId: event._id,
      registrationId: registration._id,
      gender: registration.gender,
      registrationStatus,
      waitlistedAt: registrationStatus === "waitlisted" ? now : undefined,
      approvedAt: undefined,
      confirmationStatus: "confirmed" as const,
      attendanceStatus: "not_checked_in" as const,
      eligibilityStatus: deriveEligibilityStatus(registration),
      confirmedAt: now,
      confirmationRequestedAt: undefined,
      confirmationExpiresAt: undefined,
      cancelledAt: undefined,
      rejectedAt: undefined,
      receiptAttempt: (existing?.receiptAttempt ?? 0) + 1,
      registrationReceivedEmailSentAt: undefined,
      registrationReceivedEmailError: undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return { eventRegistrationId: existing._id, registrationStatus, event, registration };
    }

    const eventRegistrationId = await ctx.db.insert("eventRegistrations", payload);
    return { eventRegistrationId, registrationStatus, event, registration };
  },
});

export const addRegistration = mutation({
  args: {
    adminSecret: v.string(),
    registrationId: v.id("registrations"),
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    requireEventAdmin(args.adminSecret);
    const registration = await ctx.db.get(args.registrationId);
    if (!registration) throw new Error("Profile not found");

    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    if (event.status === "cancelled" || event.status === "completed") throw new Error("Event registration is closed");
    const now = Date.now();
    if (event.registrationOpensAt && event.registrationOpensAt > now) throw new Error("Event registration is not open yet");
    if (event.registrationClosesAt && event.registrationClosesAt < now) throw new Error("Event registration is closed");

    const existing = await ctx.db
      .query("eventRegistrations")
      .withIndex("by_eventId_and_registrationId", (q) =>
        q.eq("eventId", event._id).eq("registrationId", registration._id)
      )
      .unique();
    if (existing && !["withdrawn", "rejected"].includes(existing.registrationStatus)) {
      return { eventRegistrationId: existing._id, registrationStatus: existing.registrationStatus, event, registration };
    }

    await promoteWaitlist(ctx, event._id, registration.gender);
    const registrationStatus = await registrationStatusForCapacity(ctx, event, registration.gender);
    const payload = {
      eventId: event._id,
      registrationId: registration._id,
      gender: registration.gender,
      registrationStatus,
      waitlistedAt: registrationStatus === "waitlisted" ? now : undefined,
      approvedAt: undefined,
      confirmationStatus: "confirmed" as const,
      attendanceStatus: "not_checked_in" as const,
      eligibilityStatus: deriveEligibilityStatus(registration),
      confirmedAt: now,
      confirmationRequestedAt: undefined,
      confirmationExpiresAt: undefined,
      cancelledAt: undefined,
      rejectedAt: undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return { eventRegistrationId: existing._id, registrationStatus, event, registration };
    }

    const eventRegistrationId = await ctx.db.insert("eventRegistrations", payload);
    return { eventRegistrationId, registrationStatus, event, registration };
  },
});

export const updateRegistrationStatus = mutation({
  args: {
    adminSecret: v.string(),
    eventRegistrationId: v.id("eventRegistrations"),
    registrationStatus: eventRegistrationStatus,
    overrideCapacity: v.optional(v.boolean()),
    adminNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireEventAdmin(args.adminSecret);
    const row = await ctx.db.get(args.eventRegistrationId);
    if (!row) throw new Error("Event registration not found");
    const event = await ctx.db.get(row.eventId);
    if (!event) throw new Error("Event not found");
    const now = Date.now();

    if (args.overrideCapacity) throw new Error("Capacity overrides are not allowed");
    if (args.registrationStatus === "approved" && row.registrationStatus !== "pending" && row.registrationStatus !== "approved") throw new Error("Only Pending registrations may be approved");
    if (args.registrationStatus === "waitlisted") throw new Error("Waitlisting is determined by capacity");
    if (row.registrationStatus === "waitlisted" && args.registrationStatus === "pending") {
      await promoteWaitlist(ctx, event._id, row.gender);
      return row._id; // Preserve queue position; manual clicks cannot jump the queue.
    }
    let nextStatus: EventRegistration["registrationStatus"] = args.registrationStatus;
    if (nextStatus === "pending" && !reservesCapacity(row.registrationStatus)) {
      await promoteWaitlist(ctx, event._id, row.gender);
      nextStatus = await registrationStatusForCapacity(ctx, event, row.gender);
    }
    await ctx.db.patch(row._id, {
      registrationStatus: nextStatus,
      waitlistedAt: nextStatus === "waitlisted" ? now : row.waitlistedAt,
      approvedAt: nextStatus === "approved" ? row.approvedAt ?? now : undefined,
      rejectedAt: args.registrationStatus === "rejected" ? row.rejectedAt ?? now : row.rejectedAt,
      cancelledAt: args.registrationStatus === "withdrawn" ? row.cancelledAt ?? now : row.cancelledAt,
      adminNotes: args.adminNotes?.trim() || row.adminNotes,
      updatedAt: now,
    });
    await promoteWaitlist(ctx, row.eventId, row.gender);
    return row._id;
  },
});

export const updateAttendanceStatus = mutation({
  args: {
    adminSecret: v.string(),
    eventRegistrationId: v.id("eventRegistrations"),
    attendanceStatus: eventAttendanceStatus,
  },
  handler: async (ctx, args) => {
    if (!process.env.ATTENDANCE_ADMIN_SECRET || args.adminSecret !== process.env.ATTENDANCE_ADMIN_SECRET) throw new Error("Unauthorized");
    const row = await ctx.db.get(args.eventRegistrationId);
    if (!row) throw new Error("Event registration not found");
    const now = Date.now();
    await ctx.db.patch(row._id, {
      attendanceStatus: args.attendanceStatus,
      checkedInAt: args.attendanceStatus === "attended" ? row.checkedInAt ?? now : row.checkedInAt,
      noShowMarkedAt: args.attendanceStatus === "no_show" ? row.noShowMarkedAt ?? now : row.noShowMarkedAt,
      updatedAt: now,
    });
    return row._id;
  },
});

export const updateRegistrationConfirmation = mutation({
  args: {
    adminSecret: v.string(),
    eventRegistrationId: v.id("eventRegistrations"),
    confirmationStatus: eventConfirmationStatus,
  },
  handler: async (ctx, args) => {
    requireEventAdmin(args.adminSecret);
    const row = await ctx.db.get(args.eventRegistrationId);
    if (!row) throw new Error("Event registration not found");
    if (row.registrationStatus === "rejected" && args.confirmationStatus === "confirmed") {
      throw new Error("Rejected event registrations cannot be confirmed");
    }

    const now = Date.now();
    const patch =
      args.confirmationStatus === "confirmed"
        ? {
            confirmationStatus: "confirmed" as const,
            confirmedAt: row.confirmedAt ?? now,
            updatedAt: now,
          }
        : args.confirmationStatus === "cancelled"
          ? {
              registrationStatus: "withdrawn" as const,
              confirmationStatus: "cancelled" as const,
              cancelledAt: row.cancelledAt ?? now,
              updatedAt: now,
            }
          : {
              confirmationStatus: "not_confirmed" as const,
              confirmedAt: undefined,
              updatedAt: now,
            };
    await ctx.db.patch(row._id, patch);
    if (args.confirmationStatus === "cancelled") await promoteWaitlist(ctx, row.eventId, row.gender);
    return row._id;
  },
});

export const verifyEventRegistrationStatusAxes = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("eventRegistrations").take(1000);
    return {
      checked: rows.length,
      byRegistrationStatus: rows.reduce<Record<string, number>>((counts, row) => {
        counts[row.registrationStatus] = (counts[row.registrationStatus] ?? 0) + 1;
        return counts;
      }, {}),
      byConfirmationStatus: rows.reduce<Record<string, number>>((counts, row) => {
        counts[row.confirmationStatus] = (counts[row.confirmationStatus] ?? 0) + 1;
        return counts;
      }, {}),
    };
  },
});

export const requestConfirmation = mutation({
  args: {
    adminSecret: v.string(),
    eventRegistrationId: v.id("eventRegistrations"),
  },
  handler: async (ctx, args) => {
    requireEventAdmin(args.adminSecret);
    const row = await ctx.db.get(args.eventRegistrationId);
    if (!row) throw new Error("Event registration not found");
    const event = await ctx.db.get(row.eventId);
    if (!event) throw new Error("Event not found");
    if (event.status === "completed" || event.status === "cancelled") {
      throw new Error("Notification actions are locked for completed or cancelled events");
    }
    const now = Date.now();
    await ctx.db.patch(row._id, {
      confirmationStatus: "not_confirmed",
      confirmedAt: undefined,
      confirmationRequestedAt: now,
      confirmationExpiresAt: now + 24 * 60 * 60 * 1000,
      updatedAt: now,
    });
    return row._id;
  },
});

export const confirmParticipation = mutation({
  args: {
    sessionHash: v.string(),
    eventRegistrationId: v.id("eventRegistrations"),
  },
  handler: async (ctx, args) => {
    const registration = await getRegistrationForSession(ctx, args.sessionHash);
    const row = await ctx.db.get(args.eventRegistrationId);
    if (!row || row.registrationId !== registration._id) throw new Error("Event registration not found");
    if (reservesCapacity(row.registrationStatus) && confirmationStatusForRow(row) === "confirmed") {
      return row._id;
    }
    if (row.confirmationRequestedAt && row.confirmationExpiresAt && row.confirmationExpiresAt < Date.now()) {
      throw new Error("Confirmation window has expired");
    }
    if (row.registrationStatus === "withdrawn" && (!row.confirmationRequestedAt || !row.confirmationExpiresAt)) {
      throw new Error("This event registration cannot be confirmed");
    }
    if (
      row.registrationStatus !== "pending" &&
      row.registrationStatus !== "approved" &&
      row.registrationStatus !== "withdrawn"
    ) {
      throw new Error("This event registration cannot be confirmed");
    }
    if (row.registrationStatus === "withdrawn") await promoteWaitlist(ctx, row.eventId, row.gender);
    await ctx.db.patch(row._id, {
      registrationStatus: row.registrationStatus === "withdrawn" ? await registrationStatusForCapacity(ctx, (await ctx.db.get(row.eventId))!, row.gender) : row.registrationStatus,
      waitlistedAt: row.registrationStatus === "withdrawn" ? Date.now() : row.waitlistedAt,
      confirmationStatus: "confirmed",
      confirmedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return row._id;
  },
});

export const expireUnconfirmed = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const pending = await ctx.db.query("eventRegistrations").take(500);
    let cancelled = 0;
    for (const row of pending) {
      if (
        confirmationStatusForRow(row) === "not_confirmed" &&
        row.confirmationExpiresAt &&
        row.confirmationExpiresAt < now &&
        !row.confirmedAt && reservesCapacity(row.registrationStatus)
      ) {
        await ctx.db.patch(row._id, {
          registrationStatus: "withdrawn",
          confirmationStatus: "cancelled",
          cancelledAt: now,
          updatedAt: now,
        });
        await promoteWaitlist(ctx, row.eventId, row.gender);
        cancelled += 1;
      }
    }
    return { cancelled };
  },
});

export const claimRegistrationReceivedEmail = mutation({
  args: { eventRegistrationId: v.id("eventRegistrations"), adminSecret: v.string(), token: v.string(), receiptAttempt: v.optional(v.number()) },
  handler: async (ctx, args) => {
    if (!process.env.ATTENDANCE_ADMIN_SECRET || args.adminSecret !== process.env.ATTENDANCE_ADMIN_SECRET) throw new Error("Unauthorized");
    const row = await ctx.db.get(args.eventRegistrationId);
    if (!row) throw new Error("Event registration not found");
    if (args.receiptAttempt !== undefined && args.receiptAttempt !== (row.receiptAttempt ?? 0)) return { claimed: false };
    if (row.registrationReceivedEmailSentAt || !["pending", "waitlisted"].includes(row.registrationStatus)) return { claimed: false };
    const key = "event-registration-received/" + row._id + "/" + (row.receiptAttempt ?? 0);
    const existing = await ctx.db.query("receiptDeliveries").withIndex("by_key", q => q.eq("key", key)).unique();
    const now = Date.now();
    if (existing?.sentAt) return { claimed: false };
    if (existing && existing.leaseUntil > now) return { claimed: false, error: "Receipt delivery in progress; retry later" };
    if (existing && now - existing.firstAttemptAt >= 23 * 60 * 60 * 1000) return { claimed: false, error: "Receipt delivery uncertain; manual reconciliation required" };
    const [event, registration] = await Promise.all([ctx.db.get(row.eventId), ctx.db.get(row.registrationId)]);
    if (!event || !registration) throw new Error("Missing receipt records");
    const payload = { name: registration.name, email: registration.email, eventTitle: event.title, registrationStatus: row.registrationStatus as "pending" | "waitlisted" };
    if (existing && existing.registrationStatus !== row.registrationStatus) return { claimed: false, error: "Receipt status changed; manual reconciliation required" };
    if (existing) await ctx.db.patch(existing._id, { token: args.token, leaseUntil: now + 120000 });
    else await ctx.db.insert("receiptDeliveries", { key, token: args.token, leaseUntil: now + 120000, firstAttemptAt: now, ...payload });
    return { claimed: true, key, name: existing?.name ?? payload.name, email: existing?.email ?? payload.email, eventTitle: existing?.eventTitle ?? payload.eventTitle, registrationStatus: payload.registrationStatus };
  },
});
export const recordRegistrationReceivedEmailFailure = mutation({
  args: { eventRegistrationId: v.id("eventRegistrations"), adminSecret: v.string(), key: v.string(), token: v.string(), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (!process.env.ATTENDANCE_ADMIN_SECRET || args.adminSecret !== process.env.ATTENDANCE_ADMIN_SECRET) throw new Error("Unauthorized");
    const delivery = await ctx.db.query("receiptDeliveries").withIndex("by_key", q => q.eq("key", args.key)).unique();
    if (!delivery || delivery.token !== args.token || delivery.sentAt) return;
    const row = await ctx.db.get(args.eventRegistrationId);
    if (!row || args.key !== "event-registration-received/" + row._id + "/" + (row.receiptAttempt ?? 0)) return;
    await ctx.db.patch(delivery._id, { leaseUntil: 0, error: args.error, sentAt: args.error ? undefined : Date.now() });
    await ctx.db.patch(row._id, { registrationReceivedEmailSentAt: args.error ? undefined : Date.now(), registrationReceivedEmailError: args.error });
  },
});

export const claimEventRegistrationEmail = mutation({
  args: {
    eventRegistrationId: v.id("eventRegistrations"),
    kind: eventRegistrationEmailKind,
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.eventRegistrationId);
    if (!row) throw new Error("Event registration not found");
    const [event, registration] = await Promise.all([ctx.db.get(row.eventId), ctx.db.get(row.registrationId)]);
    if (!event || !registration) throw new Error("Event registration is missing related records");
    if (event.status === "completed" || event.status === "cancelled") {
      throw new Error("Notification actions are locked for completed or cancelled events");
    }

    const existing = await ctx.db
      .query("eventRegistrationEmails")
      .withIndex("by_eventRegistrationId_and_kind", (q) =>
        q.eq("eventRegistrationId", row._id).eq("kind", args.kind)
      )
      .unique();
    if (existing?.sentAt && !args.force) {
      return { claimed: false, alreadySent: true };
    }

    const now = Date.now();
    const emailId = existing?._id ?? await ctx.db.insert("eventRegistrationEmails", {
      eventRegistrationId: row._id,
      eventId: row.eventId,
      registrationId: row.registrationId,
      kind: args.kind,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(emailId, {
      error: undefined,
      updatedAt: now,
    });

    return {
      claimed: true,
      alreadySent: false,
      emailId,
      name: registration.name,
      email: registration.email,
      eventTitle: event.title,
      eventStartsAt: event.startsAt,
      eventLocation: event.location,
      kind: args.kind,
    };
  },
});

export const recordEventRegistrationEmailSuccess = mutation({
  args: {
    emailId: v.id("eventRegistrationEmails"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.emailId, {
      sentAt: Date.now(),
      error: undefined,
      updatedAt: Date.now(),
    });
  },
});

export const recordEventRegistrationEmailFailure = mutation({
  args: {
    emailId: v.id("eventRegistrationEmails"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.emailId, {
      sentAt: undefined,
      error: args.error,
      updatedAt: Date.now(),
    });
  },
});

export const backfillApril2026 = mutation({ args: {  }, handler: async () => { throw new Error("Legacy cross-event migration is retired; no data changed"); } });

export const verifyEventBackfill = query({
  args: {},
  handler: async (ctx) => {
    const aprilEvent = await ctx.db
      .query("events")
      .withIndex("by_eventCode", (q) => q.eq("eventCode", "apr26"))
      .first();
    const manualEvent = await ctx.db
      .query("events")
      .withIndex("by_eventCode", (q) => q.eq("eventCode", "manual-admin"))
      .first();
    const interests = await ctx.db.query("interests").take(1000);
    const approvedRegistrations = await ctx.db
      .query("registrations")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .take(1000);

    let approvedMissingAprilAttendance = 0;
    if (aprilEvent) {
      for (const registration of approvedRegistrations) {
        const row = await ctx.db
          .query("eventRegistrations")
          .withIndex("by_eventId_and_registrationId", (q) =>
            q.eq("eventId", aprilEvent._id).eq("registrationId", registration._id)
          )
          .unique();
        if (!row || row.registrationStatus !== "approved" || row.attendanceStatus !== "attended") {
          approvedMissingAprilAttendance += 1;
        }
      }
    } else {
      approvedMissingAprilAttendance = approvedRegistrations.length;
    }

    return {
      aprilEventExists: Boolean(aprilEvent),
      manualEventExists: Boolean(manualEvent),
      interestsChecked: interests.length,
      interestsMissingEventId: interests.filter((interest) => !interest.eventId).length,
      approvedRegistrationsChecked: approvedRegistrations.length,
      approvedMissingAprilAttendance,
      readyToRequireInterestEventId:
        Boolean(aprilEvent) &&
        Boolean(manualEvent) &&
        interests.every((interest) => Boolean(interest.eventId)) &&
        approvedMissingAprilAttendance === 0,
    };
  },
});

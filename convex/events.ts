import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  APRIL_2026_EVENT_CODE,
  DEFAULT_EVENT_CAPACITY,
  DEFAULT_EVENT_SERIES,
  deriveEligibilityStatus,
  getEventByCode,
  getOrCreateApril2026Event,
  getOrCreateManualAdminEvent,
  interestSubmissionClosesAt,
  listEligibleInterestTargets,
} from "./eventRules";

const eventStatus = v.union(
  v.literal("draft"),
  v.literal("scheduled"),
  v.literal("completed"),
  v.literal("cancelled")
);
const eventRegistrationStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("waitlisted"),
  v.literal("rejected"),
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
type Gender = "male" | "female";

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

async function countCapacityUsed(ctx: ReadCtx, eventId: Id<"events">, gender: Gender) {
  let count = 0;
  for (const status of ["pending", "approved"] as const) {
    const rows = await ctx.db
      .query("eventRegistrations")
      .withIndex("by_eventId_and_gender_and_registrationStatus", (q) =>
        q.eq("eventId", eventId).eq("gender", gender).eq("registrationStatus", status)
      )
      .take(500);
    count += rows.length;
  }
  return count;
}

async function eventCapacityForGender(event: Doc<"events">, gender: Gender) {
  return gender === "male" ? event.maleCapacity : event.femaleCapacity;
}

async function registrationStatusForCapacity(ctx: ReadCtx, event: Doc<"events">, gender: Gender) {
  const used = await countCapacityUsed(ctx, event._id, gender);
  return used < await eventCapacityForGender(event, gender) ? "pending" as const : "waitlisted" as const;
}

async function serializeEventRegistration(ctx: ReadCtx, row: Doc<"eventRegistrations">) {
  const [event, registration] = await Promise.all([
    ctx.db.get(row.eventId),
    ctx.db.get(row.registrationId),
  ]);
  return { ...row, event, registration };
}

async function serializeEventWaitlistEntry(ctx: ReadCtx, row: Doc<"eventWaitlistEntries">) {
  const [event, registration, sourceEvent] = await Promise.all([
    ctx.db.get(row.eventId),
    ctx.db.get(row.registrationId),
    row.sourceEventId ? ctx.db.get(row.sourceEventId) : Promise.resolve(null),
  ]);
  return { ...row, event, registration, sourceEvent };
}

async function getActiveEventWaitlistEntries(ctx: ReadCtx, eventId: Id<"events">) {
  return await ctx.db
    .query("eventWaitlistEntries")
    .withIndex("by_eventId_and_status", (q) => q.eq("eventId", eventId).eq("status", "active"))
    .take(500);
}

async function carryOverWaitlist(ctx: MutationCtx, event: Doc<"events">, overrideCapacity = false) {
  const aprilEvent = await getEventByCode(ctx, APRIL_2026_EVENT_CODE);
  if (aprilEvent && aprilEvent._id !== event._id) {
    const aprilWaitlist = await getActiveEventWaitlistEntries(ctx, aprilEvent._id);
    if (aprilWaitlist.length > 0) {
      const result = await carryOverRegistrationsFromEvent(ctx, {
        sourceEventId: aprilEvent._id,
        targetEvent: event,
        sourceStatuses: ["waitlisted"],
        overrideCapacity,
      });
      return { carried: result.copied, previousEventId: aprilEvent._id };
    }
  }

  const previousEvents = await ctx.db
    .query("events")
    .withIndex("by_series_and_startsAt", (q) => q.eq("series", event.series))
    .take(100);
  const previousEvent = previousEvents
    .filter((candidate) => candidate._id !== event._id && candidate.startsAt < event.startsAt)
    .sort((a, b) => b.startsAt - a.startsAt)[0];
  if (!previousEvent) return { carried: 0, previousEventId: null };

  const waitlisted = await ctx.db
    .query("eventRegistrations")
    .withIndex("by_eventId_and_registrationStatus", (q) =>
      q.eq("eventId", previousEvent._id).eq("registrationStatus", "waitlisted")
    )
    .take(500);
  let carried = 0;

  for (const row of waitlisted.sort((a, b) => a.createdAt - b.createdAt || a._creationTime - b._creationTime)) {
    const registration = await ctx.db.get(row.registrationId);
    if (!registration) continue;
    const existing = await ctx.db
      .query("eventRegistrations")
      .withIndex("by_eventId_and_registrationId", (q) =>
        q.eq("eventId", event._id).eq("registrationId", registration._id)
      )
      .unique();
    if (existing) continue;

    const status = overrideCapacity
      ? "pending" as const
      : await registrationStatusForCapacity(ctx, event, registration.gender);
    if (status !== "pending") continue;

    const now = Date.now();
    await ctx.db.insert("eventRegistrations", {
      eventId: event._id,
      registrationId: registration._id,
      gender: registration.gender,
      registrationStatus: "pending",
      attendanceStatus: "not_checked_in",
      eligibilityStatus: deriveEligibilityStatus(registration),
      waitlistCarryoverFromEventId: previousEvent._id,
      createdAt: now,
      updatedAt: now,
    });
    carried += 1;
  }

  return { carried, previousEventId: previousEvent._id };
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
  let skippedCapacity = 0;
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

    const status = args.overrideCapacity
      ? "pending" as const
      : await registrationStatusForCapacity(ctx, args.targetEvent, registration.gender);
    if (status !== "pending") {
      skippedCapacity += 1;
      return;
    }

    const now = Date.now();
    await ctx.db.insert("eventRegistrations", {
      eventId: args.targetEvent._id,
      registrationId: registration._id,
      gender: registration.gender,
      registrationStatus: "pending",
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
      const waitlistRows = await getActiveEventWaitlistEntries(ctx, sourceEvent._id);
      for (const row of waitlistRows.sort((a, b) => a.createdAt - b.createdAt || a._creationTime - b._creationTime)) {
        await copyRegistration(row.registrationId, sourceEvent._id);
      }
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
        const registrations = await ctx.db
          .query("eventRegistrations")
          .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
          .take(500);
        const activeWaitlist = await getActiveEventWaitlistEntries(ctx, event._id);
        return {
          ...event,
          interestSubmissionClosesAt: interestSubmissionClosesAt(event),
          counts: {
            malePending: registrations.filter((row) => row.gender === "male" && row.registrationStatus === "pending").length,
            maleApproved: registrations.filter((row) => row.gender === "male" && row.registrationStatus === "approved").length,
            maleWaitlisted: registrations.filter((row) => row.gender === "male" && row.registrationStatus === "waitlisted").length +
              activeWaitlist.filter((row) => row.gender === "male").length,
            femalePending: registrations.filter((row) => row.gender === "female" && row.registrationStatus === "pending").length,
            femaleApproved: registrations.filter((row) => row.gender === "female" && row.registrationStatus === "approved").length,
            femaleWaitlisted: registrations.filter((row) => row.gender === "female" && row.registrationStatus === "waitlisted").length +
              activeWaitlist.filter((row) => row.gender === "female").length,
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
        const registrations = await ctx.db
          .query("eventRegistrations")
          .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
          .take(500);
        const maleUsed = registrations.filter(
          (row) => row.gender === "male" && (row.registrationStatus === "pending" || row.registrationStatus === "approved")
        ).length;
        const femaleUsed = registrations.filter(
          (row) => row.gender === "female" && (row.registrationStatus === "pending" || row.registrationStatus === "approved")
        ).length;

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

export const getWaitlistedRegistrationIds = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("eventRegistrations")
      .withIndex("by_registrationStatus", (q) => q.eq("registrationStatus", "waitlisted"))
      .take(1000);

    const activeRegistrationIds = new Set<Id<"registrations">>();
    const waitlistEntries = await ctx.db
      .query("eventWaitlistEntries")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(1000);
    for (const row of waitlistEntries) {
      activeRegistrationIds.add(row.registrationId);
    }

    for (const row of rows) {
      const event = await ctx.db.get(row.eventId);
      if (event && event.status !== "completed" && event.status !== "cancelled") {
        activeRegistrationIds.add(row.registrationId);
      }
    }

    return [...activeRegistrationIds];
  },
});

export const getDetail = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    const rows = await ctx.db
      .query("eventRegistrations")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500);
    const waitlistRows = await getActiveEventWaitlistEntries(ctx, args.eventId);
    const linkedInterest = await ctx.db
      .query("interests")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .first();
    const linkedEmail = await ctx.db
      .query("eventRegistrationEmails")
      .withIndex("by_eventId_and_kind", (q) => q.eq("eventId", args.eventId))
      .first();
    const deleteBlockedReason = rows.length
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
    const eligibleTargetIds = await listEligibleInterestTargets(ctx, registration);

    return {
      upcoming: events
        .filter((event) => event.status === "scheduled")
        .map((event) => ({
          ...event,
          registration: byEventId.get(event._id) ?? null,
        })),
      history: await Promise.all(eventRegistrations.map((row) => serializeEventRegistration(ctx, row))),
      eligibleInterestTargetIds: [...eligibleTargetIds],
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
    const carryover = args.carryOverWaitlist ? await carryOverWaitlist(ctx, event) : null;
    return { eventId, carryover };
  },
});

export const update = mutation({
  args: {
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
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    const startsAt = args.startsAt ?? event.startsAt;
    const endsAt = args.endsAt ?? event.endsAt;
    assertValidEventTimes(startsAt, endsAt);
    if (args.maleCapacity !== undefined) assertCapacity(args.maleCapacity, "Male");
    if (args.femaleCapacity !== undefined) assertCapacity(args.femaleCapacity, "Female");

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
    return args.eventId;
  },
});

export const deleteEvent = mutation({
  args: {
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");

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
    sourceEventId: v.id("events"),
    targetEventId: v.id("events"),
    sourceStatuses: v.array(carryoverSourceStatus),
    overrideCapacity: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
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

export const moveEventRegistrationsToAprilWaitlist = mutation({
  args: {
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    if (event.eventCode === APRIL_2026_EVENT_CODE) {
      throw new Error("Apr26 is already the waitlist event");
    }

    const aprilEvent = await getOrCreateApril2026Event(ctx);
    const rows = await ctx.db
      .query("eventRegistrations")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500);

    const now = Date.now();
    let moved = 0;
    let alreadyWaitlisted = 0;
    let removedFromSource = 0;
    let skippedMissingRegistration = 0;
    let deletedEmailRecords = 0;

    for (const row of rows) {
      const registration = await ctx.db.get(row.registrationId);
      if (!registration) {
        skippedMissingRegistration += 1;
        continue;
      }

      const existingWaitlistEntry = await ctx.db
        .query("eventWaitlistEntries")
        .withIndex("by_eventId_and_registrationId", (q) =>
          q.eq("eventId", aprilEvent._id).eq("registrationId", registration._id)
        )
        .unique();

      if (existingWaitlistEntry) {
        if (existingWaitlistEntry.status === "active") {
          alreadyWaitlisted += 1;
        } else {
          await ctx.db.patch(existingWaitlistEntry._id, {
            status: "active",
            gender: registration.gender,
            sourceEventId: event._id,
            sourceEventRegistrationId: row._id,
            removedAt: undefined,
            updatedAt: now,
          });
          moved += 1;
        }
      } else {
        await ctx.db.insert("eventWaitlistEntries", {
          eventId: aprilEvent._id,
          registrationId: registration._id,
          gender: registration.gender,
          status: "active",
          sourceEventId: event._id,
          sourceEventRegistrationId: row._id,
          createdAt: now,
          updatedAt: now,
        });
        moved += 1;
      }

      const linkedEmails = await ctx.db
        .query("eventRegistrationEmails")
        .withIndex("by_eventRegistrationId", (q) => q.eq("eventRegistrationId", row._id))
        .take(20);
      for (const linkedEmail of linkedEmails) {
        await ctx.db.delete(linkedEmail._id);
        deletedEmailRecords += 1;
      }

      await ctx.db.delete(row._id);
      removedFromSource += 1;
    }

    return {
      eventId: args.eventId,
      aprilEventId: aprilEvent._id,
      moved,
      alreadyWaitlisted,
      removedFromSource,
      skippedMissingRegistration,
      deletedEmailRecords,
    };
  },
});

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
    if (existing && !["cancelled", "rejected"].includes(existing.registrationStatus)) {
      throw new Error("You are already registered for this event");
    }

    const registrationStatus = await registrationStatusForCapacity(ctx, event, registration.gender);
    const payload = {
      eventId: event._id,
      registrationId: registration._id,
      gender: registration.gender,
      registrationStatus,
      attendanceStatus: "not_checked_in" as const,
      eligibilityStatus: deriveEligibilityStatus(registration),
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
    eventRegistrationId: v.id("eventRegistrations"),
    registrationStatus: eventRegistrationStatus,
    overrideCapacity: v.optional(v.boolean()),
    adminNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.eventRegistrationId);
    if (!row) throw new Error("Event registration not found");
    const event = await ctx.db.get(row.eventId);
    if (!event) throw new Error("Event not found");
    const now = Date.now();

    if (args.registrationStatus === "pending" || args.registrationStatus === "approved") {
      const used = await countCapacityUsed(ctx, event._id, row.gender);
      const alreadyCounts = row.registrationStatus === "pending" || row.registrationStatus === "approved";
      const capacity = await eventCapacityForGender(event, row.gender);
      if (!args.overrideCapacity && !alreadyCounts && used >= capacity) {
        throw new Error("Event capacity is full for this gender");
      }
    }

    await ctx.db.patch(row._id, {
      registrationStatus: args.registrationStatus,
      approvedAt: args.registrationStatus === "approved" ? row.approvedAt ?? now : row.approvedAt,
      rejectedAt: args.registrationStatus === "rejected" ? row.rejectedAt ?? now : row.rejectedAt,
      cancelledAt: args.registrationStatus === "cancelled" ? row.cancelledAt ?? now : row.cancelledAt,
      adminNotes: args.adminNotes?.trim() || row.adminNotes,
      updatedAt: now,
    });
    return row._id;
  },
});

export const updateAttendanceStatus = mutation({
  args: {
    eventRegistrationId: v.id("eventRegistrations"),
    attendanceStatus: eventAttendanceStatus,
  },
  handler: async (ctx, args) => {
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

export const requestConfirmation = mutation({
  args: {
    eventRegistrationId: v.id("eventRegistrations"),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.eventRegistrationId);
    if (!row) throw new Error("Event registration not found");
    const event = await ctx.db.get(row.eventId);
    if (!event) throw new Error("Event not found");
    if (event.status === "completed" || event.status === "cancelled") {
      throw new Error("Notification actions are locked for completed or cancelled events");
    }
    const now = Date.now();
    await ctx.db.patch(row._id, {
      confirmationRequestedAt: now,
      confirmationExpiresAt: now + 48 * 60 * 60 * 1000,
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
    await ctx.db.patch(row._id, {
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
        row.registrationStatus === "pending" &&
        row.confirmationExpiresAt &&
        row.confirmationExpiresAt < now &&
        !row.confirmedAt
      ) {
        await ctx.db.patch(row._id, {
          registrationStatus: "cancelled",
          cancelledAt: now,
          updatedAt: now,
        });
        cancelled += 1;
      }
    }
    return { cancelled };
  },
});

export const claimRegistrationReceivedEmail = mutation({
  args: {
    eventRegistrationId: v.id("eventRegistrations"),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.eventRegistrationId);
    if (!row) throw new Error("Event registration not found");
    if (row.registrationReceivedEmailSentAt) {
      return { claimed: false, alreadySent: true };
    }
    const [event, registration] = await Promise.all([ctx.db.get(row.eventId), ctx.db.get(row.registrationId)]);
    if (!event || !registration) throw new Error("Event registration is missing related records");
    await ctx.db.patch(row._id, {
      registrationReceivedEmailSentAt: Date.now(),
      registrationReceivedEmailError: undefined,
      updatedAt: Date.now(),
    });
    return {
      claimed: true,
      alreadySent: false,
      eventRegistrationId: row._id,
      eventTitle: event.title,
      registrationStatus: row.registrationStatus,
      name: registration.name,
      email: registration.email,
    };
  },
});

export const recordRegistrationReceivedEmailFailure = mutation({
  args: {
    eventRegistrationId: v.id("eventRegistrations"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.eventRegistrationId, {
      registrationReceivedEmailSentAt: undefined,
      registrationReceivedEmailError: args.error,
      updatedAt: Date.now(),
    });
  },
});

export const claimEventRegistrationEmail = mutation({
  args: {
    eventRegistrationId: v.id("eventRegistrations"),
    kind: eventRegistrationEmailKind,
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
    if (existing?.sentAt) {
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
      sentAt: now,
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

export const backfillApril2026 = mutation({
  args: {},
  handler: async (ctx) => {
    const aprilEvent = await getOrCreateApril2026Event(ctx);
    await getOrCreateManualAdminEvent(ctx);
    const registrations = await ctx.db
      .query("registrations")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .take(1000);
    let attendanceRows = 0;
    for (const registration of registrations) {
      const existing = await ctx.db
        .query("eventRegistrations")
        .withIndex("by_eventId_and_registrationId", (q) =>
          q.eq("eventId", aprilEvent._id).eq("registrationId", registration._id)
        )
        .unique();
      if (!existing) {
        await ctx.db.insert("eventRegistrations", {
          eventId: aprilEvent._id,
          registrationId: registration._id,
          gender: registration.gender,
          registrationStatus: "approved",
          attendanceStatus: "attended",
          eligibilityStatus: deriveEligibilityStatus(registration),
          approvedAt: aprilEvent.endsAt,
          checkedInAt: aprilEvent.endsAt,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        attendanceRows += 1;
      }
    }

    const interests = await ctx.db.query("interests").take(1000);
    let patchedInterests = 0;
    for (const interest of interests) {
      if (!interest.eventId) {
        await ctx.db.patch(interest._id, {
          eventId: aprilEvent._id,
          updatedAt: Date.now(),
        });
        patchedInterests += 1;
      }
    }

    return { eventId: aprilEvent._id, attendanceRows, patchedInterests };
  },
});

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

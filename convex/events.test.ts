import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

type Gender = Doc<"registrations">["gender"];
type EventRegistrationStatus = Doc<"eventRegistrations">["registrationStatus"];

async function insertRegistration(
  ctx: Parameters<Parameters<ReturnType<typeof convexTest>["run"]>[0]>[0],
  name: string,
  gender: Gender
) {
  const now = Date.now();
  return await ctx.db.insert("registrations", {
    name,
    applicantNumber: Math.floor(Math.random() * 100000),
    age: 30,
    gender,
    maritalStatus: "single",
    education: "College",
    job: "Engineer",
    email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
    phone: "555-0100",
    paymentStatus: "paid",
    status: "approved",
    searchStatus: "active",
    createdAt: now,
    profileCompletionStatus: "completed",
    ethnicity: "Arab",
    prayerCommitment: "always_five",
    hijabResponse: gender === "female" ? "yes" : "open",
    spouseRequirement1: "Requirement one",
    spouseRequirement2: "Requirement two",
    spouseRequirement3: "Requirement three",
    shareableBio: "Bio text",
    photoSharingPermission: "ask_me_first",
  });
}

async function insertEvent(
  ctx: Parameters<Parameters<ReturnType<typeof convexTest>["run"]>[0]>[0],
  title: string,
  eventCode: string,
  startsAt: number,
  capacity = 60
) {
  const now = Date.now();
  return await ctx.db.insert("events", {
    title,
    eventCode,
    eventMonth: "2026-05",
    series: "1plus1_match",
    location: "ROIC",
    startsAt,
    endsAt: startsAt + 2 * 60 * 60 * 1000,
    status: "scheduled",
    maleCapacity: capacity,
    femaleCapacity: capacity,
    createdAt: now,
    updatedAt: now,
  });
}

async function insertEventRegistration(
  ctx: Parameters<Parameters<ReturnType<typeof convexTest>["run"]>[0]>[0],
  eventId: Id<"events">,
  registrationId: Id<"registrations">,
  gender: Gender,
  registrationStatus: EventRegistrationStatus
) {
  const now = Date.now();
  return await ctx.db.insert("eventRegistrations", {
    eventId,
    registrationId,
    gender,
    registrationStatus,
    attendanceStatus: "not_checked_in",
    eligibilityStatus: "approved_member",
    createdAt: now,
    updatedAt: now,
  });
}

describe("events", () => {
  test("deletes an event that has no signups", async () => {
    const t = convexTest(schema, modules);
    const eventId = await t.run(async (ctx) => {
      return await insertEvent(ctx, "Empty Event", "empty", Date.now() + 7 * 24 * 60 * 60 * 1000);
    });

    await expect(t.mutation(api.events.deleteEvent, { eventId })).resolves.toBe(eventId);

    const deleted = await t.run(async (ctx) => await ctx.db.get(eventId));
    expect(deleted).toBeNull();
  });

  test("does not delete an event after someone has signed up", async () => {
    const t = convexTest(schema, modules);
    const { eventId } = await t.run(async (ctx) => {
      const eventId = await insertEvent(ctx, "Event With Signup", "with-signup", Date.now() + 7 * 24 * 60 * 60 * 1000);
      const registrationId = await insertRegistration(ctx, "Signed Up Male", "male");
      await insertEventRegistration(ctx, eventId, registrationId, "male", "pending");
      return { eventId };
    });

    await expect(t.mutation(api.events.deleteEvent, { eventId })).rejects.toThrow(
      "Cannot delete an event after someone has signed up."
    );

    const existing = await t.run(async (ctx) => await ctx.db.get(eventId));
    expect(existing).not.toBeNull();
  });

  test("orders same-start public events by newest event first", async () => {
    const t = convexTest(schema, modules);
    const startsAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

    await t.run(async (ctx) => {
      await insertEvent(ctx, "Older duplicate", "older", startsAt);
      await insertEvent(ctx, "Newer duplicate", "newer", startsAt);
    });

    const active = await t.query(api.events.getPublicActive, {});

    expect(active.map((event) => event.eventCode).slice(0, 2)).toEqual(["newer", "older"]);
  });

  test("backfills selected source event registrations into a target event as pending", async () => {
    const t = convexTest(schema, modules);
    const startsAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const { sourceEventId, targetEventId, existingMaleId, sourceMaleId, sourceFemaleId } = await t.run(async (ctx) => {
      const sourceEventId = await insertEvent(ctx, "Source", "source", startsAt, 60);
      const targetEventId = await insertEvent(ctx, "Target", "target", startsAt, 1);
      const existingMaleId = await insertRegistration(ctx, "Existing Male", "male");
      const sourceMaleId = await insertRegistration(ctx, "Source Male", "male");
      const sourceFemaleId = await insertRegistration(ctx, "Source Female", "female");

      await insertEventRegistration(ctx, targetEventId, existingMaleId, "male", "pending");
      await insertEventRegistration(ctx, sourceEventId, sourceMaleId, "male", "pending");
      await insertEventRegistration(ctx, sourceEventId, sourceFemaleId, "female", "waitlisted");

      return { sourceEventId, targetEventId, existingMaleId, sourceMaleId, sourceFemaleId };
    });

    const result = await t.mutation(api.events.carryOverRegistrations, {
      sourceEventId,
      targetEventId,
      sourceStatuses: ["pending", "waitlisted"],
    });

    expect(result).toMatchObject({
      copied: 1,
      alreadyExists: 0,
      skippedCapacity: 1,
    });

    const targetRows = await t.run(async (ctx) => {
      return await ctx.db
        .query("eventRegistrations")
        .withIndex("by_eventId", (q) => q.eq("eventId", targetEventId))
        .take(10);
    });

    expect(targetRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          registrationId: existingMaleId,
          registrationStatus: "pending",
        }),
        expect.objectContaining({
          registrationId: sourceFemaleId,
          registrationStatus: "pending",
          waitlistCarryoverFromEventId: sourceEventId,
        }),
      ])
    );
    expect(targetRows.some((row) => row.registrationId === sourceMaleId)).toBe(false);
  });

  test("moves event applicants to the Apr26 waitlist without changing Apr26 attendance", async () => {
    const t = convexTest(schema, modules);
    const startsAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const { aprilEventId, mayEventId, targetEventId, attendedMaleId, newFemaleId } = await t.run(async (ctx) => {
      const aprilEventId = await insertEvent(ctx, "1Plus1 Match Event - Apr26", "apr26", startsAt - 30 * 24 * 60 * 60 * 1000, 60);
      await ctx.db.patch(aprilEventId, { eventMonth: "2026-04", status: "completed" });
      const mayEventId = await insertEvent(ctx, "1 Plus 1 Match Session 2", "may17", startsAt, 60);
      const targetEventId = await insertEvent(ctx, "New Target", "new-target", startsAt + 30 * 24 * 60 * 60 * 1000, 60);
      const attendedMaleId = await insertRegistration(ctx, "Attended Male", "male");
      const newFemaleId = await insertRegistration(ctx, "New Female", "female");

      const aprilAttendanceId = await insertEventRegistration(ctx, aprilEventId, attendedMaleId, "male", "approved");
      await ctx.db.patch(aprilAttendanceId, { attendanceStatus: "attended" });
      await insertEventRegistration(ctx, mayEventId, attendedMaleId, "male", "pending");
      await insertEventRegistration(ctx, mayEventId, newFemaleId, "female", "approved");

      return { aprilEventId, mayEventId, targetEventId, attendedMaleId, newFemaleId };
    });

    await expect(t.mutation(api.events.moveEventRegistrationsToAprilWaitlist, { eventId: mayEventId })).resolves.toMatchObject({
      eventId: mayEventId,
      aprilEventId,
      moved: 2,
      removedFromSource: 2,
    });

    const afterMove = await t.run(async (ctx) => {
      const mayRows = await ctx.db
        .query("eventRegistrations")
        .withIndex("by_eventId", (q) => q.eq("eventId", mayEventId))
        .take(10);
      const waitlistRows = await ctx.db
        .query("eventWaitlistEntries")
        .withIndex("by_eventId_and_status", (q) => q.eq("eventId", aprilEventId).eq("status", "active"))
        .take(10);
      const aprilAttendance = await ctx.db
        .query("eventRegistrations")
        .withIndex("by_eventId_and_registrationId", (q) =>
          q.eq("eventId", aprilEventId).eq("registrationId", attendedMaleId)
        )
        .unique();
      return { mayRows, waitlistRows, aprilAttendance };
    });

    expect(afterMove.mayRows).toHaveLength(0);
    expect(afterMove.waitlistRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ registrationId: attendedMaleId, status: "active" }),
        expect.objectContaining({ registrationId: newFemaleId, status: "active" }),
      ])
    );
    expect(afterMove.aprilAttendance).toMatchObject({
      registrationId: attendedMaleId,
      registrationStatus: "approved",
      attendanceStatus: "attended",
    });

    await expect(t.mutation(api.events.carryOverRegistrations, {
      sourceEventId: aprilEventId,
      targetEventId,
      sourceStatuses: ["waitlisted"],
    })).resolves.toMatchObject({
      copied: 2,
      alreadyExists: 0,
      skippedCapacity: 0,
    });

    const targetRows = await t.run(async (ctx) => {
      return await ctx.db
        .query("eventRegistrations")
        .withIndex("by_eventId", (q) => q.eq("eventId", targetEventId))
        .take(10);
    });

    expect(targetRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          registrationId: attendedMaleId,
          registrationStatus: "pending",
          waitlistCarryoverFromEventId: aprilEventId,
        }),
        expect.objectContaining({
          registrationId: newFemaleId,
          registrationStatus: "pending",
          waitlistCarryoverFromEventId: aprilEventId,
        }),
      ])
    );
  });
});

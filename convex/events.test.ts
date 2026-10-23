import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

type Gender = Doc<"registrations">["gender"];
type EventRegistrationStatus = Doc<"eventRegistrations">["registrationStatus"];
type EventConfirmationStatus = NonNullable<Doc<"eventRegistrations">["confirmationStatus"]>;

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
  registrationStatus: EventRegistrationStatus,
  confirmationStatus: EventConfirmationStatus = "not_confirmed"
) {
  const now = Date.now();
  return await ctx.db.insert("eventRegistrations", {
    eventId,
    registrationId,
    gender,
    registrationStatus,
    confirmationStatus,
    attendanceStatus: "not_checked_in",
    eligibilityStatus: "approved_member",
    createdAt: now,
    updatedAt: now,
  });
}

async function createSession(t: ReturnType<typeof convexTest>, registrationId: Id<"registrations">) {
  const sessionHash = `session-${registrationId}`;
  await t.run(async (ctx) => {
    await ctx.db.insert("applicantSessions", {
      registrationId,
      sessionHash,
      expiresAt: Date.now() + 60 * 60 * 1000,
      createdAt: Date.now(),
    });
  });
  return sessionHash;
}

describe("events", () => {
  beforeEach(() => { vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "test-admin"); });
  test("deletes an event that has no signups", async () => {
    const t = convexTest(schema, modules);
    const eventId = await t.run(async (ctx) => {
      return await insertEvent(ctx, "Empty Event", "empty", Date.now() + 7 * 24 * 60 * 60 * 1000);
    });

    await expect(t.mutation(api.events.deleteEvent, { adminSecret: "test-admin", eventId })).resolves.toBe(eventId);

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

    await expect(t.mutation(api.events.deleteEvent, { adminSecret: "test-admin", eventId })).rejects.toThrow(
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

    expect((active as Array<{ eventCode: string }>).map((event) => event.eventCode).slice(0, 2)).toEqual(["newer", "older"]);
  });

  test("backfills selected source event registrations into a target event as Pending or capacity-waitlisted, never approved", async () => {
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

    const result = await t.mutation(api.events.carryOverRegistrations, { adminSecret: "test-admin",
      sourceEventId,
      targetEventId,
      sourceStatuses: ["pending", "waitlisted"],
    });

    expect(result).toMatchObject({
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
          registrationId: existingMaleId,
          registrationStatus: "pending",
        }),
        expect.objectContaining({
          registrationId: sourceFemaleId,
          registrationStatus: "pending",
          confirmationStatus: "not_confirmed",
          waitlistCarryoverFromEventId: sourceEventId,
        }),
        expect.objectContaining({
          registrationId: sourceMaleId,
          registrationStatus: "waitlisted",
          confirmationStatus: "not_confirmed",
          waitlistCarryoverFromEventId: sourceEventId,
        }),
      ])
    );
  });

  test("retires cross-event migration and profile-derived historical approval", async () => {
    const t = convexTest(schema, modules);
    const eventId = await t.run(ctx => insertEvent(ctx, "Legacy", "legacy", Date.now()));
    await expect(t.mutation(api.events.moveEventRegistrationsToAprilWaitlist, {eventId})).rejects.toThrow("retired");
    await expect(t.mutation(api.events.backfillApril2026, {})).rejects.toThrow("retired");
  });

  test("lets applicants confirm participation without an admin request", async () => {
    const t = convexTest(schema, modules);
    const startsAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const { eventRegistrationId, registrationId } = await t.run(async (ctx) => {
      const eventId = await insertEvent(ctx, "Confirmation Event", "confirm", startsAt, 60);
      const registrationId = await insertRegistration(ctx, "Confirming Applicant", "female");
      const eventRegistrationId = await insertEventRegistration(ctx, eventId, registrationId, "female", "pending");
      return { eventRegistrationId, registrationId };
    });
    const sessionHash = await createSession(t, registrationId);

    await expect(t.mutation(api.events.confirmParticipation, { sessionHash, eventRegistrationId })).resolves.toBe(
      eventRegistrationId
    );

    const row = await t.run(async (ctx) => await ctx.db.get(eventRegistrationId));
    expect(row?.confirmationStatus).toBe("confirmed");
    expect(row?.confirmedAt).toEqual(expect.any(Number));
  });

  test("lets approved applicants confirm participation", async () => {
    const t = convexTest(schema, modules);
    const startsAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const { eventRegistrationId, registrationId } = await t.run(async (ctx) => {
      const eventId = await insertEvent(ctx, "Approved Confirmation Event", "approved-confirm", startsAt, 60);
      const registrationId = await insertRegistration(ctx, "Approved Applicant", "male");
      const eventRegistrationId = await insertEventRegistration(ctx, eventId, registrationId, "male", "approved");
      return { eventRegistrationId, registrationId };
    });
    const sessionHash = await createSession(t, registrationId);

    await expect(t.mutation(api.events.confirmParticipation, { sessionHash, eventRegistrationId })).resolves.toBe(
      eventRegistrationId
    );

    const row = await t.run(async (ctx) => await ctx.db.get(eventRegistrationId));
    expect(row?.confirmationStatus).toBe("confirmed");
    expect(row?.confirmedAt).toEqual(expect.any(Number));
  });

  test("lets withdrawn applicants confirm again during a fresh confirmation window", async () => {
    const t = convexTest(schema, modules);
    const startsAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const { eventRegistrationId, registrationId } = await t.run(async (ctx) => {
      const eventId = await insertEvent(ctx, "Withdrawn Reconfirm Event", "withdrawn-reconfirm", startsAt, 60);
      const registrationId = await insertRegistration(ctx, "Withdrawn Applicant", "female");
      const eventRegistrationId = await insertEventRegistration(ctx, eventId, registrationId, "female", "withdrawn", "cancelled");
      return { eventRegistrationId, registrationId };
    });
    const sessionHash = await createSession(t, registrationId);

    await t.mutation(api.events.requestConfirmation, { adminSecret: "test-admin", eventRegistrationId });
    await expect(t.mutation(api.events.confirmParticipation, { sessionHash, eventRegistrationId })).resolves.toBe(
      eventRegistrationId
    );

    const row = await t.run(async (ctx) => await ctx.db.get(eventRegistrationId));
    expect(row).toMatchObject({
      registrationStatus: "pending",
      confirmationStatus: "confirmed",
      confirmedAt: expect.any(Number),
    });
  });

  test("lets admins mark an event registration confirmed", async () => {
    const t = convexTest(schema, modules);
    const startsAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const eventRegistrationId = await t.run(async (ctx) => {
      const eventId = await insertEvent(ctx, "Admin Confirm Event", "admin-confirm", startsAt, 60);
      const registrationId = await insertRegistration(ctx, "Admin Confirmed Applicant", "female");
      return await insertEventRegistration(ctx, eventId, registrationId, "female", "pending");
    });

    await expect(
      t.mutation(api.events.updateRegistrationConfirmation, { adminSecret: "test-admin", eventRegistrationId, confirmationStatus: "confirmed" })
    ).resolves.toBe(eventRegistrationId);

    const row = await t.run(async (ctx) => await ctx.db.get(eventRegistrationId));
    expect(row).toMatchObject({
      registrationStatus: "pending",
      confirmationStatus: "confirmed",
      confirmedAt: expect.any(Number),
    });
  });

  test("does not mark event registration email sent until delivery succeeds", async () => {
    const t = convexTest(schema, modules);
    const startsAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const eventRegistrationId = await t.run(async (ctx) => {
      const eventId = await insertEvent(ctx, "Email Claim Event", "email-claim", startsAt, 60);
      const registrationId = await insertRegistration(ctx, "Email Claim Applicant", "female");
      return await insertEventRegistration(ctx, eventId, registrationId, "female", "approved");
    });

    const claim = await t.mutation(api.events.claimEventRegistrationEmail, {
      eventRegistrationId,
      kind: "confirmation_request",
    });

    expect(claim).toMatchObject({ claimed: true, alreadySent: false });

    const beforeSuccess = await t.run(async (ctx) => {
      return await ctx.db
        .query("eventRegistrationEmails")
        .withIndex("by_eventRegistrationId_and_kind", (q) =>
          q.eq("eventRegistrationId", eventRegistrationId).eq("kind", "confirmation_request")
        )
        .unique();
    });
    expect(beforeSuccess?.sentAt).toBeUndefined();

    await t.mutation(api.events.recordEventRegistrationEmailSuccess, {
      emailId: claim.emailId as Id<"eventRegistrationEmails">,
    });

    const afterSuccess = await t.run(async (ctx) => await ctx.db.get(claim.emailId as Id<"eventRegistrationEmails">));
    expect(afterSuccess?.sentAt).toEqual(expect.any(Number));
  });

  test("blocks applicant confirmation after a requested confirmation window expires", async () => {
    const t = convexTest(schema, modules);
    const startsAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const { eventRegistrationId, registrationId } = await t.run(async (ctx) => {
      const eventId = await insertEvent(ctx, "Expired Confirmation Event", "expired-confirm", startsAt, 60);
      const registrationId = await insertRegistration(ctx, "Expired Applicant", "female");
      const eventRegistrationId = await insertEventRegistration(ctx, eventId, registrationId, "female", "pending");
      await ctx.db.patch(eventRegistrationId, {
        confirmationRequestedAt: Date.now() - 72 * 60 * 60 * 1000,
        confirmationExpiresAt: Date.now() - 24 * 60 * 60 * 1000,
      });
      return { eventRegistrationId, registrationId };
    });
    const sessionHash = await createSession(t, registrationId);

    await expect(
      t.mutation(api.events.confirmParticipation, { sessionHash, eventRegistrationId })
    ).rejects.toThrow("Confirmation window has expired");
  });
});

// Synthetic Oct 20 fixture only: no live applicants, network or email.
describe("Real Talk Oct 20 2026 event-only queues", () => {
  beforeEach(() => { vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "test-admin"); });
  async function fixture() {
    const t = convexTest(schema, modules);
    const data = await t.run(async ctx => {
      const eventId = await insertEvent(ctx, "Real Talk Oct 20 2026", "real-talk-oct20", Date.parse("2026-10-20T18:00:00-05:00"), 1);
      await ctx.db.patch(eventId, { series: "real_talk" });
      const otherEventId = await insertEvent(ctx, "Other event", "other", Date.now(), 1);
      const ids = [];
      for (let i = 0; i < 5; i++) ids.push(await insertRegistration(ctx, "Synthetic " + i, i === 4 ? "female" : "male"));
      await ctx.db.patch(ids[2], { status: "pending" });
      return {eventId, otherEventId, ids};
    });
    const sessions = await Promise.all(data.ids.map(id => createSession(t, id)));
    return {t, ...data, sessions};
  }
  test("fill -> overflow -> removal -> FIFO Pending -> explicit Approved, independent profile approval", async () => {
    const {t, eventId, otherEventId, ids, sessions} = await fixture();
    const register = (i: number, event = eventId) => t.mutation(api.events.registerForEvent, {eventId: event, sessionHash: sessions[i]});
    const first = await register(0);
    const second = await register(1);
    const third = await register(2);
    const female = await register(4);
    const other = await register(3, otherEventId);
    expect(first.registrationStatus).toBe("pending");
    expect(second.registrationStatus).toBe("waitlisted");
    expect(third.registrationStatus).toBe("waitlisted");
    expect(female.registrationStatus).toBe("pending");
    expect((await register(1)).eventRegistrationId).toBe(second.eventRegistrationId);
    await expect(t.mutation(api.events.updateRegistrationStatus, {adminSecret:"bad", eventRegistrationId:first.eventRegistrationId, registrationStatus:"approved"})).rejects.toThrow("Unauthorized");
    await expect(t.mutation(api.events.updateRegistrationStatus, {adminSecret:"test-admin", eventRegistrationId:second.eventRegistrationId, registrationStatus:"approved"})).rejects.toThrow("Only Pending");
    const change = (id: Id<"eventRegistrations">, status: "approved" | "withdrawn") => t.mutation(api.events.updateRegistrationStatus,{adminSecret:"test-admin",eventRegistrationId:id,registrationStatus:status});
    await change(first.eventRegistrationId,"approved");
    await change(first.eventRegistrationId,"withdrawn");
    await change(first.eventRegistrationId,"withdrawn");
    expect(await t.run(ctx => ctx.db.get(second.eventRegistrationId))).toMatchObject({registrationStatus:"pending"});
    expect(await t.run(ctx => ctx.db.get(third.eventRegistrationId))).toMatchObject({registrationStatus:"waitlisted"});
    await change(second.eventRegistrationId,"approved");
    await change(second.eventRegistrationId,"withdrawn");
    expect(await t.run(ctx => ctx.db.get(third.eventRegistrationId))).toMatchObject({registrationStatus:"pending"});
    await change(third.eventRegistrationId,"approved");
    expect(await t.run(ctx => ctx.db.get(ids[2]))).toMatchObject({status:"pending"});
    expect(await t.run(ctx => ctx.db.get(ids[0]))).toMatchObject({status:"approved"});
    expect(await t.run(ctx => ctx.db.get(female.eventRegistrationId))).toMatchObject({registrationStatus:"pending"});
    expect(await t.run(ctx => ctx.db.get(other.eventRegistrationId))).toMatchObject({registrationStatus:"pending"});
  });
  test("admin add, cancelled confirmation, capacity growth/shrink and legacy profile preservation", async () => {
    const {t,eventId,ids} = await fixture();

    const add = (i: number) => t.mutation(api.events.addRegistration,{adminSecret:"test-admin",eventId,registrationId:ids[i]});
    const first = await add(0); const second = await add(1); const third = await add(2);
    expect(second.registrationStatus).toBe("waitlisted");
    await t.mutation(api.events.updateRegistrationConfirmation,{adminSecret:"test-admin",eventRegistrationId:first.eventRegistrationId,confirmationStatus:"cancelled"});
    expect(await t.run(ctx => ctx.db.get(second.eventRegistrationId))).toMatchObject({registrationStatus:"pending"});
    await t.mutation(api.events.update,{adminSecret:"test-admin",eventId,maleCapacity:2});
    expect(await t.run(ctx => ctx.db.get(third.eventRegistrationId))).toMatchObject({registrationStatus:"pending"});
    await expect(t.mutation(api.events.update,{adminSecret:"test-admin",eventId,maleCapacity:1})).rejects.toThrow("reserved");
    expect(await t.run(ctx => ctx.db.get(ids[0]))).toMatchObject({status:"approved"});
    await expect(t.mutation(api.registrations.updateStatus,{id:ids[0],status:"waitlisted"})).rejects.toThrow("retired");
  });
  test("same-time queue ordering, expiry promotion and repeat expiry are deterministic", async () => {
    const {t,eventId,ids} = await fixture();
    const add = (i:number) => t.mutation(api.events.addRegistration,{adminSecret:"test-admin",eventId,registrationId:ids[i]});
    const first = await add(0), second = await add(1), third = await add(2);
    await t.run(async ctx => {
      await ctx.db.patch(first.eventRegistrationId,{confirmationStatus:"not_confirmed",confirmedAt:undefined,confirmationExpiresAt:Date.now()-1});
      await ctx.db.patch(second.eventRegistrationId,{waitlistedAt:100});
      await ctx.db.patch(third.eventRegistrationId,{waitlistedAt:100});
    });
    expect(await t.mutation(api.events.expireUnconfirmed,{})).toEqual({cancelled:1});
    expect(await t.mutation(api.events.expireUnconfirmed,{})).toEqual({cancelled:0});
    expect(await t.run(ctx => ctx.db.get(second.eventRegistrationId))).toMatchObject({registrationStatus:"pending"});
    expect(await t.run(ctx => ctx.db.get(third.eventRegistrationId))).toMatchObject({registrationStatus:"waitlisted"});
  });

});

test("audited legacy list remains visible, including orphan, without profile changes or queue conversion", async () => {
  const t = convexTest(schema, modules);
  const data = await t.run(async ctx => {
    const eventId = await insertEvent(ctx,"Legacy list","legacy-list",Date.now(),1);
    const approved = await insertRegistration(ctx,"Legacy approved","male");
    const pending = await insertRegistration(ctx,"Legacy pending","female");
    await ctx.db.patch(pending,{status:"pending"});
    const orphan = await insertRegistration(ctx,"Deleted synthetic","male");
    const before = [await ctx.db.get(approved),await ctx.db.get(pending)];
    const entries = [];
    for (const [i,id] of [approved,pending,orphan].entries()) entries.push(await ctx.db.insert("eventWaitlistEntries",{eventId,registrationId:id,gender:i===1?"female":"male",status:"active",createdAt:100+i,updatedAt:100+i}));
    await ctx.db.delete(orphan);
    return {eventId,approved,pending,entries,before};
  });
  const detail = await t.query(api.events.getDetail,{eventId:data.eventId});
  expect(detail!.waitlistEntries).toHaveLength(3);
  expect(detail!.waitlistEntries[2].registration).toBeNull();
  expect(detail!.waitlistEntries.map(row => row._id)).toEqual(data.entries);
  expect(await t.run(async ctx => [await ctx.db.get(data.approved),await ctx.db.get(data.pending)])).toEqual(data.before);
  expect(detail!.registrations).toHaveLength(0);
});


test("completed event metadata does not promote historical queues and admin cannot add", async () => {
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "test-admin");
  const t = convexTest(schema, modules);
  const d = await t.run(async ctx => {
    const eventId = await insertEvent(ctx, "Historical", "historical", 1, 60);
    await ctx.db.patch(eventId, { status: "completed" });
    const person = await insertRegistration(ctx, "Historical queued", "male");
    const row = await insertEventRegistration(ctx, eventId, person, "male", "waitlisted");
    return { eventId, person, row, before: await ctx.db.get(row) };
  });
  await t.mutation(api.events.update, { adminSecret: "test-admin", eventId: d.eventId, adminNotes: "Reviewed" });
  expect(await t.run(ctx => ctx.db.get(d.row))).toEqual(d.before);
  await expect(t.mutation(api.events.addRegistration, { adminSecret: "test-admin", eventId: d.eventId, registrationId: d.person })).rejects.toThrow("closed");
});

test("public capacity counts reservations beyond 500 historical rows", async () => {
  const t = convexTest(schema, modules);
  await t.run(async ctx => {
    const eventId = await insertEvent(ctx, "Long history", "long-history", Date.now() + 100000, 1);
    const person = await insertRegistration(ctx, "Synthetic history", "male");
    for (let i = 0; i < 501; i++) await insertEventRegistration(ctx, eventId, person, "male", "withdrawn");
    await insertEventRegistration(ctx, eventId, person, "male", "pending");
  });
  const event = await t.query(api.events.getPublicByCode, { eventCode: "long-history" });
  expect(event?.maleAvailable).toBe(0);
  expect(event?.maleWaitlisted).toBe(true);
  expect(event?.femaleAvailable).toBe(1);
});

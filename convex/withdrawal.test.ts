process.env.ATTENDANCE_ADMIN_SECRET ??= "synthetic-admin-test";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
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


describe("applicant withdrawal", () => {
  async function fixture(status: EventRegistrationStatus = "approved") {
    const t = convexTest(schema, modules);
    const ids = await t.run(async ctx => {
      const registrationId = await insertRegistration(ctx, "Withdrawal Owner", "female");
      const otherId = await insertRegistration(ctx, "Other Owner", "female");
      const eventId = await insertEvent(ctx, "Private logistics", "withdrawal", Date.now() + 86400000, 1);
      const rowId = await insertEventRegistration(ctx, eventId, registrationId, "female", status, "confirmed");
      const otherRowId = await insertEventRegistration(ctx, eventId, otherId, "female", "approved", "confirmed");
      const waiterId = await insertEventRegistration(ctx, eventId, otherId, "female", "waitlisted");
      return { registrationId, otherId, eventId, rowId, otherRowId, waiterId };
    });
    return { t, ...ids, sessionHash: await createSession(t, ids.registrationId) };
  }
  test.each(["pending", "approved", "waitlisted"] as const)("withdraws %s idempotently without touching anyone else", async status => {
    const f = await fixture(status);
    const before = await f.t.run(ctx => ctx.db.get(f.otherRowId));
    await f.t.mutation(api.events.withdrawParticipation, { sessionHash: f.sessionHash, eventRegistrationId: f.rowId });
    const after = await f.t.run(ctx => ctx.db.get(f.rowId));
    expect(after).toMatchObject({ registrationStatus: "withdrawn", confirmationStatus: "cancelled" });
    expect(after?.cancelledAt).toBeTypeOf("number");
    await f.t.mutation(api.events.withdrawParticipation, { sessionHash: f.sessionHash, eventRegistrationId: f.rowId });
    expect(await f.t.run(ctx => ctx.db.get(f.rowId))).toEqual(after);
    expect(await f.t.run(ctx => ctx.db.get(f.otherRowId))).toEqual(before);
    expect((await f.t.run(ctx => ctx.db.get(f.waiterId)))?.registrationStatus).toBe("waitlisted");
    expect((await f.t.query(api.events.getApplicantEvents, {sessionHash:f.sessionHash})).history[0].canWithdraw).toBe(false);
  });
  test("invalidates old confirmation invitations without promoting anyone", async () => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.rowId, {confirmationRequestedAt:Date.now(), confirmationExpiresAt:Date.now()+86400000}));
    await f.t.mutation(api.events.withdrawParticipation,{sessionHash:f.sessionHash,eventRegistrationId:f.rowId});
    await expect(f.t.mutation(api.events.confirmParticipation,{sessionHash:f.sessionHash,eventRegistrationId:f.rowId})).rejects.toThrow("cannot be confirmed");
    expect((await f.t.run(ctx => ctx.db.get(f.rowId)))?.registrationStatus).toBe("withdrawn");
    expect((await f.t.run(ctx => ctx.db.get(f.waiterId)))?.registrationStatus).toBe("waitlisted");
  });
  test("rejects absent expired revoked sessions and another owner's row", async () => {
    const f = await fixture();
    await expect(f.t.mutation(api.events.withdrawParticipation, {sessionHash:"absent",eventRegistrationId:f.rowId})).rejects.toThrow("Unauthorized");
    await expect(f.t.mutation(api.events.withdrawParticipation, {sessionHash:f.sessionHash,eventRegistrationId:f.otherRowId})).rejects.toThrow("not found");
    const session = await f.t.run(ctx => ctx.db.query("applicantSessions").withIndex("by_sessionHash", q => q.eq("sessionHash",f.sessionHash)).unique());
    await f.t.run(ctx => ctx.db.patch(session!._id,{expiresAt:Date.now()-1}));
    await expect(f.t.mutation(api.events.withdrawParticipation, {sessionHash:f.sessionHash,eventRegistrationId:f.rowId})).rejects.toThrow("Unauthorized");
    await f.t.run(ctx => ctx.db.patch(session!._id,{expiresAt:Date.now()+100000,revokedAt:Date.now()}));
    await expect(f.t.mutation(api.events.withdrawParticipation, {sessionHash:f.sessionHash,eventRegistrationId:f.rowId})).rejects.toThrow("Unauthorized");
  });
  test.each(["draft", "completed", "cancelled"] as const)("locks %s events", async status => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.eventId,{status}));
    expect((await f.t.query(api.events.getApplicantEvents,{sessionHash:f.sessionHash})).history[0].canWithdraw).toBe(false);
    await expect(f.t.mutation(api.events.withdrawParticipation,{sessionHash:f.sessionHash,eventRegistrationId:f.rowId})).rejects.toThrow("cannot be withdrawn");
  });
  test.each([0,-1,-86400000])("locks events at/past start (%s)", async delta => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.eventId,{startsAt:Date.now()+delta}));
    await expect(f.t.mutation(api.events.withdrawParticipation,{sessionHash:f.sessionHash,eventRegistrationId:f.rowId})).rejects.toThrow("cannot be withdrawn");
  });
  test.each(["attended", "no_show"] as const)("locks attendance %s", async attendanceStatus => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.rowId,{attendanceStatus}));
    await expect(f.t.mutation(api.events.withdrawParticipation,{sessionHash:f.sessionHash,eventRegistrationId:f.rowId})).rejects.toThrow("cannot be withdrawn");
  });
  test("does not rewrite event rejection", async () => {
    const f = await fixture("rejected");
    await expect(f.t.mutation(api.events.withdrawParticipation,{sessionHash:f.sessionHash,eventRegistrationId:f.rowId})).rejects.toThrow("cannot be withdrawn");
  });
  test.each(["archived", "rejected", "failed-background"])("lets %s owners release reservations without granting eligibility", async kind => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.registrationId, kind === "archived" ? {archivedAt:Date.now()} : kind === "rejected" ? {status:"rejected"} : {backgroundCheck:"failed"}));
    const data = await f.t.query(api.events.getApplicantEvents,{sessionHash:f.sessionHash});
    expect(data.history[0].canWithdraw).toBe(true);
    if (["rejected","failed-background"].includes(kind)) {
      expect(data.upcoming).toEqual([]); expect(data.history[0].event).toBeNull();
      expect(JSON.stringify(data)).not.toContain("Private logistics");
    }
    await f.t.mutation(api.events.withdrawParticipation,{sessionHash:f.sessionHash,eventRegistrationId:f.rowId});
    expect((await f.t.run(ctx => ctx.db.get(f.rowId)))?.registrationStatus).toBe("withdrawn");
  });
});

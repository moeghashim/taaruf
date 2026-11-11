import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import schema from "./schema";
import { modules } from "./test.setup";
const own = makeFunctionReference<"mutation", {adminSecret: string; sessionHash: string; expectedArchivedAt: number | null; confirm: true}, {registrationId: Id<"registrations">; archivedAt: number}>("archive:archiveOwn");
const admin = makeFunctionReference<"mutation", {adminSecret: string; registrationId: Id<"registrations">; expectedArchivedAt: number | null; confirm: true}, {registrationId: Id<"registrations">; archivedAt: number}>("archive:archiveAdmin");
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
async function member(ctx: MutationCtx, name: string, gender: "male" | "female" = "male") {
  return ctx.db.insert("registrations", { name, gender, age: 30, maritalStatus: "single", education: "College", job: "Engineer", email: name + "@example.test", phone: "123", status: "approved", searchStatus: "active", paymentStatus: "paid", amountPaid: 50, photoSharingPermission: "yes", profileCompletionStatus: "completed", createdAt: 1 });
}
async function event(ctx: MutationCtx, startsAt: number, status: Doc<"events">["status"] = "scheduled") {
  return ctx.db.insert("events", { title: "Event", eventCode: String(startsAt), eventMonth: "2026-11", series: "test", location: "test", startsAt, endsAt: startsAt + 10000, status, maleCapacity: 1, femaleCapacity: 1, createdAt: 1, updatedAt: 1 });
}
async function seat(ctx: MutationCtx, eventId: Id<"events">, registrationId: Id<"registrations">, registrationStatus: Doc<"eventRegistrations">["registrationStatus"] = "approved", gender: "male" | "female" = "male", waitlistedAt = 1) {
  return ctx.db.insert("eventRegistrations", { eventId, registrationId, registrationStatus, gender, waitlistedAt, confirmationStatus: "confirmed", attendanceStatus: "attended", checkedInAt: 2, eligibilityStatus: "approved_member", receiptAttempt: 3, registrationReceivedEmailSentAt: 4, createdAt: 1, updatedAt: 1 });
}
test("owner authentication, required confirmation, stale state, idempotency and preserved profile", async () => {
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "secret");
  const t = convexTest(schema, modules);
  const id = await t.run(async ctx => {
    const id = await member(ctx, "owner");
    await ctx.db.insert("applicantSessions", { registrationId: id, sessionHash: "owner", expiresAt: Date.now() + 100000, createdAt: 1 });
    await ctx.db.insert("applicantSessions", { registrationId: id, sessionHash: "expired", expiresAt: 1, createdAt: 1 });
    await ctx.db.insert("applicantSessions", { registrationId: id, sessionHash: "revoked", expiresAt: Date.now() + 100000, revokedAt: 0, createdAt: 1 });
    return id;
  });
  for (const sessionHash of ["missing", "expired", "revoked"]) await expect(t.mutation(own, { adminSecret: "secret", sessionHash, expectedArchivedAt: null, confirm: true })).rejects.toThrow("Unauthorized");
  await expect(t.mutation(admin, { adminSecret: "bad", registrationId: id, expectedArchivedAt: null, confirm: true })).rejects.toThrow("Unauthorized");
  await expect(t.mutation(own, { adminSecret: "secret", sessionHash: "owner", expectedArchivedAt: 7, confirm: true })).rejects.toThrow("state changed");
  // Exercise runtime validation without weakening the function's literal contract.
  await expect(t.mutation(own, { adminSecret: "secret", sessionHash: "owner", expectedArchivedAt: null, confirm: false as unknown as true })).rejects.toThrow();
  const before = await t.run(ctx => ctx.db.get(id));
  const result = await t.mutation(own, { adminSecret: "secret", sessionHash: "owner", expectedArchivedAt: null, confirm: true });
  expect(await t.mutation(admin, { adminSecret: "secret", registrationId: id, expectedArchivedAt: null, confirm: true })).toEqual(result);
  expect(await t.mutation(own, { adminSecret: "secret", sessionHash: "owner", expectedArchivedAt: result.archivedAt, confirm: true })).toEqual(result);
  await expect(t.mutation(own, { adminSecret: "secret", sessionHash: "owner", expectedArchivedAt: result.archivedAt + 1, confirm: true })).rejects.toThrow("state changed");
  expect(await t.run(ctx => ctx.db.get(id))).toMatchObject({ ...before, archivedAt: result.archivedAt, archivedBy: "participant", archivedByRegistrationId: id });
});
test("upcoming only: release same-event/gender FIFO to Pending, retain historical attendance and receipts", async () => {
  vi.useFakeTimers(); vi.setSystemTime(100000); vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "secret");
  const t = convexTest(schema, modules);
  const data = await t.run(async ctx => {
    const id = await member(ctx, "owner"), first = await member(ctx, "first"), second = await member(ctx, "second"), female = await member(ctx, "female", "female");
    const future = await event(ctx, 100001), boundary = await event(ctx, 100000), past = await event(ctx, 99999), completed = await event(ctx, 200000, "completed"), other = await event(ctx, 300000);
    const current = await seat(ctx, future, id), q2 = await seat(ctx, future, second, "waitlisted", "male", 20), q1 = await seat(ctx, future, first, "waitlisted", "male", 10), qf = await seat(ctx, future, female, "waitlisted", "female"), qo = await seat(ctx, other, first, "waitlisted");
    const history = [await seat(ctx, boundary, id), await seat(ctx, past, id), await seat(ctx, completed, id)];
    const ownWait = await seat(ctx, other, id, "waitlisted");
    const legacy = await ctx.db.insert("eventWaitlistEntries", { eventId: future, registrationId: id, gender: "male", status: "active", createdAt: 1, updatedAt: 1 });
    return { id, future, current, q1, q2, qf, qo, history, ownWait, legacy };
  });
  const before = await t.run(async ctx => Promise.all(data.history.map(id => ctx.db.get(id))));
  await t.mutation(admin, { adminSecret: "secret", registrationId: data.id, expectedArchivedAt: null, confirm: true });
  await t.run(async ctx => {
    expect(await ctx.db.get(data.current)).toMatchObject({ registrationStatus: "withdrawn", confirmationStatus: "cancelled", checkedInAt: 2, receiptAttempt: 3, registrationReceivedEmailSentAt: 4 });
    expect(await ctx.db.get(data.q1)).toMatchObject({ registrationStatus: "pending" });
    for (const id of [data.q2, data.qf, data.qo]) expect(await ctx.db.get(id)).toMatchObject({ registrationStatus: "waitlisted" });
    expect(await ctx.db.get(data.ownWait)).toMatchObject({ registrationStatus: "withdrawn" });
    expect(await ctx.db.get(data.legacy)).toMatchObject({ status: "removed" });
    expect(await Promise.all(data.history.map(id => ctx.db.get(id)))).toEqual(before);
  });
  await expect(t.mutation(api.events.addRegistration, { adminSecret: "secret", registrationId: data.id, eventId: data.future })).rejects.toThrow("archived");
  await expect(t.mutation(api.events.updateRegistrationStatus, { adminSecret: "secret", eventRegistrationId: data.current, registrationStatus: "pending" })).rejects.toThrow("archived");
  await expect(t.mutation(api.events.updateRegistrationConfirmation, { adminSecret: "secret", eventRegistrationId: data.current, confirmationStatus: "confirmed" })).rejects.toThrow("archived");
});
test("concurrent archives close active relationships once and retain decisions/history", async () => {
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "secret");
  const t = convexTest(schema, modules);
  const data = await t.run(async ctx => {
    const id = await member(ctx, "owner"), other = await member(ctx, "other", "female"), eventId = await event(ctx, Date.now() + 100000);
    const interestId = await ctx.db.insert("interests", { fromRegistrationId: id, toRegistrationId: other, eventId, source: "admin_entered", status: "active", visibility: "internal_only", createdAt: 1, updatedAt: 1 });
    const matchId = await ctx.db.insert("matches", { maleRegistrationId: id, femaleRegistrationId: other, interestType: "mutual_interest", status: "contact_shared", createdAt: 1, updatedAt: 1 });
    await ctx.db.patch(id, { activeMatchId: matchId }); await ctx.db.patch(other, { activeMatchId: matchId });
    const flowId = await ctx.db.insert("interestFlows", { interestId, fromRegistrationId: id, toRegistrationId: other, flowStatus: "contact_shared", recipientDecision: "accepted", requesterFinalApproval: "approved", recipientFinalApproval: "approved", photoDecision: "approved", contactSharedAt: 5, photosVisibleAt: 4, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("applicantSessions", { registrationId: id, sessionHash: "owner", expiresAt: Date.now() + 100000, createdAt: 1 });
    return { id, other, interestId, matchId, flowId, eventId };
  });
  const results = await Promise.all([t.mutation(own, { adminSecret: "secret", sessionHash: "owner", expectedArchivedAt: null, confirm: true }), t.mutation(admin, { adminSecret: "secret", registrationId: data.id, expectedArchivedAt: null, confirm: true })]);
  expect(results[0]).toEqual(results[1]);
  await t.run(async ctx => {
    expect(await ctx.db.get(data.matchId)).toMatchObject({ status: "closed" });
    expect((await ctx.db.get(data.other))?.activeMatchId).toBeUndefined();
    expect(await ctx.db.get(data.interestId)).toMatchObject({ status: "closed" });
    expect(await ctx.db.get(data.flowId)).toMatchObject({ flowStatus: "closed", contactSharedAt: 5, photosVisibleAt: 4, photoDecision: "approved" });
    expect(await ctx.db.query("interestFlowEvents").collect()).toHaveLength(1);
  });
  await expect(t.mutation(api.events.registerForEvent, { sessionHash: "owner", eventId: data.eventId })).rejects.toThrow("archived");
});

test("archived profile cannot be deleted or reactivated by legacy profile controls", async () => {
 vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "secret");
 const t=convexTest(schema,modules);const id=await t.run(async ctx=>{const id=await member(ctx,"archived");await ctx.db.patch(id,{archivedAt:1});return id;});
 await expect(t.mutation(api.registrations.deleteRegistration,{id,adminSecret:"secret"})).rejects.toThrow("history");
 await expect(t.mutation(api.registrations.updateStatus,{id,adminSecret:"secret",status:"approved"})).rejects.toThrow("archived");
 await expect(t.mutation(api.registrations.updateSearchStatus,{id,adminSecret:"secret",searchStatus:"active"})).rejects.toThrow("archived");
 expect(await t.run(ctx=>ctx.db.get(id))).not.toBeNull();
});

test("archive honors the security cutoff and requires the server bridge even with an owner session", async () => {
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "secret");
  const t = convexTest(schema, modules);
  const id = await t.run(async ctx => {
    const id = await member(ctx, "cutoff-owner");
    await ctx.db.insert("settings", {key: "capabilitySecurityCutoffMs", value: "100"});
    for (const [sessionHash, createdAt] of [["old", 99], ["equal", 100], ["fresh", 101]] as const) {
      await ctx.db.insert("applicantSessions", {registrationId: id, sessionHash, createdAt, expiresAt: Date.now() + 100000});
    }
    return id;
  });
  for (const sessionHash of ["old", "equal"]) await expect(t.mutation(own, {adminSecret: "secret", sessionHash, confirm: true, expectedArchivedAt: null})).rejects.toThrow("Unauthorized");
  await expect(t.mutation(own, {adminSecret: "forged", sessionHash: "fresh", confirm: true, expectedArchivedAt: null})).rejects.toThrow("Unauthorized");
  expect((await t.run(ctx => ctx.db.get(id)))?.archivedAt).toBeUndefined();
  expect(await t.mutation(own, {adminSecret: "secret", sessionHash: "fresh", confirm: true, expectedArchivedAt: null})).toMatchObject({registrationId: id});
});

for (const count of [62, 61, 60]) test(`60-cap boundary: ${count} seats cancel to ${count - 1}`, async () => {
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "secret");
  const t = convexTest(schema, modules);
  const data = await t.run(async ctx => {
    const eventId = await event(ctx, Date.now() + 100000);
    await ctx.db.patch(eventId, {maleCapacity: 60});
    const id = await member(ctx, "owner");
    await seat(ctx, eventId, id);
    for (let i = 1; i < count; i++) await seat(ctx, eventId, await member(ctx, "seat" + i));
    const skipped = [];
    for (const kind of ["archived", "rejected", "incomplete", "background"]) {
      const p = await member(ctx, kind);
      if (kind === "archived") await ctx.db.patch(p, {archivedAt: 1});
      if (kind === "rejected") await ctx.db.patch(p, {status: "rejected"});
      if (kind === "incomplete") await ctx.db.patch(p, {profileCompletionStatus: "in_progress"});
      if (kind === "background") await ctx.db.patch(p, {backgroundCheck: "failed"});
      skipped.push(await seat(ctx, eventId, p, "waitlisted", "male", 0));
    }
    const first = await seat(ctx, eventId, await member(ctx, "first"), "waitlisted", "male", 1);
    const second = await seat(ctx, eventId, await member(ctx, "second"), "waitlisted", "male", 2);
    return {id, first, second, skipped};
  });
  await t.mutation(admin, {adminSecret: "secret", registrationId: data.id, expectedArchivedAt: null, confirm: true});
  await t.run(async ctx => {
    expect((await ctx.db.get(data.first))?.registrationStatus).toBe(count === 60 ? "pending" : "waitlisted");
    for (const id of [...data.skipped, data.second]) expect((await ctx.db.get(id))?.registrationStatus).toBe("waitlisted");
  });
});

test("restore clears only availability and is authenticated, stale-safe and idempotent", async () => {
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "secret");
  const t = convexTest(schema, modules);
  const data = await t.run(async ctx => {
    const id = await member(ctx, "restore");
    await ctx.db.patch(id, {status: "rejected", searchStatus: "paused", photoSharingPermission: "no"});
    await ctx.db.insert("applicantSessions", {registrationId: id, sessionHash: "restore", createdAt: 1, expiresAt: Date.now() + 100000});
    const eventId = await event(ctx, Date.now() + 100000);
    return {id, seat: await seat(ctx, eventId, id)};
  });
  const result = await t.mutation(admin, {adminSecret: "secret", registrationId: data.id, expectedArchivedAt: null, confirm: true});
  const restore = makeFunctionReference<"mutation">("archive:restoreOwn");
  for (const args of [{adminSecret: "bad", sessionHash: "restore"}, {adminSecret: "secret", sessionHash: "wrong"}]) await expect(t.mutation(restore, {...args, expectedArchivedAt: result.archivedAt, confirm: true})).rejects.toThrow("Unauthorized");
  await expect(t.mutation(restore, {adminSecret: "secret", sessionHash: "restore", expectedArchivedAt: result.archivedAt + 1, confirm: true})).rejects.toThrow("state changed");
  for (let i = 0; i < 2; i++) await t.mutation(restore, {adminSecret: "secret", sessionHash: "restore", expectedArchivedAt: result.archivedAt, confirm: true});
  await t.run(async ctx => {
    expect(await ctx.db.get(data.id)).toMatchObject({status: "rejected", searchStatus: "paused", photoSharingPermission: "no", paymentStatus: "paid", amountPaid: 50});
    expect((await ctx.db.get(data.id))?.archivedAt).toBeUndefined();
    expect((await ctx.db.get(data.seat))?.registrationStatus).toBe("withdrawn");
  });
});

for (const kind of ["waitlisted", "expired"] as const) test("non-seat cancellation does not fill unrelated vacancy: " + kind, async () => {
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "secret");
  const t = convexTest(schema, modules);
  const data = await t.run(async ctx => {
    const eventId = await event(ctx, Date.now() + 100000);
    const id = await member(ctx, "nonseat");
    const row = await seat(ctx, eventId, id, kind === "waitlisted" ? "waitlisted" : "pending");
    if (kind === "expired") await ctx.db.patch(row, {confirmationStatus: "not_confirmed", confirmationExpiresAt: 1, confirmedAt: undefined});
    const queued = await seat(ctx, eventId, await member(ctx, "queued"), "waitlisted");
    return {id, queued};
  });
  await t.mutation(admin, {adminSecret: "secret", registrationId: data.id, expectedArchivedAt: null, confirm: true});
  expect((await t.run(ctx => ctx.db.get(data.queued)))?.registrationStatus).toBe("waitlisted");
});

test("stale archive cannot undo restore or cancel fresh bookings; fresh generation can archive", async () => {
 vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "secret");
 const t=convexTest(schema,modules);
 const id=await t.run(ctx=>member(ctx,"aba"));
 const args={adminSecret:"secret",registrationId:id,expectedArchivedAt:null,confirm:true as const};
 const first=await t.mutation(api.archive.archiveAdmin,args);
 await t.mutation(api.archive.restoreAdmin,{...args,expectedArchivedAt:first.archivedAt});
 const booking=await t.run(async ctx=>seat(ctx,await event(ctx,Date.now()+100000),id));
 await expect(t.mutation(api.archive.archiveAdmin,args)).rejects.toThrow("state changed");
 expect((await t.run(ctx=>ctx.db.get(booking)))?.registrationStatus).toBe("approved");
 const second=await t.mutation(api.archive.archiveAdmin,{...args,expectedRestoredArchivedAt:first.archivedAt});
 expect(second.archivedAt).toBeGreaterThan(first.archivedAt);
 await expect(t.mutation(api.archive.restoreAdmin,{...args,expectedArchivedAt:first.archivedAt})).rejects.toThrow("state changed");
 expect(await t.mutation(api.archive.archiveAdmin,{...args,expectedRestoredArchivedAt:first.archivedAt})).toEqual(second);
});

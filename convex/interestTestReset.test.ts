import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";
afterEach(() => vi.unstubAllEnvs());
type Gender = "male" | "female";

async function createRegistration(
  t: ReturnType<typeof convexTest>,
  name: string,
  gender: Gender,
  completed = true
) {
  return await t.run(async (ctx) => {
    const existingEvent = (await ctx.db.query("events").take(10)).find((event) => event.eventCode === "apr26");
    const now = Date.now();
    const eventId = existingEvent?._id ?? await ctx.db.insert("events", {
      title: "1Plus1 Match Event - Apr26",
      eventCode: "apr26",
      eventMonth: "2026-04",
      series: "1plus1_match",
      location: "ROIC",
      startsAt: now - 60 * 60 * 1000,
      endsAt: now - 30 * 60 * 1000,
      status: "completed",
      maleCapacity: 60,
      femaleCapacity: 60,
      interestSubmissionsEnabled: true,
      interestSubmissionClosesAt: now + 60 * 60 * 1000,
      createdAt: now,
      updatedAt: now,
    });
    const registrationId = await ctx.db.insert("registrations", {
      name,
      applicantNumber: (await ctx.db.query("registrations").take(1000)).length + 1,
      publicApplicantNumber: (await ctx.db.query("registrations").take(1000)).length + 1,
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
      createdAt: Date.now(),
      profileCompletionStatus: completed ? "completed" : "not_started",
      ethnicity: "Arab",
      prayerCommitment: "always_five",
      hijabResponse: gender === "female" ? "yes" : "open",
      spouseRequirement1: `${name} requirement one`,
      spouseRequirement2: `${name} requirement two`,
      spouseRequirement3: `${name} requirement three`,
      shareableBio: `${name} bio text`,
      photoSharingPermission: "ask_me_first",
    });
    await ctx.db.insert("eventRegistrations", {
      eventId,
      registrationId,
      gender,
      registrationStatus: "approved",
      confirmationStatus: "confirmed",
      attendanceStatus: "attended",
      eligibilityStatus: "approved_member",
      approvedAt: now,
      confirmedAt: now,
      checkedInAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("eventAttendees", { eventId, registrationId, addedAt: now });
    return registrationId;
  });
}

async function getTestEvent(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const event = (await ctx.db.query("events").take(10)).find((row) => row.eventCode === "apr26");
    if (!event) throw new Error("Test event not found");
    return event._id;
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
async function fixture() {
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "synthetic-reset-secret");
  const t = convexTest(schema, modules);
  const from = await createRegistration(t, "Sender", "male");
  const targets: Id<"registrations">[] = [];
  for (const name of ["Amina", "Basma", "Dalia", "Hana"]) targets.push(await createRegistration(t, name, "female"));
  const sessionHash = await createSession(t, from);
  const event = await getTestEvent(t);
  const submit = async (i: number) => {
    const target = await t.run(ctx => ctx.db.get(targets[i]));
    return t.mutation(api.applicantInterests.submitInterestNumber, { sessionHash, applicantNumber: target!.publicApplicantNumber!, applicantName: target!.name, expectedEventId: event });
  };
  const reset = (id: Id<"interests">) => t.mutation(api.interestTestReset.reset, { id, adminSecret: "synthetic-reset-secret", confirmTest: true, reason: "Explicit synthetic test submission" });
  return { t, from, targets, sessionHash, event, submit, reset };
}
test("exactly one slot restored, idempotent, audit retained, duplicate resubmission only after reset", async () => {
  const f = await fixture();
  const first = await f.submit(0); await f.submit(1); await f.submit(2);
  await expect(f.submit(3)).rejects.toThrow("maximum of 3");
  await expect(f.submit(0)).rejects.toThrow("already submitted");
  const others = await f.t.run(ctx => ctx.db.query("interests").collect());
  expect(await f.reset(first.interestId)).toEqual({ alreadyReset: false });
  expect(await f.reset(first.interestId)).toEqual({ alreadyReset: true });
  const eligibility = await f.t.query(api.applicantInterests.getInterestEligibility, { sessionHash: f.sessionHash });
  expect(eligibility.interestSubmissions).toHaveLength(2);
  for (const other of others.filter(row => row._id !== first.interestId)) expect(await f.t.run(ctx => ctx.db.get(other._id))).toEqual(other);
  await f.submit(0);
  await expect(f.submit(3)).rejects.toThrow("maximum of 3");
  const audit = await f.t.run(ctx => ctx.db.query("interestFlowEvents").withIndex("by_interestId", q => q.eq("interestId", first.interestId)).collect());
  expect(audit.filter(e => e.eventType === "admin_test_reset")).toHaveLength(1);
  expect(await f.t.run(ctx => ctx.db.get(first.interestId))).toMatchObject({ status: "closed", source: "platform_submission", testReset: { actor: "admin" } });
});
test("invalid authorization and ordinary delete cannot restore quota", async () => {
  const f = await fixture(); const row = await f.submit(0);
  await expect(f.t.mutation(api.interestTestReset.reset, { id: row.interestId, adminSecret: "wrong", confirmTest: true, reason: "Synthetic testing record" })).rejects.toThrow("Unauthorized");
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "");
  await expect(f.reset(row.interestId)).rejects.toThrow("Unauthorized");
  await expect(f.t.mutation(api.interests.remove, { id: row.interestId })).rejects.toThrow("retained");
});
test("reset hides workflow, clears grants and rejects stale actions", async () => {
  const f = await fixture(); const row = await f.submit(0);
  const recipientSession = await createSession(f.t, f.targets[0]);
  await f.t.run(async ctx => { const flow = await ctx.db.query("interestFlows").withIndex("by_interestId", q => q.eq("interestId", row.interestId)).unique(); await ctx.db.patch(flow!._id, { photoDecision: "approved", photoRequestedByRegistrationId: f.from, photosVisibleAt: Date.now() }); });
  await f.reset(row.interestId);
  for (const sessionHash of [f.sessionHash, recipientSession]) {
    const dashboard = await f.t.query(api.applicantInterests.getDashboard, { sessionHash });
    expect([...dashboard.inbound, ...dashboard.outbound, ...dashboard.privateDocumented]).toHaveLength(0);
  }
  await expect(f.t.mutation(api.applicantInterests.respondToInbound, { sessionHash: recipientSession, interestId: row.interestId, decision: "accept" })).rejects.toThrow();
  await expect(f.t.mutation(api.interests.updateStatus, { id: row.interestId, status: "new" })).rejects.toThrow();
  await expect(f.t.mutation(api.interests.convertToMatch, { interestId: row.interestId })).rejects.toThrow();
  const flow = await f.t.run(ctx => ctx.db.query("interestFlows").withIndex("by_interestId", q => q.eq("interestId", row.interestId)).unique());
  expect(flow).toMatchObject({ flowStatus: "closed", photoDecision: "pending" }); expect(flow!.photosVisibleAt).toBeUndefined();
});
for (const kind of ["contact", "match", "reciprocal", "share"] as const) test("blocks unsafe " + kind, async () => {
  const f = await fixture(); const row = await f.submit(0);
  await f.t.run(async ctx => {
    const flow = await ctx.db.query("interestFlows").withIndex("by_interestId", q => q.eq("interestId", row.interestId)).unique();
    if (kind === "contact") await ctx.db.patch(flow!._id, { contactSharedAt: Date.now() });
    if (kind === "match") await ctx.db.insert("matches", { maleRegistrationId: f.from, femaleRegistrationId: f.targets[0], interestId: row.interestId, interestType: "man_interested", status: "closed", createdAt: 1, updatedAt: 1 });
    if (kind === "reciprocal") await ctx.db.insert("interests", { fromRegistrationId: f.targets[0], toRegistrationId: f.from, eventId: f.event, source: "platform_submission", status: "closed", visibility: "internal_only", createdAt: 1, updatedAt: 1 });
    if (kind === "share") await ctx.db.insert("profileShares", { ownerRegistrationId: f.from, recipientRegistrationId: f.targets[0], shareToken: "synthetic", includeImages: true, status: "shared", createdAt: 1, updatedAt: 1 });
  });
  await expect(f.reset(row.interestId)).rejects.toThrow("manual review");
  expect((await f.t.run(ctx => ctx.db.get(row.interestId)))!.testReset).toBeUndefined();
});

test("retained test audit survives pair reset/deletion and stale share creation", async () => {
 const f = await fixture(); const row = await f.submit(0); await f.reset(row.interestId);
 await expect(f.t.mutation(api.matches.deletePairConnection, { registrationAId: f.from, registrationBId: f.targets[0] })).rejects.toThrow("retained");
 await expect(f.t.mutation(api.profileShares.create, { ownerRegistrationId: f.from, recipientRegistrationId: f.targets[0], interestId: row.interestId, shareToken: "stale", includeImages: false })).rejects.toThrow("unavailable");
 const before = await f.t.run(ctx => ctx.db.get(row.interestId));
 await f.t.mutation(api.matches.resetPair, { registrationAId: f.from, registrationBId: f.targets[0] });
 expect(await f.t.run(ctx => ctx.db.get(row.interestId))).toEqual(before);
});
test("more than 100 retained reset rows cannot hide a fresh submission or defeat cap", async () => {
 const f = await fixture();
 for (let i = 0; i < 101; i++) { const row = await f.submit(0); await f.reset(row.interestId); }
 await f.submit(0);
 const dashboard = await f.t.query(api.applicantInterests.getDashboard, { sessionHash: f.sessionHash });
 expect(dashboard.outbound).toHaveLength(1);
 expect(dashboard.interestSubmissions).toHaveLength(1);
 await expect(f.submit(0)).rejects.toThrow("already submitted");
});

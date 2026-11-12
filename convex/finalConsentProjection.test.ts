import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const now = Date.now();
    const base = { age: 30, maritalStatus: "single", education: "College", job: "Engineer", phone: "5550100", status: "approved" as const, createdAt: now };
    const sister = await ctx.db.insert("registrations", { ...base, name: "Sister", gender: "female", email: "sister@example.com" });
    const brother = await ctx.db.insert("registrations", { ...base, name: "Brother", gender: "male", email: "brother@example.com" });
    const eventId = await ctx.db.insert("events", { title: "Synthetic", eventCode: "test", eventMonth: "2026-11", series: "test", location: "Test", startsAt: now, endsAt: now, status: "completed", maleCapacity: 1, femaleCapacity: 1, createdAt: now, updatedAt: now });
    const interestId = await ctx.db.insert("interests", { fromRegistrationId: sister, toRegistrationId: brother, eventId, source: "admin_entered", status: "active", visibility: "admin_actionable", createdAt: now, updatedAt: now });
    const flowId = await ctx.db.insert("interestFlows", { interestId, fromRegistrationId: sister, toRegistrationId: brother, flowStatus: "awaiting_final_approvals", recipientDecision: "pending", requesterFinalApproval: "pending", recipientFinalApproval: "pending", photoDecision: "pending", bioVisibleAt: now, createdAt: now, updatedAt: now });
    for (const [registrationId, sessionHash] of [[sister, "sister"], [brother, "brother"]] as const) await ctx.db.insert("applicantSessions", { registrationId, sessionHash, expiresAt: now + 86400000, createdAt: now });
    return { sister, brother, interestId, flowId };
  });
  return { t, ...ids };
}

for (const sessionHash of ["sister", "brother"]) test("synthetic bio timestamp cannot authorize new final consent: " + sessionHash, async () => {
  const f = await fixture();
  if (sessionHash === "sister") await f.t.run(async ctx => {
    await ctx.db.patch(f.interestId, { fromRegistrationId: f.brother, toRegistrationId: f.sister });
    await ctx.db.patch(f.flowId, { fromRegistrationId: f.brother, toRegistrationId: f.sister });
  });
  const dashboard = await f.t.query(api.applicantInterests.getDashboard, { sessionHash });
  expect([...dashboard.inbound, ...dashboard.outbound].find(row => row?.interestId === f.interestId)?.canFinalApprove).toBe(false);
  await expect(f.t.mutation(api.applicantInterests.giveFinalApproval, { sessionHash, interestId: f.interestId, approved: true })).rejects.toThrow("Bio review is not open");
  expect(await f.t.run(ctx => ctx.db.get(f.flowId))).toMatchObject({ requesterFinalApproval: "pending", recipientFinalApproval: "pending" });
  expect(await f.t.run(ctx => ctx.db.query("interestFlowEvents").collect())).toEqual([]);
  // Genuine initial acceptance, not a fabricated timestamp, enables final consent.
  await f.t.run(ctx => ctx.db.patch(f.flowId, { recipientDecision: "accepted" }));
  const accepted = await f.t.query(api.applicantInterests.getDashboard, { sessionHash });
  expect([...accepted.inbound, ...accepted.outbound].find(row => row?.interestId === f.interestId)?.canFinalApprove).toBe(true);
  await f.t.mutation(api.applicantInterests.giveFinalApproval, { sessionHash, interestId: f.interestId, approved: true });
});

test("already disclosed historical final remains an immutable idempotent receipt", async () => {
  const f = await fixture();
  await f.t.run(ctx => ctx.db.patch(f.flowId, { contactSharedAt: Date.now(), flowStatus: "contact_shared" }));
  const before = await f.t.run(ctx => ctx.db.get(f.flowId));
  expect(await f.t.mutation(api.applicantInterests.giveFinalApproval, { sessionHash: "brother", interestId: f.interestId, approved: true })).toMatchObject({ alreadyRecorded: true });
  expect(await f.t.run(ctx => ctx.db.get(f.flowId))).toEqual(before);
});

test("female review never exposes contacts when workflow release contradicts pending match gate", async () => {
  const f = await fixture();
  const matchId = await f.t.run(async ctx => {
    const now = Date.now();
    const matchId = await ctx.db.insert("matches", { maleRegistrationId: f.brother, femaleRegistrationId: f.sister, interestId: f.interestId, interestType: "mutual_interest", status: "reviewing", contactGate: "pending_admin_approval", createdAt: now, updatedAt: now });
    await ctx.db.patch(f.interestId, { matchId, femaleWorkflow: { state: "contacts_released", adminReleasedAt: now, brotherAcceptedAt: now, reviewTokenHash: "a".repeat(64), reviewExpiresAt: now + 86400000 } });
    await ctx.db.patch(f.flowId, { contactSharedAt: now, recipientDecision: "accepted" });
    return matchId;
  });
  for (const sessionHash of ["brother", "sister"]) {
    const review = await f.t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash, interestId: f.interestId });
    expect(review.profile).toMatchObject({ email: null, phone: null });
  }
  await f.t.run(ctx => ctx.db.patch(matchId, { contactGate: "contacts_released" }));
  for (const sessionHash of ["brother", "sister"]) {
    const review = await f.t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash, interestId: f.interestId });
    expect(review.profile.email).toBe(sessionHash === "brother" ? "sister@example.com" : "brother@example.com");
    expect(review.profile.phone).toBe("5550100");
  }
});

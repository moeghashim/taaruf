import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

afterEach(() => vi.unstubAllEnvs());
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const now = Date.now();
    const base = { age: 30, maritalStatus: "single", education: "College", job: "Engineer", phone: "5550100", status: "approved" as const, createdAt: now };
    const male = await ctx.db.insert("registrations", { ...base, name: "Requester", gender: "male", email: "m@example.com", publicApplicantNumber: 217 });
    const female = await ctx.db.insert("registrations", { ...base, name: "Target", gender: "female", email: "f@example.com", publicApplicantNumber: 216 });
    const event = await ctx.db.insert("events", { title: "Test", eventCode: "test", eventMonth: "2026-10", series: "test", location: "Test", startsAt: now, endsAt: now, status: "completed", maleCapacity: 1, femaleCapacity: 1, createdAt: now, updatedAt: now });
    const interest = await ctx.db.insert("interests", { fromRegistrationId: male, toRegistrationId: female, eventId: event, source: "admin_entered", status: "converted_to_match", visibility: "admin_actionable", createdAt: now, updatedAt: now });
    const match = await ctx.db.insert("matches", { maleRegistrationId: male, femaleRegistrationId: female, interestId: interest, interestType: "man_interested", status: "reviewing", createdAt: now, updatedAt: now });
    await ctx.db.patch(interest, { matchId: match });
    const flow = await ctx.db.insert("interestFlows", { interestId: interest, fromRegistrationId: male, toRegistrationId: female, flowStatus: "awaiting_final_approvals", recipientDecision: "accepted", requesterFinalApproval: "approved", recipientFinalApproval: "approved", photoDecision: "pending", createdAt: now, updatedAt: now });
    for (const [registrationId, sessionHash] of [[male, "male-session"], [female, "female-session"]] as const) await ctx.db.insert("applicantSessions", { registrationId, sessionHash, expiresAt: now + 100000, createdAt: now });
    return { male, female, interest, match, flow };
  });
  vi.stubEnv("ADMIN_PASSWORD", "test-only-secret");
  return { t, ...ids };
}
test("contact share requires admin credentials and bilateral consent", async () => {
  const { t, match, flow } = await fixture();
  await expect(t.mutation(api.matches.updateStatus, { id: match, status: "contact_shared" })).rejects.toThrow("Unauthorized");
  await t.run(ctx => ctx.db.patch(flow, { recipientFinalApproval: "pending" }));
  await expect(t.mutation(api.matches.updateStatus, { id: match, status: "contact_shared", adminSecret: "test-only-secret" })).rejects.toThrow("Both applicants");
  expect((await t.run(ctx => ctx.db.get(match)))?.status).toBe("reviewing");
});
test("share actually discloses portal contacts and is idempotent", async () => {
  const { t, match, flow, male, female } = await fixture();
  const args = { id: match, status: "contact_shared" as const, adminSecret: "test-only-secret" };
  await t.mutation(api.matches.updateStatus, args);
  const first = await t.run(ctx => ctx.db.get(flow));
  await t.mutation(api.matches.updateStatus, args);
  expect((await t.run(ctx => ctx.db.get(flow)))?.contactSharedAt).toBe(first?.contactSharedAt);
  expect((await t.run(ctx => ctx.db.get(male)))?.activeMatchId).toBe(match);
  expect((await t.run(ctx => ctx.db.get(female)))?.activeMatchId).toBe(match);
  const portal = await t.query(api.applicantInterests.getDashboard, { sessionHash: "male-session" });
  expect(JSON.stringify(portal)).toContain("f@example.com");
  const events = await t.run(ctx => ctx.db.query("interestFlowEvents").take(100));
  expect(events.filter(e => e.eventType === "contacts_disclosed_in_portal")).toHaveLength(1);
});
test("closed matches cannot disclose contacts", async () => {
  const { t, match } = await fixture();
  await t.run(ctx => ctx.db.patch(match, { status: "closed" }));
  await expect(t.mutation(api.matches.updateStatus, { id: match, status: "contact_shared", adminSecret: "test-only-secret" })).rejects.toThrow("not active");
});

test("active match conflicts roll back disclosure", async () => {
  const { t, match, male, flow } = await fixture();
  await t.run(async ctx => {
    const original = (await ctx.db.get(match))!;
    const other = await ctx.db.insert("matches", { maleRegistrationId: original.maleRegistrationId, femaleRegistrationId: original.femaleRegistrationId, interestType: "man_interested", status: "contact_shared", createdAt: Date.now(), updatedAt: Date.now() });
    await ctx.db.patch(male, { activeMatchId: other });
  });
  await expect(t.mutation(api.matches.updateStatus, { id: match, status: "contact_shared", adminSecret: "test-only-secret" })).rejects.toThrow("active match");
  expect((await t.run(ctx => ctx.db.get(flow)))?.contactSharedAt).toBeUndefined();
});

test("applicant final approval cannot reactivate a declined flow", async () => {
  const { t, interest, flow } = await fixture();
  await t.run(ctx => ctx.db.patch(flow, { flowStatus: "declined", bioVisibleAt: Date.now(), requesterFinalApproval: "pending" }));
  await expect(t.mutation(api.applicantInterests.giveFinalApproval, { sessionHash: "male-session", interestId: interest, approved: true })).rejects.toThrow("no longer active");
});

test("applicant final approval cannot disclose after the other applicant loses approval", async () => {
  const { t, interest, flow, female } = await fixture();
  await t.run(async ctx => {
    await ctx.db.patch(flow, { bioVisibleAt: Date.now(), requesterFinalApproval: "pending" });
    await ctx.db.patch(female, { status: "pending" });
  });
  await expect(t.mutation(api.applicantInterests.giveFinalApproval, { sessionHash: "male-session", interestId: interest, approved: true })).rejects.toThrow("Both applicants must be approved");
  expect((await t.run(ctx => ctx.db.get(flow)))?.contactSharedAt).toBeUndefined();
});

test("approval reversal is admin-only and preserves permanent identity", async () => {
  const { t, male } = await fixture();
  await expect(t.mutation(api.registrations.revokeApproval, { id: male, adminSecret: "wrong" })).rejects.toThrow("Unauthorized");
  await t.mutation(api.registrations.revokeApproval, { id: male, adminSecret: "test-only-secret" });
  expect(await t.run(ctx => ctx.db.get(male))).toMatchObject({ status: "pending", publicApplicantNumber: 217 });
});

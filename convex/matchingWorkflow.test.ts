process.env.ATTENDANCE_ADMIN_SECRET ??= "synthetic-admin-test";
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

afterEach(() => vi.unstubAllEnvs());
async function historicalFixture() {
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
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "test-only-secret");
  return { t, ...ids };
}
test("contact share requires admin credentials and bilateral consent", async () => {
  const { t, match, flow } = await historicalFixture();
  await expect(t.mutation(api.matches.updateStatus, { id: match, status: "contact_shared" })).rejects.toThrow("Unauthorized");
  await t.run(ctx => ctx.db.patch(flow, { recipientFinalApproval: "pending" }));
  await expect(t.mutation(api.matches.updateStatus, { id: match, status: "contact_shared", adminSecret: "test-only-secret" })).rejects.toThrow("Both applicants");
  expect((await t.run(ctx => ctx.db.get(match)))?.status).toBe("reviewing");
});
test("share actually discloses portal contacts and is idempotent", async () => {
  const { t, match, flow, male, female } = await historicalFixture();
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
  const { t, match } = await historicalFixture();
  await t.run(ctx => ctx.db.patch(match, { status: "closed" }));
  await expect(t.mutation(api.matches.updateStatus, { id: match, status: "contact_shared", adminSecret: "test-only-secret" })).rejects.toThrow("not active");
});

test("active match conflicts roll back disclosure", async () => {
  const { t, match, male, flow } = await historicalFixture();
  await t.run(async ctx => {
    const original = (await ctx.db.get(match))!;
    const other = await ctx.db.insert("matches", { maleRegistrationId: original.maleRegistrationId, femaleRegistrationId: original.femaleRegistrationId, interestType: "man_interested", status: "contact_shared", createdAt: Date.now(), updatedAt: Date.now() });
    await ctx.db.patch(male, { activeMatchId: other });
  });
  await expect(t.mutation(api.matches.updateStatus, { id: match, status: "contact_shared", adminSecret: "test-only-secret" })).rejects.toThrow("active match");
  expect((await t.run(ctx => ctx.db.get(flow)))?.contactSharedAt).toBeUndefined();
});

test("applicant final approval cannot reactivate a declined flow", async () => {
  const { t, interest, flow } = await historicalFixture();
  await t.run(ctx => ctx.db.patch(flow, { flowStatus: "declined", bioVisibleAt: Date.now(), requesterFinalApproval: "pending" }));
  await expect(t.mutation(api.applicantInterests.giveFinalApproval, { sessionHash: "male-session", interestId: interest, approved: true })).rejects.toThrow("no longer active");
});

test("applicant final approval cannot disclose after the other applicant loses approval", async () => {
  const { t, interest, flow, female } = await historicalFixture();
  await t.run(async ctx => {
    await ctx.db.patch(flow, { bioVisibleAt: Date.now(), requesterFinalApproval: "pending" });
    await ctx.db.patch(female, { status: "pending" });
  });
  await expect(t.mutation(api.applicantInterests.giveFinalApproval, { sessionHash: "male-session", interestId: interest, approved: true })).rejects.toThrow("Both applicants must be approved");
  expect((await t.run(ctx => ctx.db.get(flow)))?.contactSharedAt).toBeUndefined();
});

test("approval reversal is admin-only and preserves permanent identity", async () => {
  const { t, male } = await historicalFixture();
  await expect(t.mutation(api.registrations.revokeApproval, { id: male, adminSecret: "wrong" })).rejects.toThrow("Unauthorized");
  await t.mutation(api.registrations.revokeApproval, { id: male, adminSecret: "test-only-secret" });
  expect(await t.run(ctx => ctx.db.get(male))).toMatchObject({ status: "pending", publicApplicantNumber: 217 });
});

test("historically disclosed contacts are retained without new outbox or gate backfill", async () => {
  const { t, interest, flow, match } = await historicalFixture();
  await t.run(async ctx => {
    await ctx.db.patch(match, { status: "contact_shared" });
    await ctx.db.patch(flow, { flowStatus: "contact_shared", contactSharedAt: 123, bioVisibleAt: 100 });
  });
  await t.mutation(api.applicantInterests.giveFinalApproval, { sessionHash: "male-session", interestId: interest, approved: true });
  expect(JSON.stringify(await t.query(api.applicantInterests.getDashboard, { sessionHash: "male-session" }))).toContain("f@example.com");
  expect((await t.run(ctx => ctx.db.get(flow)))?.contactSharedAt).toBe(123);
  expect((await t.run(ctx => ctx.db.get(match)))?.contactGate).toBeUndefined();
  expect(await t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").collect())).toHaveLength(0);
});

test("pending gate blocks timestamp-only serializer bypass", async () => {
  const { t, match, flow } = await historicalFixture();
  await t.run(async ctx => {
    await ctx.db.patch(match, { contactGate: "pending_admin_approval" });
    await ctx.db.patch(flow, { contactSharedAt: 123 });
  });
  expect(JSON.stringify(await t.query(api.applicantInterests.getDashboard, { sessionHash: "male-session" }))).not.toContain("f@example.com");
});
test("legacy bilateral approval retry enters pending gate without disclosure", async () => {
  const { t, match, flow, interest } = await historicalFixture();
  await t.run(ctx => ctx.db.patch(flow, { bioVisibleAt: 123 }));
  await t.mutation(api.applicantInterests.giveFinalApproval, { sessionHash: "male-session", interestId: interest, approved: true });
  expect((await t.run(ctx => ctx.db.get(match)))?.contactGate).toBe("pending_admin_approval");
  expect(await t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").collect())).toHaveLength(2);
  expect((await t.run(ctx => ctx.db.get(flow)))?.contactSharedAt).toBeUndefined();
});


for (const corruption of ["flow_order", "flow_other", "match_pair", "interest_self", "linked_self", "match_self", "match_pointer", "missing_pointer"] as const) {
  test("inconsistent " + corruption + " fails closed before mirroring, queueing, or release", async () => {
    const { t, interest, flow, match, male, female } = await historicalFixture();
    const reciprocal = await t.run(async ctx => {
      await ctx.db.patch(flow, { bioVisibleAt: 123 });
      const original = (await ctx.db.get(interest))!;
      const reciprocal = await ctx.db.insert("interests", { eventId: original.eventId, fromRegistrationId: female, toRegistrationId: male, matchId: match, source: "admin_entered", visibility: "internal_only", status: "converted_to_match", createdAt: 1, updatedAt: 1 });
      const sibling = await ctx.db.insert("interestFlows", { interestId: reciprocal, fromRegistrationId: female, toRegistrationId: male, flowStatus: "bio_review", recipientDecision: "accepted", requesterFinalApproval: "approved", recipientFinalApproval: "approved", photoDecision: "pending", bioVisibleAt: 1, createdAt: 1, updatedAt: 1 });
      const outsider = await ctx.db.insert("registrations", { name: "Other", age: 30, gender: "female", maritalStatus: "single", education: "College", job: "Engineer", phone: "5550199", email: "other@example.com", status: "approved", createdAt: 1 });
      if (corruption === "flow_order") await ctx.db.patch(sibling, { fromRegistrationId: male, toRegistrationId: female });
      if (corruption === "flow_other") await ctx.db.patch(flow, { toRegistrationId: outsider });
      if (corruption === "match_pair") await ctx.db.patch(match, { femaleRegistrationId: outsider });
      if (corruption === "interest_self") {
        await ctx.db.patch(interest, { toRegistrationId: male });
        await ctx.db.patch(flow, { toRegistrationId: male });
      }
      if (corruption === "linked_self") {
        await ctx.db.patch(reciprocal, { toRegistrationId: female });
        await ctx.db.patch(sibling, { toRegistrationId: female });
      }
      if (corruption === "match_self") await ctx.db.patch(match, { femaleRegistrationId: male });
      if (corruption === "missing_pointer") await ctx.db.patch(interest, { matchId: undefined });
      if (corruption === "match_pointer") {
        const other = await ctx.db.insert("matches", { maleRegistrationId: male, femaleRegistrationId: female, interestId: reciprocal, interestType: "man_interested", status: "reviewing", createdAt: 1, updatedAt: 1 });
        await ctx.db.patch(interest, { matchId: other });
      }
      return reciprocal;
    });
    const snapshot = () => t.run(async ctx => ({
      flows: await ctx.db.query("interestFlows").collect(),
      matches: await ctx.db.query("matches").collect(),
      events: await ctx.db.query("interestFlowEvents").collect(),
      deliveries: await ctx.db.query("femaleWorkflowDeliveries").collect(),
    }));
    const before = await snapshot();
    await expect(t.mutation(api.applicantInterests.giveFinalApproval, { sessionHash: "male-session", interestId: corruption === "missing_pointer" ? reciprocal : interest, approved: true })).rejects.toThrow(/Linked|Bio review is not open/);
    await expect(t.mutation(api.matches.updateStatus, { id: match, status: "contact_shared", adminSecret: "test-only-secret" })).rejects.toThrow(/Linked/);
    expect(await snapshot()).toEqual(before);
    expect(before.deliveries).toHaveLength(0);
    expect(before.flows.every(f => f.contactSharedAt === undefined)).toBe(true);
    for (const sessionHash of ["male-session", "female-session"]) {
      const dashboard = JSON.stringify(await t.query(api.applicantInterests.getDashboard, { sessionHash }));
      expect(dashboard).not.toContain(sessionHash === "male-session" ? "f@example.com" : "m@example.com");
    }
  });
}

for (const legacy of [false, true]) test("first disclosure survives status changes legacy=" + legacy, async () => {
  const { t, match, flow } = await historicalFixture();
  const release = { id: match, status: "contact_shared" as const, adminSecret: "test-only-secret" };
  if (legacy) await t.run(async ctx => {
    await ctx.db.patch(match, { status: "contact_shared" });
    await ctx.db.patch(flow, { flowStatus: "contact_shared", contactSharedAt: 123 });
  });
  else await t.mutation(api.matches.updateStatus, release);
  const firstFlow = await t.run(ctx => ctx.db.get(flow));
  const firstMatch = await t.run(ctx => ctx.db.get(match));
  const firstEvents = await t.run(ctx => ctx.db.query("interestFlowEvents").collect());
  const firstDeliveries = await t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").collect());
  await t.mutation(api.matches.updateStatus, { ...release, status: "paused" });
  await t.mutation(api.matches.resume, { id: match, adminSecret: "test-only-secret" });
  await t.mutation(api.matches.updateStatus, release);
  expect(await t.run(ctx => ctx.db.get(flow))).toEqual(firstFlow);
  const current = await t.run(ctx => ctx.db.get(match));
  expect(current?.adminReleasedAt).toBe(firstMatch?.adminReleasedAt);
  expect(current?.contactGate).toBe(firstMatch?.contactGate);
  expect((await t.run(ctx => ctx.db.query("interestFlowEvents").collect())).filter(e => e.eventType === "contacts_disclosed_in_portal")).toEqual(firstEvents.filter(e => e.eventType === "contacts_disclosed_in_portal"));
  expect(await t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").collect())).toEqual(firstDeliveries);
});

test("manual match cannot bypass an interest-backed pair", async () => {
  const { t, male, female, interest, match } = await historicalFixture();
  await t.run(async ctx => {
    await ctx.db.delete(match);
    await ctx.db.patch(interest, { matchId: undefined, status: "new" });
    for (const id of [male, female]) await ctx.db.patch(id, { profileCompletionStatus: "completed" });
  });
  await expect(t.mutation(api.matches.create, { adminSecret: "test-only-secret", maleRegistrationId: male, femaleRegistrationId: female })).rejects.toThrow("cannot substitute consent");
});

test("corrupt active pointer prevents final-approval auto-creation transaction", async () => {
  const { t, male, interest, flow, match } = await historicalFixture();
  await t.run(async ctx => {
    await ctx.db.patch(interest, { matchId: undefined, status: "active" });
    await ctx.db.patch(flow, { bioVisibleAt: 1, requesterFinalApproval: "pending", recipientFinalApproval: "approved" });
    await ctx.db.patch(male, { activeMatchId: match });
  });
  await expect(t.mutation(api.applicantInterests.giveFinalApproval, { sessionHash: "male-session", interestId: interest, approved: true })).rejects.toThrow("active match");
  expect((await t.run(ctx => ctx.db.get(flow)))?.requesterFinalApproval).toBe("pending");
  expect(await t.run(ctx => ctx.db.query("matches").collect())).toHaveLength(1);
});

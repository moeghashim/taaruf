import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { interestBioVisible } from "./bioVisibility";
import schema from "./schema";
import { modules } from "./test.setup";

async function fixture(female = false) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const now = Date.now();
    const base = { age: 30, maritalStatus: "single", education: "College", job: "Engineer", phone: "5550100", status: "approved" as const, createdAt: now };
    const brother = await ctx.db.insert("registrations", { ...base, name: "Brother", gender: "male", email: "brother@example.com", shareableBio: "BROTHER PRIVATE BIO" });
    const sister = await ctx.db.insert("registrations", { ...base, name: "Sister", gender: "female", email: "sister@example.com", shareableBio: "SISTER PRIVATE BIO" });
    const eventId = await ctx.db.insert("events", { title: "Synthetic", eventCode: "test", eventMonth: "2026-11", series: "test", location: "Test", startsAt: now, endsAt: now, status: "completed", maleCapacity: 1, femaleCapacity: 1, createdAt: now, updatedAt: now });
    const fromRegistrationId = female ? sister : brother;
    const toRegistrationId = female ? brother : sister;
    const interestId = await ctx.db.insert("interests", { fromRegistrationId, toRegistrationId, eventId, source: "platform_submission", status: "new", visibility: female ? "internal_only" : "admin_actionable", senderPhotoConsent: "no", ...(female ? { femaleWorkflow: { state: "awaiting_brother_review" as const, reviewTokenHash: "a".repeat(64), reviewExpiresAt: now + 86400000 } } : {}), createdAt: now, updatedAt: now });
    const flowId = await ctx.db.insert("interestFlows", { interestId, fromRegistrationId, toRegistrationId, flowStatus: "awaiting_inbound_response", recipientDecision: "pending", requesterFinalApproval: "pending", recipientFinalApproval: "pending", photoDecision: "pending", createdAt: now, updatedAt: now });
    for (const [registrationId, sessionHash] of [[sister, "sister"], [brother, "brother"]] as const) await ctx.db.insert("applicantSessions", { registrationId, sessionHash, expiresAt: now + 86400000, createdAt: now });
    return { sister, brother, interestId, flowId };
  });
  return { t, ...ids, visible: () => t.run(async ctx => interestBioVisible(ctx, (await ctx.db.get(ids.interestId))!)) };
}

for (const female of [false, true]) test(
  "initial acceptance alone unlocks both roles' bios: " + (female ? "female workflow" : "ordinary interest"), async () => {
    const f = await fixture(female);
    async function check(accepted: boolean) {
      for (const sessionHash of ["brother", "sister"]) {
        const expected = accepted ? (sessionHash === "brother" ? "SISTER PRIVATE BIO" : "BROTHER PRIVATE BIO") : null;
        for (const connectionId of [undefined, f.interestId]) {
          // Female recipient uses its dedicated review endpoint, not the private dashboard row.
          if (female && sessionHash === "brother") continue;
          const dashboard = await f.t.query(api.applicantInterests.getDashboard, { sessionHash, connectionId });
          const row = [...dashboard.inbound, ...dashboard.outbound, ...dashboard.privateDocumented].find(r => r.interestId === f.interestId)!;
          expect(row.counterparty?.shareableBio).toBe(expected);
          expect(row.counterparty?.email).toBeNull();
        }
        if (female) {
          const detail = await f.t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash, interestId: f.interestId });
          expect(detail.profile.shareableBio).toBe(expected);
          expect(detail.profile.email).toBeNull();
          for (const endpoint of [api.femaleInterestWorkflow.getDashboard]) {
            expect(JSON.stringify(await f.t.query(endpoint, { sessionHash }))).not.toContain("PRIVATE BIO");
          }
        }
      }
    }
    await check(false);
    if (female) await f.t.mutation(api.femaleInterestWorkflow.respond, { sessionHash: "brother", interestId: f.interestId, decision: "accept" });
    else await f.t.mutation(api.applicantInterests.respondToInbound, { sessionHash: "sister", interestId: f.interestId, decision: "accept" });
    await check(true);
    expect(await f.visible()).toBe(true);
  },
);

test("final approval, contact and bio timestamps, reverse and other-event acceptance cannot grant initial consent", async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    const row = (await ctx.db.get(f.interestId))!;
    const flow = (await ctx.db.get(f.flowId))!;
    await ctx.db.patch(f.flowId, { requesterFinalApproval: "approved", recipientFinalApproval: "approved", bioVisibleAt: Date.now(), contactSharedAt: Date.now(), flowStatus: "contact_shared" });
    const { _id: _eventId, _creationTime: _eventCreation, ...event } = (await ctx.db.get(row.eventId))!;
    void _eventId; void _eventCreation;
    const eventId = await ctx.db.insert("events", { ...event, eventCode: "other" });
    for (const reverse of [true, false]) {
      const { _id, _creationTime, ...data } = row;
      void _id; void _creationTime;
      const interestId = await ctx.db.insert("interests", { ...data, ...(reverse ? { fromRegistrationId: row.toRegistrationId, toRegistrationId: row.fromRegistrationId } : { eventId }) });
      const { _id: _flowId, _creationTime: _flowCreation, ...flowData } = flow;
      void _flowId; void _flowCreation;
      await ctx.db.insert("interestFlows", { ...flowData, interestId, fromRegistrationId: reverse ? row.toRegistrationId : row.fromRegistrationId, toRegistrationId: reverse ? row.fromRegistrationId : row.toRegistrationId, recipientDecision: "accepted" });
    }
  });
  expect(await f.visible()).toBe(false);
  const dashboard = await f.t.query(api.applicantInterests.getDashboard, { sessionHash: "brother", connectionId: f.interestId });
  expect(dashboard.outbound.find(r => r.interestId === f.interestId)?.counterparty?.shareableBio).toBeNull();
});

for (const mode of ["reset", "revoked", "mismatched", "missing", "closed", "pending", "invalid timestamp"] as const) test("fail closed after " + mode, async () => {
  const f = await fixture(true);
  await f.t.mutation(api.femaleInterestWorkflow.respond, { sessionHash: "brother", interestId: f.interestId, decision: "accept" });
  expect(await f.visible()).toBe(true);
  await f.t.run(async ctx => {
    const row = (await ctx.db.get(f.interestId))!;
    if (mode === "reset") await ctx.db.patch(row._id, { testReset: { at: Date.now(), actor: "admin", reason: "synthetic" } });
    if (mode === "revoked") await ctx.db.patch(row._id, { femaleWorkflow: { ...row.femaleWorkflow!, state: "revoked" } });
    if (mode === "invalid timestamp") await ctx.db.patch(row._id, { femaleWorkflow: { ...row.femaleWorkflow!, brotherAcceptedAt: 0 } });
    if (mode === "mismatched") await ctx.db.patch(f.flowId, { fromRegistrationId: f.brother, toRegistrationId: f.sister });
    if (mode === "missing") await ctx.db.delete(f.flowId);
    if (mode === "closed") await ctx.db.patch(f.flowId, { flowStatus: "closed" });
    if (mode === "pending") await ctx.db.patch(f.flowId, { recipientDecision: "pending" });
  });
  expect(await f.visible()).toBe(false);
  for (const sessionHash of ["brother", "sister"]) {
    try {
      const result = await f.t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash, interestId: f.interestId });
      expect(result.profile.shareableBio).toBeNull();
    } catch (error) {
      expect(String(error)).toMatch(/unavailable/i);
    }
  }
});

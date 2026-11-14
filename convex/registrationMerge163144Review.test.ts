import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { modules } from "./test.setup";
import { plan, snapshot, applyMerge, rollbackMerge } from "./registrationMerge163144";

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const base = { name: "Synthetic review", gender: "female" as const, age: 30, maritalStatus: "single", education: "College", job: "Test", phone: "555", paymentStatus: "paid" as const, status: "pending" as const, createdAt: 1 };
    const source = await ctx.db.insert("registrations", { ...base, email: "source@example.invalid", publicApplicantNumber: 163 });
    const target = await ctx.db.insert("registrations", { ...base, email: "target@example.invalid", publicApplicantNumber: 144 });
    const other = await ctx.db.insert("registrations", { ...base, gender: "male", email: "other@example.invalid", publicApplicantNumber: 999 });
    const eventId = await ctx.db.insert("events", { title: "Synthetic", eventCode: "review", eventMonth: "2026-11", series: "1plus1_match", location: "Test", maleCapacity: 60, femaleCapacity: 60, startsAt: 100, endsAt: 200, status: "scheduled", createdAt: 1, updatedAt: 1 });
    const interestId = await ctx.db.insert("interests", { fromRegistrationId: source, toRegistrationId: other, eventId, source: "platform_submission", status: "active", visibility: "internal_only", femaleWorkflow: { state: "private_documented" }, createdAt: 1, updatedAt: 1 });
    const flowId = await ctx.db.insert("interestFlows", { interestId, fromRegistrationId: source, toRegistrationId: other, flowStatus: "private_documented", recipientDecision: "pending", requesterFinalApproval: "pending", recipientFinalApproval: "pending", photoDecision: "pending", createdAt: 1, updatedAt: 1 });
    return { source, target, other, eventId, interestId, flowId };
  });
  return { t, ids, pair: { source: ids.source, target: ids.target } };
}

// These adversarial regression expectations intentionally fail until the unsafe cases are blocked.
test("review: rejects a live female review capability even if generic flow is private", async () => {
  const { t, ids, pair } = await fixture();
  await t.run(ctx => ctx.db.patch(ids.interestId, { femaleWorkflow: { state: "awaiting_brother_review", reviewTokenHash: "synthetic-live-capability", reviewExpiresAt: Date.now() + 100000 } }));
  expect((await t.run(ctx => plan(ctx, pair, "retain_target"))).blockers.length).toBeGreaterThan(0);
});

test("review: rejects explicit consent carried on a private generic flow", async () => {
  const { t, ids, pair } = await fixture();
  await t.run(ctx => ctx.db.patch(ids.flowId, { requesterFinalApproval: "approved", requesterExplicitFinalAt: 2 }));
  expect((await t.run(ctx => plan(ctx, pair, "retain_target"))).blockers.length).toBeGreaterThan(0);
});

test("review: rejects duplicate open interest after identity reassignment", async () => {
  const { t, ids, pair } = await fixture();
  await t.run(async ctx => {
    const interest = (await ctx.db.get(ids.interestId))!;
    const { _id, _creationTime, ...value } = interest;
    void _id; void _creationTime;
    await ctx.db.insert("interests", { ...value, fromRegistrationId: ids.target });
  });
  expect((await t.run(ctx => plan(ctx, pair, "retain_target"))).blockers.length).toBeGreaterThan(0);
});

test("review: fixed-point closure includes nested audit children and guards rollback", async () => {
  const { t, ids, pair } = await fixture();
  const audit = await t.run(ctx => ctx.db.insert("interestFlowEvents", { interestId: ids.interestId, interestFlowId: ids.flowId, actor: "system", eventType: "synthetic", createdAt: 1 }));
  const p = await t.run(ctx => plan(ctx, pair, "retain_target"));
  expect(p.state.interestFlowEvents.some(row => row._id === audit)).toBe(true);
  const result = await t.run(ctx => applyMerge(ctx, pair, { operationKey: "synthetic-review-rollback", expectedFingerprint: p.fingerprint, policy: "retain_target", authorization: "Synthetic review authorization only" }));
  await t.run(ctx => ctx.db.patch(audit, { message: "concurrent synthetic update" }));
  const before = await t.run(ctx => snapshot(ctx, pair));
  await expect(t.run(ctx => rollbackMerge(ctx, result.auditId))).rejects.toThrow("Rollback scope drift");
  expect((await t.run(ctx => snapshot(ctx, pair))).fingerprint).toBe(before.fingerprint);
});

test("review: rejects source submission photo consent instead of assigning it to target", async () => {
  const { t, ids, pair } = await fixture();
  await t.run(ctx => ctx.db.patch(ids.interestId, { senderPhotoConsent: "yes" }));
  expect((await t.run(ctx => plan(ctx, pair, "retain_target"))).blockers.length).toBeGreaterThan(0);
});

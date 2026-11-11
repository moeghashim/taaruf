import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { modules } from "./test.setup";
import { joinApprovedPair, recordPairApproval, releasePairContacts } from "./contactGate";

async function fixture(state: "revoked" | "closed" | "reset" | "active" = "revoked", crossEvent = false) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const base = { age: 30, maritalStatus: "single", education: "College", job: "Engineer", phone: "5550100", status: "approved" as const, createdAt: 1 };
    const sister = await ctx.db.insert("registrations", { ...base, name: "Sister", gender: "female", email: "sister@example.com" });
    const brother = await ctx.db.insert("registrations", { ...base, name: "Brother", gender: "male", email: "brother@example.com" });
    const event = await ctx.db.insert("events", { title: "Synthetic", eventCode: "test", eventMonth: "2026-11", series: "test", location: "Test", startsAt: 1, endsAt: 2, status: "completed", maleCapacity: 1, femaleCapacity: 1, createdAt: 1, updatedAt: 1 });
    const otherEvent = await ctx.db.insert("events", { title: "Other", eventCode: "other", eventMonth: "2026-10", series: "test", location: "Test", startsAt: 1, endsAt: 2, status: "completed", maleCapacity: 1, femaleCapacity: 1, createdAt: 1, updatedAt: 1 });
    const origin = await ctx.db.insert("interests", { fromRegistrationId: sister, toRegistrationId: brother, eventId: crossEvent ? otherEvent : event, source: "platform_submission", status: state === "closed" ? "closed" : "new", visibility: "internal_only", femaleWorkflow: { state: state === "revoked" ? "revoked" : "awaiting_sister_confirmation", brotherAcceptedAt: 10 }, ...(state === "reset" ? {testReset: {at: 15, actor: "admin", reason: "test"}} : {}), createdAt: 1, updatedAt: 10 });
    const originFlow = await ctx.db.insert("interestFlows", { interestId: origin, fromRegistrationId: sister, toRegistrationId: brother, flowStatus: "awaiting_final_approvals", recipientDecision: "accepted", requesterFinalApproval: "approved", requesterFinalApprovalAt: 11, recipientFinalApproval: "approved", recipientFinalApprovalAt: 10, photoDecision: "pending", createdAt: 1, updatedAt: 11 });
    const reverse = await ctx.db.insert("interests", { fromRegistrationId: brother, toRegistrationId: sister, eventId: event, source: "admin_entered", status: "new", visibility: "admin_actionable", createdAt: 2, updatedAt: 10 });
    const reverseFlow = await ctx.db.insert("interestFlows", { interestId: reverse, fromRegistrationId: brother, toRegistrationId: sister, flowStatus: "awaiting_final_approvals", recipientDecision: "accepted", requesterFinalApproval: "approved", requesterFinalApprovalAt: 10, recipientFinalApproval: "pending", photoDecision: "pending", createdAt: 2, updatedAt: 10 });
    await ctx.db.insert("interestFlowEvents", { interestFlowId: reverseFlow, interestId: reverse, actor: "applicant", actorRegistrationId: brother, eventType: "final_approval_given", createdAt: 10 });
    return { sister, brother, origin, originFlow, reverse, reverseFlow };
  });
  const final = (actor: "sister" | "brother", approved = true) => t.run(async ctx => recordPairApproval(ctx, (await ctx.db.get(ids.reverse))!, ids[actor], approved));
  return { t, ...ids, final };
}

for (const state of ["revoked", "closed", "reset"] as const) test(
  state + " origin cannot launder propagated brother consent", async () => {
    const f = await fixture(state);
    const before = await f.t.run(async ctx => ({origin: await ctx.db.get(f.origin), flow: await ctx.db.get(f.originFlow), reverse: await ctx.db.get(f.reverseFlow)}));
    expect(await f.final("sister")).toBeNull();
    const pending = await f.t.run(ctx => ctx.db.get(f.reverseFlow));
    expect(pending?.requesterFinalApprovalAt).toBe(10);
    expect(pending?.requesterExplicitFinalAt).toBeUndefined();
    expect(await f.t.run(ctx => ctx.db.query("matches").take(10))).toHaveLength(0);
    expect(await f.final("brother")).toBeTruthy();
    expect(await f.t.run(ctx => ctx.db.get(f.origin))).toEqual(before.origin);
    expect(await f.t.run(ctx => ctx.db.get(f.originFlow))).toEqual(before.flow);
    expect(await f.t.run(ctx => ctx.db.query("interestFlowEvents").withIndex("by_interestId", q => q.eq("interestId", f.reverse)).take(10))).toEqual(expect.arrayContaining([expect.objectContaining({eventType: "final_approval_given", createdAt: 10})]));
  });

test("genuine informed legacy reciprocal final survives historical origin", async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    await ctx.db.patch(f.reverseFlow, {requesterFinalApprovalAt: 20});
    await ctx.db.insert("interestFlowEvents", {interestId: f.reverse, interestFlowId: f.reverseFlow, actor: "applicant", actorRegistrationId: f.brother, eventType: "final_approval_given", createdAt: 20});
  });
  expect(await f.final("sister")).toBeTruthy();
});

test("different-event female history does not change ordinary male-only consent", async () => {
  const f = await fixture("revoked", true);
  expect(await f.final("sister")).toBeTruthy();
  expect((await f.t.run(ctx => ctx.db.get(f.origin)))?.matchId).toBeUndefined();
});

test("existing legacy match never authorizes newly unmatched reverse; existing history unchanged", async () => {
  const f = await fixture("active");
  const matchId = await f.t.run(async ctx => {
    const id = await ctx.db.insert("matches", {maleRegistrationId: f.brother, femaleRegistrationId: f.sister, interestId: f.origin, interestType: "mutual_interest", status: "contact_shared", initiatedBy: "interest_signal", createdAt: 12, updatedAt: 12});
    await ctx.db.patch(f.origin, {matchId: id, status: "converted_to_match"});
    await ctx.db.patch(f.originFlow, {flowStatus: "contact_shared", contactSharedAt: 12});
    return id;
  });
  const before = await f.t.run(async ctx => ({match: await ctx.db.get(matchId), origin: await ctx.db.get(f.origin), flow: await ctx.db.get(f.originFlow)}));
  expect(await f.final("sister")).toBeNull();
  expect((await f.t.run(ctx => ctx.db.get(f.reverse)))?.matchId).toBeUndefined();
  expect(await f.t.run(async ctx => ({match: await ctx.db.get(matchId), origin: await ctx.db.get(f.origin), flow: await ctx.db.get(f.originFlow)}))).toEqual(before);
  expect(await f.final("brother")).toBe(matchId);
  expect(await f.t.run(ctx => ctx.db.query("matches").take(10))).toHaveLength(1);
});

test("contradictory active final flags fail closed regardless of explicit approval elsewhere", async () => {
  const f = await fixture("active");
  await f.t.run(async ctx => {
    await ctx.db.patch(f.originFlow, {recipientFinalApproval: "declined"});
    await ctx.db.patch(f.reverseFlow, {requesterExplicitFinalAt: 20, recipientFinalApproval: "approved", recipientExplicitFinalAt: 21});
  });
  expect(await f.t.run(async ctx => joinApprovedPair(ctx, (await ctx.db.get(f.reverse))!))).toBeNull();
  expect(await f.t.run(ctx => ctx.db.query("matches").take(10))).toHaveLength(0);
});

for (const declineFirst of [true, false]) test("concurrent contradictory final actions cannot reverse terminal decision: " + declineFirst, async () => {
  const f = await fixture();
  await f.final("sister");
  const outcomes = await Promise.allSettled((declineFirst ? [false, true] : [true, false]).map(approved => f.final("brother", approved)));
  expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(outcomes.filter(r => r.status === "rejected")).toHaveLength(1);
  const flow = await f.t.run(ctx => ctx.db.get(f.reverseFlow));
  const matches = await f.t.run(ctx => ctx.db.query("matches").take(10));
  expect(matches).toHaveLength(flow?.requesterFinalApproval === "approved" ? 1 : 0);
});


test("legacy pending match remains admin-release eligible without retroactive explicit certification", async () => {
  const f = await fixture("active");
  const matchId = await f.t.run(async ctx => {
    // Exclude the unrelated unlinked reverse; preserve the original historical pair.
    await ctx.db.patch(f.reverse, {status: "closed"});
    const id = await ctx.db.insert("matches", {maleRegistrationId: f.brother, femaleRegistrationId: f.sister, interestId: f.origin, interestType: "mutual_interest", status: "reviewing", contactGate: "pending_admin_approval", initiatedBy: "interest_signal", createdAt: 12, updatedAt: 12});
    await ctx.db.patch(f.origin, {matchId: id, status: "converted_to_match"});
    return id;
  });
  const before = await f.t.run(ctx => ctx.db.get(f.originFlow));
  expect(before?.recipientExplicitFinalAt).toBeUndefined();
  expect(before?.requesterExplicitFinalAt).toBeUndefined();
  await f.t.run(async ctx => releasePairContacts(ctx, (await ctx.db.get(matchId))!));
  expect(await f.t.run(ctx => ctx.db.get(matchId))).toMatchObject({status: "contact_shared", contactGate: "contacts_released"});
  const after = await f.t.run(ctx => ctx.db.get(f.originFlow));
  expect(after?.recipientExplicitFinalAt).toBeUndefined();
  expect(after?.requesterExplicitFinalAt).toBeUndefined();
  expect(after?.recipientFinalApprovalAt).toBe(before?.recipientFinalApprovalAt);
  expect(after?.requesterFinalApprovalAt).toBe(before?.requesterFinalApprovalAt);
  expect(after?.contactSharedAt).toBeDefined();
});

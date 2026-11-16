import { expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { applicantApprovalNote } from "./contactGate";
import { api } from "./_generated/api";
async function world(reverse = false, workflow = false) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const now = Date.now(), people = [];
    for (const gender of ["male", "female"] as const) {
      const id = await ctx.db.insert("registrations", { name: "Synthetic", gender, age: 30, maritalStatus: "single", education: "College", job: "Test", email: gender + "@example.invalid", phone: "5550100", status: "approved", createdAt: now });
      people.push(id);
      await ctx.db.insert("applicantSessions", { registrationId: id, sessionHash: gender, createdAt: now, expiresAt: now + 86400000 });
    }
    const eventId = await ctx.db.insert("events", { title: "Synthetic", eventCode: "synthetic", eventMonth: "2026-11", series: "1plus1_match", location: "Test", startsAt: now, endsAt: now + 3600000, status: "completed", maleCapacity: 10, femaleCapacity: 10, createdAt: now, updatedAt: now });
    const from = people[reverse ? 1 : 0], to = people[reverse ? 0 : 1];
    const interest = await ctx.db.insert("interests", { eventId, fromRegistrationId: from, toRegistrationId: to, source: "admin_entered", status: "active", visibility: "admin_actionable", createdAt: now, updatedAt: now, ...(workflow ? { femaleWorkflow: { state: "awaiting_sister_confirmation" as const, brotherAcceptedAt: now, reviewTokenHash: "a".repeat(64), reviewExpiresAt: now + 86400000 } } : {}) });
    const flow = await ctx.db.insert("interestFlows", { interestId: interest, fromRegistrationId: from, toRegistrationId: to, flowStatus: "awaiting_final_approvals", recipientDecision: "accepted", requesterFinalApproval: "pending", recipientFinalApproval: "pending", photoDecision: "pending", createdAt: now, updatedAt: now });
    return { people, interest, flow, now };
  });
  const note = (person: number) => t.run(async ctx => applicantApprovalNote(ctx, (await ctx.db.get(ids.interest))!, ids.people[person]));
  const approve = (person: number, explicit = true) => t.run(ctx => ctx.db.patch(ids.flow, (person === (reverse ? 1 : 0)) ? { requesterFinalApproval: "approved", requesterFinalApprovalAt: ids.now, ...(explicit ? { requesterExplicitFinalAt: ids.now } : {}) } : { recipientFinalApproval: "approved", recipientFinalApprovalAt: ids.now, ...(explicit ? { recipientExplicitFinalAt: ids.now } : {}) }));
  return { t, ...ids, note, approve };
}
for (const reverse of [false, true]) for (const first of [0, 1]) test("canonical direction=" + reverse + " first=" + first, async () => {
  const w = await world(reverse); expect(await w.note(first)).toBeNull(); await w.approve(first);
  expect(await w.note(first)).toBe(first === 0 ? "awaiting_sister" : "awaiting_brother"); expect(await w.note(1-first)).toBeNull();
  await w.approve(1-first); expect(await w.note(0)).toBe("both_approved"); expect(await w.note(1)).toBe("both_approved");
  const before = await w.t.run(ctx => ctx.db.query("interestFlows").collect()); await w.note(0);
  expect(await w.t.run(ctx => ctx.db.query("interestFlows").collect())).toEqual(before);
  expect(await w.t.run(ctx => ctx.db.query("matches").collect())).toEqual([]);
  expect(await w.t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").collect())).toEqual([]);
});
test("initial acceptance is not final; list and detail projections agree", async () => {
  const w = await world(true, true); await w.approve(0, false); expect(await w.note(0)).toBeNull();
  await w.approve(1); expect(await w.note(1)).toBe("awaiting_brother");
  const list = await w.t.query(api.femaleInterestWorkflow.getDashboard, { sessionHash: "female" }); expect(list[0].approvalNote).toBe("awaiting_brother");
  const detail = await w.t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash: "female", interestId: w.interest }); expect(detail.approvalNote).toBe("awaiting_brother"); expect(detail.profile.email).toBeNull();
  await w.approve(0); expect(await w.note(0)).toBe("both_approved");
});
for (const status of ["queued", "deferred", "closed", "declined", "withdrawn"] as const) test("no claim " + status, async () => {
  const w = await world(); await w.approve(0); await w.approve(1); await w.t.run(ctx => ctx.db.patch(w.interest, { status })); expect(await w.note(0)).toBeNull();
});
for (const mode of ["alias", "reset", "archived", "restored", "unavailable", "released", "mismatch", "missing", "contradiction"]) test("fail closed " + mode, async () => {
  const w = await world(); await w.approve(0); await w.approve(1);
  await w.t.run(async ctx => {
    if (mode === "alias") await ctx.db.patch(w.interest, { canonicalInterestId: w.interest });
    if (mode === "reset") await ctx.db.patch(w.interest, { testReset: { actor: "admin", reason: "synthetic", at: w.now } });
    if (mode === "archived") await ctx.db.patch(w.people[1], { archivedAt: w.now });
    if (mode === "restored") await ctx.db.patch(w.people[1], { lastRestoredArchivedAt: w.now });
    if (mode === "released") await ctx.db.patch(w.flow, { contactSharedAt: w.now, flowStatus: "contact_shared" });
    if (mode === "mismatch") await ctx.db.patch(w.flow, { toRegistrationId: w.people[0] });
    if (mode === "missing") await ctx.db.delete(w.flow);
    if (mode === "contradiction") await ctx.db.patch(w.flow, { recipientFinalApproval: "declined" });
    if (mode === "unavailable") {
      const match = await ctx.db.insert("matches", { interestType: "mutual_interest", maleRegistrationId: w.people[0], femaleRegistrationId: w.people[1], status: "reviewing", createdAt: w.now, updatedAt: w.now }); await ctx.db.patch(w.people[0], { activeMatchId: match });
    }
  }); expect(await w.note(0)).toBeNull();
});
for (const status of ["reviewing", "paused", "closed", "declined", "contact_shared"] as const) test("linked lifecycle " + status, async () => {
  const w = await world(); await w.approve(0); await w.approve(1);
  await w.t.run(async ctx => {
    const match = await ctx.db.insert("matches", { interestType: "mutual_interest", maleRegistrationId: w.people[0], femaleRegistrationId: w.people[1], interestId: w.interest, status, contactGate: status === "contact_shared" ? "contacts_released" : "pending_admin_approval", createdAt: w.now, updatedAt: w.now }); await ctx.db.patch(w.interest, { matchId: match });
    if (status === "contact_shared") await ctx.db.patch(w.flow, { contactSharedAt: w.now, flowStatus: "contact_shared" });
  }); expect(await w.note(0)).toBe(status === "reviewing" ? "both_approved" : null);
});
for (const mode of ["withdrawn", "reset", "multiple"]) test("invalidated canonical aliases " + mode, async () => {
  const w = await world(true, true); await w.approve(0); await w.approve(1);
  await w.t.run(async ctx => {
    const original = (await ctx.db.get(w.interest))!;
    for (let n = 0; n < (mode === "multiple" ? 2 : 1); n++) {
      await ctx.db.insert("interests", { fromRegistrationId: w.people[0], toRegistrationId: w.people[1], eventId: original.eventId, source: "platform_submission", canonicalInterestId: w.interest, visibility: "internal_only", status: mode === "withdrawn" ? "withdrawn" : "active", ...(mode === "reset" ? { testReset: { actor: "admin" as const, reason: "synthetic", at: w.now } } : {}), createdAt: w.now, updatedAt: w.now });
    }
  }); expect(await w.note(0)).toBeNull();
});
test("independent reverse platform submission cannot supply final consent", async () => {
  const w = await world(); await w.approve(0);
  await w.t.run(async ctx => {
    await ctx.db.patch(w.interest, { source: "platform_submission" });
    const original = (await ctx.db.get(w.interest))!;
    const other = await ctx.db.insert("interests", { fromRegistrationId: w.people[1], toRegistrationId: w.people[0], eventId: original.eventId, source: "platform_submission", visibility: "internal_only", status: "active", createdAt: w.now, updatedAt: w.now });
    await ctx.db.insert("interestFlows", { interestId: other, fromRegistrationId: w.people[1], toRegistrationId: w.people[0], flowStatus: "awaiting_final_approvals", recipientDecision: "accepted", requesterFinalApproval: "approved", requesterExplicitFinalAt: w.now, recipientFinalApproval: "pending", photoDecision: "pending", createdAt: w.now, updatedAt: w.now });
  }); expect(await w.note(0)).toBe("awaiting_sister");
});
test("legacy non-workflow final decisions retain canonical semantics", async () => { const w = await world(); await w.approve(0, false); await w.approve(1, false); expect(await w.note(0)).toBe("both_approved"); });

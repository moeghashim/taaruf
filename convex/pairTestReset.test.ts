import { convexTest } from "convex-test";
import { expect, test, vi, afterEach } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import type { Id } from "./_generated/dataModel";
afterEach(() => vi.unstubAllEnvs());
async function fixture() {
  const t = convexTest(schema, modules);
  const data = await t.run(async ctx => {
    const registrationIds: Id<"registrations">[] = [];
    for (const gender of ["male", "female", "female"] as const) registrationIds.push(await ctx.db.insert("registrations", { name: gender === "male" ? "Synthetic Sender" : "Synthetic Recipient", gender, age: 30, maritalStatus: "single", education: "College", job: "Engineer", email: registrationIds.length + "@example.invalid", phone: "555-0100", paymentStatus: "paid", status: "approved", profileCompletionStatus: "completed", searchStatus: "active", publicApplicantNumber: registrationIds.length + 1, createdAt: 1 }));
    const [a, b, other] = registrationIds;
    const event = await ctx.db.insert("events", { title: "Synthetic event", eventCode: "synthetic", eventMonth: "2026-11", series: "1plus1_match", location: "Test", startsAt: Date.now() - 7200000, endsAt: Date.now() - 3600000, status: "completed", maleCapacity: 10, femaleCapacity: 10, interestSubmissionsEnabled: true, interestSubmissionClosesAt: Date.now() + 3600000, createdAt: 1, updatedAt: 1 });
    for (const registrationId of [a, b]) {
      await ctx.db.insert("eventRegistrations", { eventId: event, registrationId, gender: registrationId === a ? "male" : "female", registrationStatus: "approved", confirmationStatus: "confirmed", attendanceStatus: "attended", eligibilityStatus: "approved_member", checkedInAt: 1, createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("eventAttendees", { eventId: event, registrationId, addedAt: 1 });
      await ctx.db.insert("applicantSessions", { registrationId, sessionHash: "session-" + registrationId, expiresAt: Date.now() + 3600000, createdAt: 1 });
    }
    const interestIds: Id<"interests">[] = [], flowIds: Id<"interestFlows">[] = [], eventIds: Id<"interestFlowEvents">[] = [], shareIds: Id<"profileShares">[] = [];
    for (let i = 0; i < 4; i++) {
      const fromRegistrationId = i % 2 ? b : a, toRegistrationId = i % 2 ? a : b;
      const interestId = await ctx.db.insert("interests", { fromRegistrationId, toRegistrationId, eventId: event, source: "platform_submission", status: "converted_to_match", adminStatus: "matched", visibility: "admin_actionable", createdAt: i + 1, updatedAt: 1 });
      interestIds.push(interestId);
      const interestFlowId = await ctx.db.insert("interestFlows", { interestId, fromRegistrationId, toRegistrationId, flowStatus: "contact_shared", recipientDecision: "accepted", requesterFinalApproval: "approved", recipientFinalApproval: "approved", requesterFinalApprovalAt: 1, recipientFinalApprovalAt: 1, photoDecision: "approved", photoRequestedByRegistrationId: fromRegistrationId, bioVisibleAt: 1, photosVisibleAt: 1, contactSharedAt: 1, createdAt: 1, updatedAt: 1 });
      flowIds.push(interestFlowId);
      if (i < 2) eventIds.push(await ctx.db.insert("interestFlowEvents", { interestId, interestFlowId, actor: "system", eventType: "contacts_disclosed_in_portal", createdAt: 1 }));
    }
    const matchId = await ctx.db.insert("matches", { maleRegistrationId: a, femaleRegistrationId: b, interestId: interestIds[0], interestType: "mutual_interest", status: "contact_shared", createdAt: 1, updatedAt: 1 });
    for (const id of interestIds) await ctx.db.patch(id, { matchId });
    for (const id of [a, b]) await ctx.db.patch(id, { activeMatchId: matchId });
    for (let i = 0; i < 4; i++) shareIds.push(await ctx.db.insert("profileShares", { ownerRegistrationId: i % 2 ? b : a, recipientRegistrationId: i % 2 ? a : b, shareToken: "synthetic-token-" + i, includeImages: true, status: "viewed", ...(i === 0 ? {} : i === 1 ? { matchId } : { interestId: interestIds[i] }), createdAt: 1, updatedAt: 1 }));
    const unrelatedInterest = await ctx.db.insert("interests", { fromRegistrationId: a, toRegistrationId: other, eventId: event, source: "platform_submission", status: "queued", visibility: "admin_actionable", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("settings", { key: "sentinel", value: "unchanged" });
    return { scope: { registrationIds: [a, b], interestIds, flowIds, eventIds, matchIds: [matchId], shareIds }, other, event, unrelatedInterest };
  });
  const preflight = await t.query(internal.pairTestReset.preflight, { scope: data.scope });
  const args = { scope: data.scope, expectedFingerprint: preflight.fingerprint, operationKey: "synthetic-operation-1", reason: "Approved synthetic pair reset", confirmTest: true as const };
  return { t, ...data, preflight, args };
}
async function preserved(t: ReturnType<typeof convexTest>) {
  return t.run(async ctx => ({ events: await ctx.db.query("events").collect(), attendees: await ctx.db.query("eventAttendees").collect(), eventRegistrations: await ctx.db.query("eventRegistrations").collect(), settings: await ctx.db.query("settings").collect(), history: await ctx.db.query("interestFlowEvents").collect() }));
}
test("atomic exact reset, restricted snapshot, idempotent, retained history and no unrelated edits", async () => {
  const f = await fixture(); const before = await preserved(f.t);
  const unrelated = await f.t.run(ctx => ctx.db.get(f.unrelatedInterest));
  const result = await f.t.mutation(internal.pairTestReset.reset, f.args);
  expect(result.alreadyReset).toBe(false);
  expect(await f.t.mutation(internal.pairTestReset.reset, f.args)).toEqual({ ...result, alreadyReset: true });
  await expect(f.t.mutation(internal.pairTestReset.reset, { ...f.args, reason: "A different reason" })).rejects.toThrow("reused");
  expect(await preserved(f.t)).toEqual(before);
  expect(await f.t.run(ctx => ctx.db.get(f.unrelatedInterest))).toEqual(unrelated);
  const audit = await f.t.run(ctx => ctx.db.get(result.auditId));
  expect(JSON.parse(audit!.snapshot)).toEqual(f.preflight.state);
  expect(await f.t.run(ctx => ctx.db.query("pairTestResetAudits").collect())).toHaveLength(1);
  for (const original of f.preflight.state.registrations) { const { activeMatchId, ...rest } = original; void activeMatchId; expect(await f.t.run(ctx => ctx.db.get(original._id))).toEqual(rest); }
  for (const id of f.scope.interestIds) expect(await f.t.run(ctx => ctx.db.get(id))).toMatchObject({ status: "closed", testReset: { actor: "admin" } });
  for (const id of f.scope.flowIds) {
    const flow = await f.t.run(ctx => ctx.db.get(id));
    expect(flow).toMatchObject({ flowStatus: "closed", photoDecision: "pending", requesterFinalApproval: "pending", recipientFinalApproval: "pending" });
    for (const key of ["contactSharedAt", "photosVisibleAt", "bioVisibleAt", "photoRequestedByRegistrationId", "requesterFinalApprovalAt", "recipientFinalApprovalAt"] as const) expect(flow![key]).toBeUndefined();
  }
  expect(await f.t.run(ctx => ctx.db.get(f.scope.matchIds[0]))).toMatchObject({ status: "closed", testResetAt: expect.any(Number) });
});
test("stale grants, actions and reads cannot revive reset history; fresh submission works", async () => {
  const f = await fixture(); await f.t.mutation(internal.pairTestReset.reset, f.args);
  for (let i = 0; i < 4; i++) {
    expect(await f.t.query(api.profileShares.getByShareToken, { shareToken: "synthetic-token-" + i })).toBeNull();
    await expect(f.t.mutation(api.profileShares.markViewed, { shareToken: "synthetic-token-" + i })).rejects.toThrow();
  }
  expect(await f.t.query(api.profileShares.getAll, {})).toEqual([]);
  const id = f.scope.matchIds[0];
  expect(await f.t.query(api.matches.getById, { id })).toBeNull();
  expect(await f.t.query(api.matches.getAll, {})).toEqual([]);
  expect((await f.t.query(api.interests.getAll, {})).every(i => i.match === null)).toBe(true);
  const linked = await f.t.query(api.interests.getByRegistration, { registrationId: f.scope.registrationIds[0] });
  expect([...linked.inbound, ...linked.outbound].every(i => i.match === null)).toBe(true);
  await expect(f.t.mutation(api.matches.updateStatus, { id, status: "new" })).rejects.toThrow("read-only");
  await expect(f.t.mutation(api.matches.markNotificationSent, { id, sent: true })).rejects.toThrow("read-only");
  await expect(f.t.mutation(api.matches.markContactSharedNotificationSent, { id, sent: true })).rejects.toThrow("read-only");
  const [a,b] = f.scope.registrationIds;
  await expect(f.t.mutation(api.matches.resetPair, { registrationAId: a, registrationBId: b })).rejects.toThrow("read-only");
  await expect(f.t.mutation(api.matches.deletePairConnection, { registrationAId: a, registrationBId: b })).rejects.toThrow("retained");
  await expect(f.t.mutation(api.profileShares.create, { ownerRegistrationId: a, recipientRegistrationId: b, matchId: id, includeImages: false, shareToken: "stale" })).rejects.toThrow("unavailable");
  const sessionHash = "session-" + a;
  const dashboard = await f.t.query(api.applicantInterests.getDashboard, { sessionHash });
  expect(dashboard.outbound.every(i => !f.scope.interestIds.includes(i.interestId))).toBe(true);
  const fresh = await f.t.mutation(api.applicantInterests.submitInterestNumber, { sessionHash, applicantNumber: 2, applicantName: "Synthetic", expectedEventId: f.event });
  expect(f.scope.interestIds).not.toContain(fresh.interestId);
  await expect(f.t.mutation(api.applicantInterests.submitInterestNumber, { sessionHash, applicantNumber: 2, applicantName: "Synthetic", expectedEventId: f.event })).rejects.toThrow("already submitted");
});
for (const kind of ["profile", "flow", "share", "event", "extra", "foreignShare", "foreignPointer", "unrelatedPointer", "foreignRefs", "missingMatch"] as const) test("fail-closed drift/foreign scope: " + kind, async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    if (kind === "missingMatch") await ctx.db.delete(f.scope.matchIds[0]);
    if (kind === "profile") await ctx.db.patch(f.scope.registrationIds[0], { phone: "changed" });
    if (kind === "flow") await ctx.db.patch(f.scope.flowIds[0], { photoDecision: "declined" });
    if (kind === "share") await ctx.db.patch(f.scope.shareIds[0], { shareToken: "changed" });
    if (kind === "event") await ctx.db.patch(f.scope.eventIds[0], { message: "changed" });
    if (kind === "extra") await ctx.db.insert("interestFlowEvents", { interestId: f.scope.interestIds[0], interestFlowId: f.scope.flowIds[0], actor: "system", eventType: "new", createdAt: 2 });
    if (kind === "foreignShare") await ctx.db.patch(f.scope.shareIds[0], { recipientRegistrationId: f.other, matchId: f.scope.matchIds[0] });
    if (kind === "foreignPointer") await ctx.db.patch(f.other, { activeMatchId: f.scope.matchIds[0] });
    if (kind === "unrelatedPointer") { const matchId = await ctx.db.insert("matches", { maleRegistrationId: f.scope.registrationIds[0], femaleRegistrationId: f.other, interestType: "admin_suggested", status: "contact_shared", createdAt: 2, updatedAt: 2 }); await ctx.db.patch(f.scope.registrationIds[0], { activeMatchId: matchId }); }
  });
  if (kind === "foreignRefs") f.args.scope.interestIds[0] = f.unrelatedInterest;
  const before = await f.t.run(async ctx => ({ interests: await ctx.db.query("interests").collect(), flows: await ctx.db.query("interestFlows").collect(), shares: await ctx.db.query("profileShares").collect(), registrations: await ctx.db.query("registrations").collect(), matches: await ctx.db.query("matches").collect() }));
  await expect(f.t.mutation(internal.pairTestReset.reset, f.args)).rejects.toThrow();
  expect(await f.t.run(async ctx => ({ interests: await ctx.db.query("interests").collect(), flows: await ctx.db.query("interestFlows").collect(), shares: await ctx.db.query("profileShares").collect(), registrations: await ctx.db.query("registrations").collect(), matches: await ctx.db.query("matches").collect() }))).toEqual(before);
  expect(await f.t.run(ctx => ctx.db.query("pairTestResetAudits").collect())).toEqual([]);
});

test("reduced approved scope after prior pair reset with full historical audit", async () => {
 const f = await fixture();
 await f.t.run(async ctx => {
   await ctx.db.delete(f.scope.matchIds[0]);
   for (const id of f.scope.registrationIds) await ctx.db.patch(id, {activeMatchId: undefined});
   for (const id of f.scope.interestIds) await ctx.db.patch(id, {matchId: undefined, status: "closed"});
   for (const id of f.scope.shareIds) await ctx.db.patch(id, {matchId: undefined});
   for (let i=0;i<17;i++) f.scope.eventIds.push(await ctx.db.insert("interestFlowEvents",{interestId:f.scope.interestIds[i%4],interestFlowId:f.scope.flowIds[i%4],actor:"admin",eventType:"pair_reset",createdAt:2}));
 });
 f.scope.matchIds=[];
 const pre=await f.t.query(internal.pairTestReset.preflight,{scope:f.scope});
 const before=await preserved(f.t);
 const args={...f.args,scope:f.scope,expectedFingerprint:pre.fingerprint};
 expect((await f.t.mutation(internal.pairTestReset.reset,args)).alreadyReset).toBe(false);
 expect((await f.t.mutation(internal.pairTestReset.reset,args)).alreadyReset).toBe(true);
 expect(await preserved(f.t)).toEqual(before);
 for(const r of pre.state.registrations) expect(await f.t.run(ctx=>ctx.db.get(r._id))).toEqual(r);
});

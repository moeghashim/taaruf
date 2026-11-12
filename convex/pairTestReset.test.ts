process.env.ATTENDANCE_ADMIN_SECRET ??= "synthetic-admin-test";
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
  expect(await f.t.query(api.profileShares.getAll, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!, })).toEqual([]);
  const id = f.scope.matchIds[0];
  expect(await f.t.query(api.matches.getById, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,  id })).toBeNull();
  expect(await f.t.query(api.matches.getAll, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!, })).toEqual([]);
  expect((await f.t.query(api.interests.getAll, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!, })).every(i => i.match === null)).toBe(true);
  const linked = await f.t.query(api.interests.getByRegistration, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,  registrationId: f.scope.registrationIds[0] });
  expect([...linked.inbound, ...linked.outbound].every(i => i.match === null)).toBe(true);
  await expect(f.t.mutation(api.matches.updateStatus, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,  id, status: "new" })).rejects.toThrow("read-only");
  await expect(f.t.mutation(api.matches.markNotificationSent, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,  id, sent: true })).rejects.toThrow("read-only");
  await expect(f.t.mutation(api.matches.markContactSharedNotificationSent, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,  id, sent: true })).rejects.toThrow("read-only");
  const [a,b] = f.scope.registrationIds;
  await expect(f.t.mutation(api.matches.resetPair, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,  registrationAId: a, registrationBId: b })).rejects.toThrow("read-only");
  await expect(f.t.mutation(api.matches.deletePairConnection, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,  registrationAId: a, registrationBId: b })).rejects.toThrow("retained");
  await expect(f.t.mutation(api.profileShares.create, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,  ownerRegistrationId: a, recipientRegistrationId: b, matchId: id, includeImages: false, shareToken: "stale" })).rejects.toThrow("unavailable");
  const sessionHash = "session-" + a;
  const dashboard = await f.t.query(api.applicantInterests.getDashboard, { sessionHash });
  expect(dashboard.outbound.every(i => !f.scope.interestIds.includes(i.interestId))).toBe(true);
  const fresh = await f.t.mutation(api.applicantInterests.submitInterestNumber, { photoConsent: "no", sessionHash, applicantNumber: 2, applicantName: "Synthetic", expectedEventId: f.event });
  expect(f.scope.interestIds).not.toContain(fresh.interestId);
  expect((await f.t.mutation(api.applicantInterests.submitInterestNumber, { photoConsent: "no", sessionHash, applicantNumber: 2, applicantName: "Synthetic", expectedEventId: f.event })).interestId).toBe(fresh.interestId);
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

// Independent regression coverage for retained historical orphan workflows.
async function addHistoricalOrphans(f: Awaited<ReturnType<typeof fixture>>) {
  return f.t.run(async ctx => {
    const ids: Id<"interestFlows">[] = [];
    for (let i = 0; i < 7; i++) {
      const interestId = await ctx.db.insert("interests", { fromRegistrationId: f.scope.registrationIds[0], toRegistrationId: f.scope.registrationIds[1], eventId: f.event, source: "platform_submission", status: "closed", visibility: "admin_actionable", createdAt: 1, updatedAt: 1 });
      const interestFlowId = await ctx.db.insert("interestFlows", { interestId, fromRegistrationId: f.scope.registrationIds[0], toRegistrationId: f.scope.registrationIds[1], flowStatus: i % 2 ? "declined" : "closed", recipientDecision: "declined", requesterFinalApproval: "pending", recipientFinalApproval: "pending", photoDecision: "pending", closedReason: "historical sentinel", createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("interestFlowEvents", { interestId, interestFlowId, actor: "admin", eventType: "historical_sentinel", message: "retain verbatim", createdAt: 1 });
      await ctx.db.delete(interestId);
      ids.push(interestFlowId);
    }
    await ctx.db.insert("pairTestResetAudits", { operationKey: "historical-sentinel", request: "historical request", snapshot: "historical snapshot", createdAt: 1 });
    return ids;
  });
}
async function allResetRows(t: ReturnType<typeof convexTest>) {
  return t.run(async ctx => ({
    registrations: await ctx.db.query("registrations").collect(), interests: await ctx.db.query("interests").collect(), flows: await ctx.db.query("interestFlows").collect(), events: await ctx.db.query("interestFlowEvents").collect(), shares: await ctx.db.query("profileShares").collect(), matches: await ctx.db.query("matches").collect(), audits: await ctx.db.query("pairTestResetAudits").collect(),
  }));
}
test("seven terminal orphans and their historical audits remain byte-for-byte equivalent", async () => {
  const f = await fixture(); const ids = await addHistoricalOrphans(f);
  const pre = await f.t.query(internal.pairTestReset.preflight, { scope: f.scope });
  const before = await allResetRows(f.t);
  expect(pre.state.orphanFlows).toHaveLength(7);
  expect(pre.state.flows.map(r => r._id)).toEqual(f.scope.flowIds);
  expect(JSON.parse(pre.fingerprint).orphanFlows).toEqual(before.flows.filter(r => ids.includes(r._id)));
  await f.t.mutation(internal.pairTestReset.reset, { ...f.args, expectedFingerprint: pre.fingerprint });
  const after = await allResetRows(f.t);
  expect(after.flows.filter(r => ids.includes(r._id))).toEqual(before.flows.filter(r => ids.includes(r._id)));
  expect(after.events).toEqual(before.events);
  expect(after.audits.filter(r => r.operationKey === "historical-sentinel")).toEqual(before.audits);
  expect(after.flows.filter(r => r.closedReason === "admin_pair_test_reset")).toHaveLength(4);
});
for (const kind of ["active", "linked", "bioDrift", "photo", "contact", "drift", "added", "deleted"] as const) test("orphan guard fails atomically: " + kind, async () => {
  const f = await fixture(); const ids = await addHistoricalOrphans(f);
  const pre = await f.t.query(internal.pairTestReset.preflight, { scope: f.scope });
  await f.t.run(async ctx => {
    if (kind === "active") await ctx.db.patch(ids[0], { flowStatus: "contact_shared" });
    if (kind === "linked") await ctx.db.patch(ids[0], { interestId: f.unrelatedInterest });
    if (kind === "bioDrift") await ctx.db.patch(ids[0], { bioVisibleAt: 123 });
    if (kind === "photo") await ctx.db.patch(ids[0], { photosVisibleAt: 123 });
    if (kind === "contact") await ctx.db.patch(ids[0], { contactSharedAt: 123 });
    if (kind === "drift") await ctx.db.patch(ids[0], { closedReason: "changed historical metadata" });
    if (kind === "deleted") await ctx.db.delete(ids[0]);
    if (kind === "added") { const row = (await ctx.db.get(ids[0]))!; const { _id, _creationTime, ...doc } = row; void _id; void _creationTime; await ctx.db.insert("interestFlows", doc); }
  });
  const before = await allResetRows(f.t);
  if (["active", "linked", "photo", "contact"].includes(kind)) await expect(f.t.query(internal.pairTestReset.preflight, { scope: f.scope })).rejects.toThrow("Unexpected active or linked historical workflow");
  await expect(f.t.mutation(internal.pairTestReset.reset, { ...f.args, expectedFingerprint: pre.fingerprint })).rejects.toThrow();
  expect(await allResetRows(f.t)).toEqual(before);
});


test("deleted-parent legacy bios cannot surface or enable applicant actions and survive exact reset unchanged", async () => {
  const f = await fixture(); const ids = await addHistoricalOrphans(f);
  await f.t.run(async ctx => {
    for (const id of ids.slice(0, 3)) await ctx.db.patch(id, { bioVisibleAt: 123, closedReason: "admin_reset_pair" });
  });
  const before = await allResetRows(f.t);
  const orphans = before.flows.filter(row => ids.includes(row._id));
  expect(orphans.filter(row => row.bioVisibleAt === 123)).toHaveLength(3);
  const assertInert = async () => {
    for (const registrationId of f.scope.registrationIds) {
      const sessionHash = "session-" + registrationId;
      const dashboard = await f.t.query(api.applicantInterests.getDashboard, { sessionHash });
      const eligibility = await f.t.query(api.applicantInterests.getInterestEligibility, { sessionHash });
      const surfaced = [...dashboard.inbound, ...dashboard.outbound, ...dashboard.privateDocumented, ...dashboard.interestSubmissions, ...eligibility.interestSubmissions];
      for (const orphan of orphans) {
        expect(surfaced.some(row => row.interestId === orphan.interestId)).toBe(false);
        expect(await f.t.run(ctx => ctx.db.get(orphan.interestId))).toBeNull();
        const args = { sessionHash, interestId: orphan.interestId };
        for (const decision of ["accept", "decline", "keep_open"] as const) await expect(f.t.mutation(api.applicantInterests.respondToInbound, { ...args, decision })).rejects.toThrow("Interest not found");
        for (const approved of [true, false]) await expect(f.t.mutation(api.applicantInterests.giveFinalApproval, { ...args, approved })).rejects.toThrow("Interest not found");
        await expect(f.t.mutation(api.applicantInterests.withdrawOutbound, args)).rejects.toThrow("Interest not found");
        await expect(f.t.mutation(api.applicantInterests.closeConnection, args)).rejects.toThrow("Interest not found");
      }
    }
  };
  await assertInert();
  expect(await allResetRows(f.t)).toEqual(before);
  const pre = await f.t.query(internal.pairTestReset.preflight, { scope: f.scope });
  expect(JSON.parse(pre.fingerprint).orphanFlows).toEqual(orphans);
  await f.t.mutation(internal.pairTestReset.reset, { ...f.args, expectedFingerprint: pre.fingerprint });
  await assertInert();
  const after = await allResetRows(f.t);
  expect(after.flows.filter(row => ids.includes(row._id))).toEqual(orphans);
  expect(after.events).toEqual(before.events);
  expect(after.audits.filter(row => row.operationKey === "historical-sentinel")).toEqual(before.audits);
  expect(after.interests.filter(row => row.testReset)).toHaveLength(4);
  expect(after.flows.filter(row => row.closedReason === "admin_pair_test_reset")).toHaveLength(4);
  expect(after.shares.filter(row => row.status === "closed" && !row.includeImages && row.revokedAt)).toHaveLength(4);
});

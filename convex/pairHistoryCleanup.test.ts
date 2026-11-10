import { convexTest } from "convex-test";
import { makeFunctionReference, type FunctionArgs, type FunctionReturnType, type ApiFromModules } from "convex/server";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import type * as cleanup from "./pairHistoryCleanup";
import schema from "./schema";
import { modules } from "./test.setup";

// Keep generated API files untouched while this restricted module is introduced.
const preflight = makeFunctionReference<"query", FunctionArgs<ApiFromModules<{ cleanup: typeof cleanup }>["cleanup"]["preflight"]>, FunctionReturnType<ApiFromModules<{ cleanup: typeof cleanup }>["cleanup"]["preflight"]>>("pairHistoryCleanup:preflight");
const execute = makeFunctionReference<"mutation", FunctionArgs<ApiFromModules<{ cleanup: typeof cleanup }>["cleanup"]["execute"]>, FunctionReturnType<ApiFromModules<{ cleanup: typeof cleanup }>["cleanup"]["execute"]>>("pairHistoryCleanup:execute");
type Harness = ReturnType<typeof convexTest<typeof schema.tables>>;
async function allRows(t: Harness) {
  return t.run(async ctx => {
    const rows: Record<string, unknown> = {};
    for (const table of Object.keys(schema.tables) as TableNames[]) rows[table] = await ctx.db.query(table).collect();
    rows._scheduled_functions = await ctx.db.system.query("_scheduled_functions").collect();
    rows._storage = await ctx.db.system.query("_storage").collect();
    return rows;
  });
}
async function fixture() {
  const t = convexTest(schema, modules);
  const data = await t.run(async ctx => {
    const ids: Id<"registrations">[] = [];
    for (const number of [219, 220, 221]) ids.push(await ctx.db.insert("registrations", { name: "Synthetic " + number, publicApplicantNumber: number, applicantNumber: 999, age: 30, gender: number === 219 ? "male" : "female", maritalStatus: "single", education: "College", job: "Engineer", email: number + "@example.invalid", phone: "555", status: "approved", paymentStatus: "paid", profileCompletionStatus: "completed", createdAt: 1 }));
    const [a, b, other] = ids;
    const event = await ctx.db.insert("events", { title: "Synthetic", eventCode: "synthetic", eventMonth: "2026-11", series: "1plus1_match", location: "Test", startsAt: 1, endsAt: 2, status: "completed", maleCapacity: 10, femaleCapacity: 10, interestSubmissionsEnabled: true, createdAt: 1, updatedAt: 1 });
    for (const registrationId of [a, b]) {
      const roster = await ctx.db.insert("eventRegistrations", { eventId: event, registrationId, gender: registrationId === a ? "male" : "female", registrationStatus: "approved", confirmationStatus: "confirmed", attendanceStatus: "attended", eligibilityStatus: "approved_member", createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("eventAttendees", { eventId: event, registrationId, addedAt: 1 });
      await ctx.db.insert("eventRegistrationEmails", { eventRegistrationId: roster, eventId: event, registrationId, kind: "approved", sentAt: 1, createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("eventWaitlistEntries", { eventId: event, registrationId, gender: registrationId === a ? "male" : "female", status: "removed", createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("applicantSessions", { registrationId, sessionHash: "session-" + registrationId, expiresAt: Date.now() + 86400000, createdAt: 1 });
      await ctx.db.insert("applicantLoginTokens", { registrationId, tokenHash: "login-" + registrationId, expiresAt: Date.now() + 86400000, createdAt: 1 });
    }
    const storageId = await ctx.storage.store(new Blob(["synthetic photo"]));
    await ctx.db.insert("photoUploads", { storageId, registrationId: a, createdAt: 1 });
    await ctx.db.patch(a, { imageStorageIds: [storageId] });
    await ctx.db.insert("checkoutLinks", { stripeSessionId: "synthetic-checkout", registrationId: a, createdAt: 1 });
    await ctx.db.insert("receiptDeliveries", { key: "receipt", token: "receipt-token", leaseUntil: 1, firstAttemptAt: 1, name: "Synthetic", email: "receipt@example.invalid" });
    await ctx.db.insert("settings", { key: "publicApplicantNumberHighWaterMark", value: "999" });
    for (let i = 0; i < 4; i++) await ctx.db.insert("pairTestResetAudits", { operationKey: "old-audit-" + i, request: "old request " + i, snapshot: "old snapshot " + i, createdAt: i });
    const interests: Id<"interests">[] = [], flows: Id<"interestFlows">[] = [], history: Id<"interestFlowEvents">[] = [], shares: Id<"profileShares">[] = [];
    for (let i = 0; i < 14; i++) {
      const fromRegistrationId = i % 2 ? b : a, toRegistrationId = i % 2 ? a : b;
      const interestId = await ctx.db.insert("interests", { fromRegistrationId, toRegistrationId, eventId: event, source: "platform_submission", status: "closed", visibility: "admin_actionable", createdAt: i, updatedAt: 1 });
      interests.push(interestId);
      flows.push(await ctx.db.insert("interestFlows", { interestId, fromRegistrationId, toRegistrationId, flowStatus: "closed", recipientDecision: "declined", requesterFinalApproval: "pending", recipientFinalApproval: "pending", photoDecision: "pending", bioVisibleAt: 1, createdAt: 1, updatedAt: 1 }));
      if (i >= 7) await ctx.db.delete(interestId);
    }
    for (let i = 0; i < 57; i++) history.push(await ctx.db.insert("interestFlowEvents", { interestId: interests[i % 14], interestFlowId: flows[i % 14], actor: "admin", eventType: "historical-reset", message: "Synthetic historical evidence", createdAt: i }));
    for (let i = 0; i < 6; i++) shares.push(await ctx.db.insert("profileShares", { ownerRegistrationId: i % 2 ? b : a, recipientRegistrationId: i % 2 ? a : b, ...(i ? { interestId: interests[i === 5 ? 12 : i] } : {}), shareToken: "share-" + i, includeImages: true, status: "shared", createdAt: 1, updatedAt: 1 }));
    // Unrelated rows sharing one participant must survive, not merely other pairs.
    const foreignInterest = await ctx.db.insert("interests", { fromRegistrationId: a, toRegistrationId: other, eventId: event, source: "admin_entered", status: "closed", visibility: "admin_actionable", createdAt: 1, updatedAt: 1 });
    const foreignFlow = await ctx.db.insert("interestFlows", { interestId: foreignInterest, fromRegistrationId: a, toRegistrationId: other, flowStatus: "closed", recipientDecision: "pending", requesterFinalApproval: "pending", recipientFinalApproval: "pending", photoDecision: "pending", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("interestFlowEvents", { interestId: foreignInterest, interestFlowId: foreignFlow, actor: "applicant", actorRegistrationId: a, eventType: "unrelated", createdAt: 1 });
    const foreignMatch = await ctx.db.insert("matches", { maleRegistrationId: a, femaleRegistrationId: other, interestId: foreignInterest, interestType: "admin_suggested", status: "closed", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("profileShares", { ownerRegistrationId: a, recipientRegistrationId: other, interestId: foreignInterest, shareToken: "foreign-share", status: "closed", includeImages: false, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("femaleWorkflowDeliveries", { interestId: foreignInterest, recipientId: other, kind: "pending_review", key: "unrelated-delivery", status: "sending", attempts: 1, nextAttemptAt: 0, leaseUntil: Date.now() + 10000, createdAt: 1 });
    return { scope: { applicant219: a, applicant220: b }, a, b, other, event, interests, flows, history, shares, foreignInterest, foreignFlow, foreignMatch };
  });
  const pre = await t.query(preflight, data.scope);
  const args = { ...data.scope, expectedFingerprint: pre.fingerprint, expectedManifest: JSON.stringify(pre.manifest), operationKey: "synthetic-cleanup-219-220", reason: "Approved synthetic full pair history cleanup", confirmAllPairHistory: true as const };
  return { t, ...data, pre, args };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function assertRejectedWithoutWrites(f: Fixture, args = f.args, error?: string) {
  const before = await allRows(f.t);
  await expect(f.t.mutation(execute, args)).rejects.toThrow(error);
  expect(await allRows(f.t)).toEqual(before);
}

test("exact 7/14/57/6/0 manifest deletes both directions and seven deleted parents; all other tables and four audits preserved", async () => {
  const f = await fixture();
  expect(f.pre.total).toBe(84);
  expect(f.pre.historicalInterestIds).toEqual(f.interests.slice(7).sort());
  for (const [table, ids] of Object.entries({ interests: f.interests.slice(0, 7), interestFlows: f.flows, interestFlowEvents: f.history, profileShares: f.shares, matches: [], femaleWorkflowDeliveries: [] })) expect(f.pre.manifest[table]).toEqual({ count: ids.length, ids: [...ids].sort() });
  expect(f.pre.audits).toHaveLength(4);
  expect(f.pre.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(await f.t.query(preflight, f.scope)).toEqual(f.pre);
  const before = await allRows(f.t);
  const result = await f.t.mutation(execute, f.args);
  const after = await allRows(f.t);
  for (const table of Object.keys(before)) {
    if (table === "pairTestResetAudits") continue;
    const deleted = new Set<string>(f.pre.manifest[table]?.ids ?? []);
    expect(after[table], table).toEqual((before[table] as { _id: string }[]).filter(row => !deleted.has(row._id)));
  }
  const audits = after.pairTestResetAudits as Doc<"pairTestResetAudits">[];
  expect(audits.filter(row => row._id !== result.auditId)).toEqual(before.pairTestResetAudits);
  expect(audits).toHaveLength(5);
  const audit = audits.find(row => row._id === result.auditId)!;
  expect(JSON.parse(audit.snapshot)).toEqual(f.pre);
  expect(JSON.parse(audit.request)).toMatchObject(f.args);
  expect((await f.t.query(preflight, f.scope)).total).toBe(0);
  expect(await f.t.mutation(execute, f.args)).toEqual({ ...result, alreadyExecuted: true });
  expect(await allRows(f.t)).toEqual(after);
  await assertRejectedWithoutWrites(f, { ...f.args, reason: "Different reviewed reason" }, "reused");
  const empty = await f.t.query(preflight, f.scope);
  await assertRejectedWithoutWrites(f, { ...f.args, operationKey: "another-operation", expectedFingerprint: empty.fingerprint, expectedManifest: JSON.stringify(empty.manifest) }, "already empty");
});

test("cleanup restores both applicants' three event submission slots without changing registrations", async () => {
  const f = await fixture();
  for (const id of [f.a, f.b]) expect((await f.t.query(api.applicantInterests.getInterestEligibility, { sessionHash: "session-" + id })).interestSubmissions).toHaveLength(3);
  await f.t.mutation(execute, f.args);
  for (const id of [f.a, f.b]) expect(await f.t.query(api.applicantInterests.getInterestEligibility, { sessionHash: "session-" + id })).toMatchObject({ interestSubmissions: [], interestSubmissionLimit: 3, canSubmitInterest: true, interestSubmissionEventId: f.event });
  const submitted = await f.t.mutation(api.applicantInterests.submitInterestNumber, { sessionHash: "session-" + f.a, applicantNumber: 220, applicantName: "Synthetic", expectedEventId: f.event, photoConsent: "no" });
  expect(f.interests).not.toContain(submitted.interestId);
  expect((await f.t.query(api.applicantInterests.getInterestEligibility, { sessionHash: "session-" + f.a })).interestSubmissions).toHaveLength(1);
});

test("all old share capabilities and review token become unusable and cannot revive deleted rows", async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    await ctx.db.patch(f.interests[1], { status: "active", femaleWorkflow: { state: "awaiting_brother_review", reviewTokenHash: "a".repeat(64), reviewExpiresAt: Date.now() + 100000 } });
    await ctx.db.patch(f.flows[1], { flowStatus: "bio_review" });
  });
  const review = { interestId: f.interests[1], sessionHash: "session-" + f.a, reviewTokenHash: "a".repeat(64) };
  await expect(f.t.query(api.femaleInterestWorkflow.getReviewAccess, review)).resolves.toHaveProperty("interestId");
  const pre = await f.t.query(preflight, f.scope);
  await f.t.mutation(execute, { ...f.args, expectedFingerprint: pre.fingerprint, expectedManifest: JSON.stringify(pre.manifest) });
  const before = await allRows(f.t);
  for (let i = 0; i < 6; i++) {
    expect(await f.t.query(api.profileShares.getByShareToken, { shareToken: "share-" + i })).toBeNull();
    await expect(f.t.mutation(api.profileShares.markViewed, { shareToken: "share-" + i })).rejects.toThrow();
  }
  await expect(f.t.query(api.femaleInterestWorkflow.getReviewAccess, review)).rejects.toThrow("unavailable");
  await expect(f.t.mutation(api.femaleInterestWorkflow.respond, { ...review, decision: "accept" })).rejects.toThrow("unavailable");
  await expect(f.t.mutation(api.applicantInterests.withdrawOutbound, { interestId: f.interests[0], sessionHash: "session-" + f.a })).rejects.toThrow("Interest not found");
  expect(await allRows(f.t)).toEqual(before);
});

for (const kind of ["interest", "flow", "history", "share", "registration", "event", "roster", "attendee", "audit", "added", "deleted"] as const) test("stale preflight rolls back without any audit or deletion: " + kind, async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    if (kind === "interest") await ctx.db.patch(f.interests[0], { notes: "changed" });
    if (kind === "flow") await ctx.db.patch(f.flows[8], { bioVisibleAt: 99 });
    if (kind === "history") await ctx.db.patch(f.history[0], { message: "changed" });
    if (kind === "share") await ctx.db.patch(f.shares[0], { shareToken: "changed" });
    if (kind === "registration") await ctx.db.patch(f.other, { phone: "changed" });
    if (kind === "event") await ctx.db.patch(f.event, { title: "changed" });
    if (kind === "roster") await ctx.db.patch((await ctx.db.query("eventRegistrations").first())!._id, { adminNotes: "changed" });
    if (kind === "attendee") await ctx.db.patch((await ctx.db.query("eventAttendees").first())!._id, { addedAt: 99 });
    if (kind === "audit") await ctx.db.patch((await ctx.db.query("pairTestResetAudits").first())!._id, { snapshot: "changed" });
    if (kind === "added") await ctx.db.insert("interestFlowEvents", { interestId: f.interests[0], interestFlowId: f.flows[0], actor: "system", eventType: "new", createdAt: 1 });
    if (kind === "deleted") await ctx.db.delete(f.shares[0]);
  });
  await assertRejectedWithoutWrites(f, f.args, "Preflight drift");
});

test("fingerprint, exact manifest and bounded reviewed request are mandatory", async () => {
  const f = await fixture();
  for (const patch of [{ expectedFingerprint: "0".repeat(64) }, { expectedManifest: "{}" }, { expectedManifest: f.args.expectedManifest.slice(0, -1) }, { expectedFingerprint: "invalid" }, { operationKey: "short" }, { reason: "short" }, { reason: "x".repeat(501) }, { expectedManifest: "x".repeat(100001) }]) await assertRejectedWithoutWrites(f, { ...f.args, ...patch });
});

test("manifest roundtrip accepts reordered keys and whitespace but replay binds exact request", async () => {
  const f = await fixture();
  const reordered = Object.fromEntries(Object.entries(JSON.parse(f.args.expectedManifest)).reverse());
  const args = { ...f.args, expectedManifest: JSON.stringify(reordered, null, 2) + " " };
  const result = await f.t.mutation(execute, args);
  expect(await f.t.mutation(execute, args)).toEqual({ ...result, alreadyExecuted: true });
  await expect(f.t.mutation(execute, f.args)).rejects.toThrow("reused");
});

for (const kind of ["swapped", "same", "other", "legacy-only", "missing"] as const) test("permanent 219/220 restriction rejects " + kind, async () => {
  const f = await fixture();
  let scope = f.scope;
  if (kind === "swapped") scope = { applicant219: f.b, applicant220: f.a };
  if (kind === "same") scope = { applicant219: f.a, applicant220: f.a };
  if (kind === "other") scope = { applicant219: f.a, applicant220: f.other };
  if (kind === "legacy-only") await f.t.run(ctx => ctx.db.patch(f.a, { publicApplicantNumber: undefined, applicantNumber: 219 }));
  if (kind === "missing") await f.t.run(ctx => ctx.db.delete(f.b));
  await expect(f.t.query(preflight, scope)).rejects.toThrow("Exact permanent applicants");
  await assertRejectedWithoutWrites(f, { ...f.args, ...scope }, "Exact permanent applicants");
});

for (const kind of ["flow-parent", "flow-direction", "photo-actor", "foreign-flow", "foreign-share", "foreign-match", "missing-match", "event-actor", "event-parent", "dangling-event", "registration-pointer"] as const) test("foreign backlinks and ambiguous ancestry fail closed: " + kind, async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    if (kind === "flow-parent") await ctx.db.patch(f.flows[0], { interestId: f.foreignInterest });
    if (kind === "flow-direction") await ctx.db.patch(f.flows[0], { fromRegistrationId: f.b, toRegistrationId: f.a });
    if (kind === "photo-actor") await ctx.db.patch(f.flows[0], { photoRequestedByRegistrationId: f.other });
    if (kind === "foreign-flow") await ctx.db.patch(f.foreignFlow, { interestId: f.interests[7] });
    if (kind === "foreign-share") await ctx.db.patch(f.shares[0], { recipientRegistrationId: f.other, interestId: f.interests[0] });
    if (kind === "foreign-match") await ctx.db.patch(f.foreignMatch, { interestId: f.interests[7] });
    if (kind === "missing-match") await ctx.db.patch(f.interests[0], { matchId: f.foreignMatch });
    if (kind === "event-actor") await ctx.db.patch(f.history[0], { actorRegistrationId: f.other });
    if (kind === "event-parent") await ctx.db.patch(f.history[0], { interestId: f.interests[1] });
    if (kind === "dangling-event") await ctx.db.delete(f.flows[7]);
    if (kind === "registration-pointer") {
      const match = await ctx.db.insert("matches", { maleRegistrationId: f.a, femaleRegistrationId: f.b, interestType: "mutual_interest", status: "closed", createdAt: 1, updatedAt: 1 });
      await ctx.db.patch(f.other, { activeMatchId: match });
    }
  });
  await expect(f.t.query(preflight, f.scope)).rejects.toThrow();
  await assertRejectedWithoutWrites(f);
});

const unsafeDeliveries: Partial<Doc<"femaleWorkflowDeliveries">>[] = [
  { status: "sending" }, { status: "sending", leaseUntil: 0 }, { status: "sent", leaseUntil: 0 },
  { status: "pending", firstAttemptAt: 0 }, { status: "failed", firstAttemptAt: 0 },
  { status: "cancelled", providerCooldownUntil: Number.MAX_SAFE_INTEGER },
  { status: "sent", firstAttemptAt: 1 }, { status: "cancelled", firstAttemptAt: 1 }, { status: "failed", attempts: 1 },
  { status: "pending", providerPayload: { from: "sender@example.invalid", to: ["recipient@example.invalid"], subject: "Synthetic", text: "Synthetic" } },
];
test.each(unsafeDeliveries)("unreconciled deliveries block even expired leases: %j", async patch => {
  const f = await fixture();
  await f.t.run(ctx => ctx.db.insert("femaleWorkflowDeliveries", { interestId: f.interests[7], recipientId: f.a, kind: "pending_review", key: "pair-delivery", status: "pending", attempts: 0, nextAttemptAt: 0, createdAt: 1, ...patch }));
  await expect(f.t.query(preflight, f.scope)).rejects.toThrow("quiescent");
  await assertRejectedWithoutWrites(f, f.args, "quiescent");
});

test("quiescent deliveries are included and deleted; cooldown expiry requires fresh review", async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    for (const status of ["pending", "failed", "sent", "cancelled"] as const) await ctx.db.insert("femaleWorkflowDeliveries", { interestId: f.interests[7], recipientId: f.a, kind: "pending_review", key: status, status, attempts: 0, providerCooldownUntil: 0, nextAttemptAt: 0, createdAt: 1 });
  });
  await assertRejectedWithoutWrites(f, f.args, "Preflight drift");
  const pre = await f.t.query(preflight, f.scope);
  expect(pre.manifest.femaleWorkflowDeliveries.count).toBe(4);
  await f.t.mutation(execute, { ...f.args, expectedFingerprint: pre.fingerprint, expectedManifest: JSON.stringify(pre.manifest) });
  expect(await f.t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").collect())).toMatchObject([{ key: "unrelated-delivery", status: "sending" }]);
});

for (const kind of ["foreign-recipient", "unattributed"] as const) test("unsafe delivery ancestry rejects " + kind, async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    await ctx.db.insert("femaleWorkflowDeliveries", { interestId: kind === "unattributed" ? f.foreignInterest : f.interests[0], recipientId: kind === "unattributed" ? f.a : f.other, kind: "pending_review", key: "unsafe", status: "pending", attempts: 0, nextAttemptAt: 0, createdAt: 1 });
    if (kind === "unattributed") await ctx.db.delete(f.foreignInterest);
  });
  await expect(f.t.query(preflight, f.scope)).rejects.toThrow();
  await assertRejectedWithoutWrites(f);
});

test("transaction rollback restores inserted audit and partial deletes on a downstream failure", async () => {
  const f = await fixture();
  const before = await allRows(f.t);
  await expect(f.t.run(async ctx => {
    await ctx.runMutation(execute, f.args);
    throw new Error("synthetic downstream transaction failure");
  })).rejects.toThrow("synthetic downstream transaction failure");
  expect(await allRows(f.t)).toEqual(before);
});

test("deletion limit rejects a 501-row manifest atomically", async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    for (let i = 0; i < 417; i++) await ctx.db.insert("interestFlowEvents", { interestId: f.interests[0], interestFlowId: f.flows[0], actor: "system", eventType: "limit-sentinel", createdAt: i });
  });
  await expect(f.t.query(preflight, f.scope)).rejects.toThrow("Deletion limit exceeded");
  await assertRejectedWithoutWrites(f, f.args, "Deletion limit exceeded");
});

import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { promoteOldestQueuedForRegistration } from "./interestRules";
import schema from "./schema";
import { modules } from "./test.setup";

afterEach(() => vi.unstubAllEnvs());
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const now = Date.now();
    const base = { age: 30, maritalStatus: "single", education: "College", job: "Engineer", phone: "5550100", status: "approved" as const, profileCompletionStatus: "completed" as const, createdAt: now };
    const male = await ctx.db.insert("registrations", { ...base, name: "Requester", gender: "male", email: "m@example.com", publicApplicantNumber: 217 });
    const female = await ctx.db.insert("registrations", { ...base, name: "Target", gender: "female", email: "f@example.com", publicApplicantNumber: 216 });
    const event = await ctx.db.insert("events", { title: "Test", eventCode: "test", eventMonth: "2026-10", series: "test", location: "Test", startsAt: now, endsAt: now, status: "completed", interestSubmissionsEnabled: true, maleCapacity: 1, femaleCapacity: 1, createdAt: now, updatedAt: now });
    const interest = await ctx.db.insert("interests", { fromRegistrationId: male, toRegistrationId: female, eventId: event, source: "admin_entered", status: "converted_to_match", visibility: "admin_actionable", createdAt: now, updatedAt: now });
    const match = await ctx.db.insert("matches", { maleRegistrationId: male, femaleRegistrationId: female, interestId: interest, interestType: "man_interested", status: "reviewing", createdAt: now, updatedAt: now });
    await ctx.db.patch(interest, { matchId: match });
    const flow = await ctx.db.insert("interestFlows", { interestId: interest, fromRegistrationId: male, toRegistrationId: female, flowStatus: "awaiting_final_approvals", recipientDecision: "accepted", requesterFinalApproval: "approved", recipientFinalApproval: "approved", photoDecision: "pending", createdAt: now, updatedAt: now });
    for (const [registrationId, sessionHash] of [[male, "male-session"], [female, "female-session"]] as const) await ctx.db.insert("applicantSessions", { registrationId, sessionHash, expiresAt: now + 100000, createdAt: now });
    return { male, female, interest, match, flow, event };
  });
  vi.stubEnv("ADMIN_PASSWORD", "test-only-secret");
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "test-only-secret");
  return { t, ...ids };
}

test.each(["male", "female"] as const)("archive %s fails closed across creation, advancement, claims and shares without losing history", async side => {
  const f = await fixture(); const { t, male, female, interest, match, flow, event } = f;
  await t.run(async ctx => {
    await ctx.db.patch(f[side], { archivedAt: 0 });
    await ctx.db.patch(interest, { matchId: undefined, status: "queued" });
    await ctx.db.patch(flow, { bioVisibleAt: 1, requesterFinalApproval: "pending" });
  });
  const before = await t.run(async ctx => ({ people: [await ctx.db.get(male), await ctx.db.get(female)], interest: await ctx.db.get(interest), flow: await ctx.db.get(flow), match: await ctx.db.get(match) }));
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "test-only-secret");
  const attempts = [
    () => t.mutation(api.matches.create, { maleRegistrationId: male, femaleRegistrationId: female, adminSecret: "test-only-secret" }),
    () => t.mutation(api.interests.create, { fromRegistrationId: male, toRegistrationId: female, eventId: event, source: "admin_entered", adminSecret: "test-only-secret" }),
    () => t.mutation(api.interests.progressFirst, { adminSecret: "test-only-secret", interestId: interest }),
    () => t.mutation(api.interests.updateStatus, { adminSecret: "test-only-secret", id: interest, status: "new" }),
    () => t.mutation(api.interests.updateAdminStatus, { adminSecret: "test-only-secret", id: interest, adminStatus: "requested" }),
    () => t.mutation(api.matches.updateStatus, { adminSecret: "test-only-secret", id: match, status: "reviewing" }),
    () => t.mutation(api.matches.updateStatus, { id: match, status: "contact_shared", adminSecret: "test-only-secret" }),
    () => t.mutation(api.applicantInterests.respondToInbound, { sessionHash: "female-session", interestId: interest, decision: "accept" }),
    () => t.mutation(api.applicantInterests.respondToInbound, { sessionHash: "female-session", interestId: interest, decision: "keep_open" }),
    () => t.mutation(api.applicantInterests.giveFinalApproval, { sessionHash: "male-session", interestId: interest, approved: true }),
    () => t.mutation(api.profileShares.create, { adminSecret: "test-only-secret", ownerRegistrationId: male, recipientRegistrationId: female, includeImages: false, shareToken: "synthetic" }),
    () => t.mutation(api.matches.assertNotificationEligible, { id: match, adminSecret: "test-only-secret" }),
    () => t.mutation(api.interests.assertNotificationEligible, { id: interest, adminSecret: "test-only-secret" }),
    () => t.mutation(api.matches.resetPair, { adminSecret: "test-only-secret", registrationAId: male, registrationBId: female }),
    () => t.mutation(api.matches.deletePairConnection, { adminSecret: "test-only-secret", registrationAId: male, registrationBId: female }),
  ];
  for (const attempt of attempts) await expect(attempt()).rejects.toThrow("Archived");
  expect(await t.run(ctx => promoteOldestQueuedForRegistration(ctx, male))).toBeNull();
  expect(await t.run(ctx => promoteOldestQueuedForRegistration(ctx, female))).toBeNull();
  expect(await t.run(async ctx => ({ people: [await ctx.db.get(male), await ctx.db.get(female)], interest: await ctx.db.get(interest), flow: await ctx.db.get(flow), match: await ctx.db.get(match) }))).toEqual(before);
  expect((await t.query(api.matches.getCandidates, { adminSecret: "test-only-secret" })).map(p => p._id)).not.toContain(f[side]);
  expect(await t.query(api.matches.getById, { adminSecret: "test-only-secret", id: match })).toEqual(before.match);
  expect(await t.query(api.interests.getByRegistration, { adminSecret: "test-only-secret", registrationId: male })).toMatchObject({ outbound: [{ _id: interest }] });
  await t.run(ctx => ctx.db.patch(interest, { status: "declined" }));
  await expect(t.mutation(api.interests.claimDeclineNotification, { adminSecret: "test-only-secret", id: interest })).rejects.toThrow("Archived");
  expect((await t.run(ctx => ctx.db.get(interest)))?.declineNotificationSentAt).toBeUndefined();
});

test("queue promotion skips archived counterpart but advances next eligible interest", async () => {
  const { t, male, female, interest, event } = await fixture();
  const next = await t.run(async ctx => {
    await ctx.db.patch(female, { archivedAt: 1 });
    await ctx.db.patch(interest, { status: "queued", createdAt: 1 });
    const person = (await ctx.db.get(female))!;
    const { _id, _creationTime, archivedAt, ...fields } = person;
    void _id; void _creationTime; void archivedAt;
    const other = await ctx.db.insert("registrations", { ...fields, email: "other@example.invalid", publicApplicantNumber: 999 });
    return await ctx.db.insert("interests", { fromRegistrationId: male, toRegistrationId: other, eventId: event, source: "admin_entered", status: "queued", visibility: "admin_actionable", createdAt: Date.now() + 1, updatedAt: 1 });
  });
  expect(await t.run(ctx => promoteOldestQueuedForRegistration(ctx, male))).toBe(next);
  expect((await t.run(ctx => ctx.db.get(interest)))?.status).toBe("queued");
  expect((await t.run(ctx => ctx.db.get(next)))?.status).toBe("active");
});

test("suppressed delivery recorders clear optimistic claims even after archive", async () => {
  const { t, male, interest, flow, match } = await fixture();
  await t.run(async ctx => {
    await ctx.db.patch(interest, { status: "declined", inboundInterestNotificationSentAt: 1 });
    await ctx.db.patch(flow, { finalApprovalNotificationSentAt: 1 });
    await ctx.db.patch(match, { contactSharedNotificationSentAt: 1, adminReleasedAt: 1 });
  });
  expect((await t.mutation(api.interests.claimDeclineNotification, { adminSecret: "test-only-secret", id: interest })).claimed).toBe(true);
  await t.run(ctx => ctx.db.patch(male, { archivedAt: 1 }));
  const error = "Participant is archived";
  await t.mutation(api.interests.recordDeclineNotificationFailure, { adminSecret: "test-only-secret", id: interest, error });
  await t.mutation(api.applicantInterests.recordInboundInterestNotificationFailure, { adminSecret: "test-only-secret", interestId: interest, error });
  await t.mutation(api.applicantInterests.recordFinalApprovalNotificationFailure, { adminSecret: "test-only-secret", interestId: interest, error });
  await t.mutation(api.matches.markContactSharedNotificationSent, { adminSecret: "test-only-secret", id: match, sent: false, error });
  const rows = await t.run(async ctx => ({ interest: (await ctx.db.get(interest))!, flow: (await ctx.db.get(flow))!, match: (await ctx.db.get(match))! }));
  expect(rows.interest.declineNotificationSentAt).toBeUndefined();
  expect(rows.interest.inboundInterestNotificationSentAt).toBeUndefined();
  expect(rows.flow.finalApprovalNotificationSentAt).toBeUndefined();
  expect(rows.match.contactSharedNotificationSentAt).toBeUndefined();
  expect(rows.interest.declineNotificationError).toBe(error);
  expect(rows.interest.inboundInterestNotificationError).toBe(error);
  expect(rows.flow.finalApprovalNotificationError).toBe(error);
  expect(rows.match.contactSharedNotificationError).toBe(error);
  await expect(t.mutation(api.interests.claimDeclineNotification, { adminSecret: "test-only-secret", id: interest })).rejects.toThrow("Archived");
  await t.run(ctx => ctx.db.patch(male, { archivedAt: undefined }));
  expect((await t.mutation(api.interests.claimDeclineNotification, { adminSecret: "test-only-secret", id: interest })).claimed).toBe(true);
});

test.each(["male", "female"] as const)("archived %s cannot resume or supply notification/profile access", async side => {
  const f = await fixture();
  await f.t.run(async ctx => {
    await ctx.db.patch(f[side], { archivedAt: 0 });
    await ctx.db.patch(f.match, { status: "paused" });
    await ctx.db.patch(f.flow, { contactSharedAt: 1 });
  });
  await expect(f.t.mutation(api.matches.resume, { adminSecret: "test-only-secret", id: f.match })).rejects.toThrow("Archived");
  await expect(f.t.query(api.applicantInterests.getNotificationRecipient, { adminSecret: "test-only-secret", sessionHash: "male-session", interestId: f.interest, kind: "inbound" })).rejects.toThrow("Archived");
  const dashboard = await f.t.query(api.applicantInterests.getDashboard, { sessionHash: "male-session" });
  expect(dashboard.outbound[0].counterparty).toBeNull();
});

 test("real restore never restores historical profile or decline-notification access", async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    await ctx.db.patch(f.interest, {status: "declined", adminStatus: "declined"});
    await ctx.db.patch(f.flow, {flowStatus: "closed", contactSharedAt: 1});
  });
  const archived = await f.t.mutation(api.archive.archiveAdmin, {adminSecret: "test-only-secret", registrationId: f.female, expectedArchivedAt: null, confirm: true});
  await f.t.mutation(api.archive.restoreAdmin, {adminSecret: "test-only-secret", registrationId: f.female, expectedArchivedAt: archived.archivedAt, confirm: true});
  await expect(f.t.mutation(api.interests.claimDeclineNotification, {adminSecret: "test-only-secret", id: f.interest})).rejects.toThrow("Historical archived");
  await expect(f.t.mutation(api.interests.assertNotificationEligible, {adminSecret: "test-only-secret", id: f.interest})).rejects.toThrow("Historical archived");
  // Even legacy active interest/closed-flow combinations cannot recover profile access.
  await f.t.run(ctx => ctx.db.patch(f.interest, {status: "active"}));
  expect((await f.t.query(api.applicantInterests.getDashboard, {sessionHash: "male-session"})).outbound[0].counterparty).toBeNull();
});

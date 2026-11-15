import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";
import { canReleaseContacts, interestLifecycle } from "../src/lib/interest-lifecycle";
import { adminMutualInterests } from "../src/lib/admin-mutual-interest";
import type { ConvexHttpClient } from "convex/browser";
process.env.ATTENDANCE_ADMIN_SECRET = "synthetic-approval-test";
const adminSecret = "synthetic-approval-test";
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const base = { age: 30, maritalStatus: "single", education: "College", job: "Test", phone: "555", status: "approved" as const, createdAt: 1 };
    const sister = await ctx.db.insert("registrations", { ...base, name: "Synthetic Sister", gender: "female", email: "sister@example.invalid", publicApplicantNumber: 215 });
    const brother = await ctx.db.insert("registrations", { ...base, name: "Synthetic Brother", gender: "male", email: "brother@example.invalid", publicApplicantNumber: 227 });
    const eventId = await ctx.db.insert("events", { title: "Synthetic", eventCode: "test", eventMonth: "2026-11", series: "test", location: "Test", startsAt: 1, endsAt: 2, status: "completed", maleCapacity: 1, femaleCapacity: 1, createdAt: 1, updatedAt: 1 });
    const interestId = await ctx.db.insert("interests", { fromRegistrationId: sister, toRegistrationId: brother, eventId, source: "platform_submission", status: "active", visibility: "internal_only", femaleWorkflow: { state: "awaiting_sister_confirmation", brotherAcceptedAt: 1794720268252, sisterConfirmedAt: 1794744880133 }, createdAt: 1, updatedAt: 1 });
    const flowId = await ctx.db.insert("interestFlows", { interestId, fromRegistrationId: sister, toRegistrationId: brother, flowStatus: "bio_review", recipientDecision: "accepted", requesterFinalApproval: "approved", requesterExplicitFinalAt: 1794744880133, requesterFinalApprovalAt: 1794744880133, recipientFinalApproval: "pending", photoDecision: "pending", createdAt: 1, updatedAt: 1 });
    return { interestId, flowId, sister, brother };
  });
  return { t, ...ids };
}
const scenarios = [
  ["approved", "pending", "Sister approved — awaiting brother’s final approval"],
  ["pending", "approved", "Brother approved — awaiting sister’s final approval"],
  ["pending", "pending", "Awaiting both final approvals"],
  ["approved", "approved", "Both final approvals saved"],
  ["declined", "approved", "Declined"],
] as const;
test.each(scenarios)("read-only final projection %s/%s", async (requester, recipient, label) => {
  const f = await fixture();
  await f.t.run(ctx => ctx.db.patch(f.flowId, { requesterFinalApproval: requester, recipientFinalApproval: recipient, recipientExplicitFinalAt: recipient === "approved" ? 3 : undefined }));
  const before = await f.t.run(async ctx => ({ interest: await ctx.db.get(f.interestId), flow: await ctx.db.get(f.flowId) }));
  const all = await f.t.query(api.interests.getAll, { adminSecret });
  const page = await f.t.query(api.interests.workbenchPage, { adminSecret, paginationOpts: { numItems: 100, cursor: null } });
  const bridge = await adminMutualInterests({ consistentQuery: f.t.query.bind(f.t) } as unknown as Pick<ConvexHttpClient, "consistentQuery">, adminSecret);
  for (const rows of [all, page.page, bridge]) {
    expect(rows[0]).toMatchObject({ finalApprovals: { requester, recipient }, femaleWorkflow: { state: "awaiting_sister_confirmation" } });
    expect(interestLifecycle(rows[0])).toBe(label);
  }
  expect(await f.t.run(async ctx => ({ interest: await ctx.db.get(f.interestId), flow: await ctx.db.get(f.flowId) }))).toEqual(before);
  for (const table of ["matches", "interestFlowEvents", "femaleWorkflowDeliveries"] as const) expect(await f.t.run(ctx => ctx.db.query(table).collect())).toEqual([]);
});
test("legacy initial accepted/approved flag is not brother final consent", async () => {
  const f = await fixture();
  await f.t.run(ctx => ctx.db.patch(f.flowId, { recipientFinalApproval: "approved", recipientFinalApprovalAt: 1794720268252 }));
  expect(interestLifecycle((await f.t.query(api.interests.getAll, { adminSecret }))[0])).toBe(scenarios[0][2]);
});
test.each(["missing", "identity", "closed"])("unavailable evidence: %s", async reason => {
  const f = await fixture();
  await f.t.run(async ctx => { if (reason === "missing") await ctx.db.delete(f.flowId); else await ctx.db.patch(f.flowId, reason === "identity" ? { fromRegistrationId: f.brother } : { flowStatus: "closed" }); });
  expect(interestLifecycle((await f.t.query(api.interests.getAll, { adminSecret }))[0])).toBe("Final approval status unavailable");
});
test.each(["closed", "declined", "withdrawn"] as const)("terminal interest %s wins", async status => {
  const f = await fixture(); await f.t.run(ctx => ctx.db.patch(f.interestId, { status }));
  expect(interestLifecycle((await f.t.query(api.interests.getAll, { adminSecret }))[0])).toBe(status[0].toUpperCase() + status.slice(1));
});
test.each(["private_documented", "awaiting_brother_review", "revoked", "declined", "pending_admin_approval", "contacts_released"] as const)("other workflow stage retained: %s", async state => {
  const f = await fixture(); await f.t.run(ctx => ctx.db.patch(f.interestId, { femaleWorkflow: { state } }));
  const row = (await f.t.query(api.interests.getAll, { adminSecret }))[0];
  expect(row.finalApprovals).toBeNull(); expect(interestLifecycle(row)).not.toContain("final approval");
});
test.each(["admin_entered", "email", "whatsapp", "platform_submission"] as const)("other origins without female workflow unchanged: %s", async source => {
  const f = await fixture(); await f.t.run(ctx => ctx.db.patch(f.interestId, { source, femaleWorkflow: undefined }));
  expect(interestLifecycle((await f.t.query(api.interests.getAll, { adminSecret }))[0])).toBe("Awaiting applicant approvals");
});
test("reset, paused and released precede final review; missing projection never blames sister", () => {
  const row = { status: "active" as const, femaleWorkflow: { state: "awaiting_sister_confirmation" as const }, finalApprovals: { requester: "approved" as const, recipient: "pending" as const } };
  expect(interestLifecycle({ ...row, testReset: { at: 1, actor: "admin", reason: "test" } })).toBe("Test reset — audit retained");
  for (const [status, label] of [["paused", "Paused"], ["contact_shared", "Contacts released"]] as const) expect(interestLifecycle({ ...row, match: { status } as Doc<"matches"> })).toBe(label);
  expect(interestLifecycle({ ...row, finalApprovals: undefined })).toBe("Final approval status unavailable");
});
test("admin queries reject unauthorized access", async () => {
  const f = await fixture(); await expect(f.t.query(api.interests.getAll, {})).rejects.toThrow("Unauthorized");
  await expect(f.t.query(api.interests.workbenchPage, { paginationOpts: { numItems: 100, cursor: null } })).rejects.toThrow("Unauthorized");
});


test.each(["requester", "recipient"] as const)("queued consent stays pair-specific with another released match on %s", async occupied => {
  const f = await fixture();
  const otherMatchId = await f.t.run(async ctx => {
    const person = (await ctx.db.get(occupied === "requester" ? f.brother : f.sister))!;
    const { _id, _creationTime, ...profile } = person;
    void _id; void _creationTime;
    const other = await ctx.db.insert("registrations", { ...profile, name: "Synthetic other partner", email: "other@example.invalid", publicApplicantNumber: 9001 });
    const matchId = await ctx.db.insert("matches", { maleRegistrationId: occupied === "requester" ? other : f.brother, femaleRegistrationId: occupied === "requester" ? f.sister : other, interestType: "mutual_interest", status: "contact_shared", contactGate: "contacts_released", createdAt: 1, updatedAt: 1 });
    await ctx.db.patch(occupied === "requester" ? f.sister : f.brother, { activeMatchId: matchId });
    await ctx.db.patch(f.interestId, { status: "queued" });
    if (occupied === "recipient") await ctx.db.patch(f.flowId, { requesterFinalApproval: "pending", requesterExplicitFinalAt: undefined, requesterFinalApprovalAt: undefined });
    return matchId;
  });
  const snapshot = () => f.t.run(async ctx => ({ interests: await ctx.db.query("interests").collect(), flows: await ctx.db.query("interestFlows").collect(), registrations: await ctx.db.query("registrations").collect(), matches: await ctx.db.query("matches").collect(), audit: await ctx.db.query("interestFlowEvents").collect(), deliveries: await ctx.db.query("femaleWorkflowDeliveries").collect() }));
  const before = await snapshot();
  const all = await f.t.query(api.interests.getAll, { adminSecret });
  const page = await f.t.query(api.interests.workbenchPage, { adminSecret, paginationOpts: { numItems: 100, cursor: null } });
  const bridge = await adminMutualInterests({ consistentQuery: f.t.query.bind(f.t) } as unknown as Pick<ConvexHttpClient, "consistentQuery">, adminSecret);
  for (const rows of [all, page.page, bridge]) {
    const row = rows.find(r => r._id === f.interestId)!;
    expect(row.status).toBe("queued");
    expect(row.match).toBeNull();
    expect(row).toMatchObject({ finalApprovals: { requester: occupied === "requester" ? "approved" : "pending", recipient: "pending" } });
    expect((occupied === "requester" ? row.fromRegistration : row.toRegistration)?.activeMatchId).toBe(otherMatchId);
    expect(canReleaseContacts(row.match)).toBe(false);
    expect(interestLifecycle(row)).toBe(occupied === "requester" ? scenarios[0][2] : scenarios[2][2]);
  }
  expect(await snapshot()).toEqual(before);
});

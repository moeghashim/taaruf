import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
const adminSecret = "synthetic-female-admin";
const hash = "a".repeat(64);
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function fixture() {
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", adminSecret);
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const now = Date.now();
    const base = { age: 30, maritalStatus: "single", education: "College", job: "Engineer", phone: "5550100", status: "approved" as const, createdAt: now };
    const sister = await ctx.db.insert("registrations", { ...base, name: "Synthetic Sister", gender: "female", email: "sister@example.com" });
    const brother = await ctx.db.insert("registrations", { ...base, name: "Synthetic Brother", gender: "male", email: "brother@example.com" });
    const other = await ctx.db.insert("registrations", { ...base, name: "Other", gender: "male", email: "other@example.com" });
    const event = await ctx.db.insert("events", { title: "Synthetic", eventCode: "test", eventMonth: "2026-11", series: "test", location: "Test", startsAt: now, endsAt: now, status: "completed", maleCapacity: 1, femaleCapacity: 1, createdAt: now, updatedAt: now });
    const interestId = await ctx.db.insert("interests", { fromRegistrationId: sister, toRegistrationId: brother, eventId: event, source: "platform_submission", status: "new", visibility: "internal_only", senderPhotoConsent: "no", femaleWorkflow: { state: "private_documented" }, createdAt: now, updatedAt: now });
    await ctx.db.insert("interestFlows", { interestId, fromRegistrationId: sister, toRegistrationId: brother, flowStatus: "private_documented", recipientDecision: "pending", requesterFinalApproval: "pending", recipientFinalApproval: "pending", photoDecision: "pending", createdAt: now, updatedAt: now });
    for (const [registrationId, sessionHash] of [[sister, "sister"], [brother, "brother"], [other, "other"]] as const) await ctx.db.insert("applicantSessions", { registrationId, sessionHash, expiresAt: now + 86400000, createdAt: now });
    return { sister, brother, interestId };
  });
  return { t, ...ids };
}
async function accepted() { const f = await fixture(); await f.t.mutation(api.femaleInterestWorkflow.createReview, { adminSecret, interestId: f.interestId, reviewTokenHash: hash }); await f.t.mutation(api.femaleInterestWorkflow.respond, { sessionHash: "brother", interestId: f.interestId, reviewTokenHash: hash, decision: "accept" }); return f; }
test("private -> authenticated read only review -> explicit accept -> one pending match -> admin contacts", async () => {
  const { t, interestId } = await fixture();
  expect(await t.query(api.femaleInterestWorkflow.getDashboard, { sessionHash: "brother" })).toEqual([]);
  await t.mutation(api.femaleInterestWorkflow.createReview, { adminSecret, interestId, reviewTokenHash: hash });
  expect(await t.query(api.femaleInterestWorkflow.getDashboard, { sessionHash: "brother" })).toHaveLength(1);
  const read = await t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash: "brother", interestId, reviewTokenHash: hash });
  expect(read.profile.email).toBeNull(); expect(read.profile.imageUrls).toEqual([]);
  expect(await t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").take(100))).toEqual([]);
  expect((await t.run(ctx => ctx.db.get(interestId)))?.femaleWorkflow?.state).toBe("awaiting_brother_review");
  await expect(t.mutation(api.femaleInterestWorkflow.confirm, { sessionHash: "sister", interestId, confirmed: true })).rejects.toThrow("Brother acceptance");
  await t.mutation(api.femaleInterestWorkflow.respond, { sessionHash: "brother", interestId, decision: "accept" });
  await t.mutation(api.femaleInterestWorkflow.respond, { sessionHash: "brother", interestId, decision: "accept" });
  expect(await t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").take(100))).toHaveLength(1);
  const first = await t.mutation(api.femaleInterestWorkflow.confirm, { sessionHash: "sister", interestId, confirmed: true });
  const second = await t.mutation(api.femaleInterestWorkflow.confirm, { sessionHash: "sister", interestId, confirmed: true });
  expect(first.matchId).toBe(second.matchId);
  expect(await t.run(ctx => ctx.db.query("matches").take(100))).toHaveLength(1);
  expect(await t.run(ctx => ctx.db.get(first.matchId!))).toMatchObject({ interestType: "mutual_interest", status: "reviewing" });
  expect(await t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").take(100))).toHaveLength(3);
  await expect(t.mutation(api.matches.updateStatus, { adminSecret, id: first.matchId!, status: "contact_shared" })).rejects.toThrow("female website");
  await expect(t.mutation(api.femaleInterestWorkflow.releaseContacts, { interestId })).rejects.toThrow("Unauthorized");
  expect((await t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash: "sister", interestId })).profile.email).toBeNull();
  await t.mutation(api.femaleInterestWorkflow.releaseContacts, { adminSecret, interestId });
  await t.mutation(api.femaleInterestWorkflow.releaseContacts, { adminSecret, interestId });
  expect(await t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").take(100))).toHaveLength(5);
  expect((await t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash: "sister", interestId })).profile.email).toBe("brother@example.com");
});
test("recipient, hash, rotation, expired, revoked, reset and closed are enforced", async () => {
  const { t, interestId } = await fixture();
  await t.mutation(api.femaleInterestWorkflow.createReview, { adminSecret, interestId, reviewTokenHash: hash });
  for (const sessionHash of ["other", "missing", "sister"]) await expect(t.mutation(api.femaleInterestWorkflow.respond, { sessionHash, interestId, decision: "accept" })).rejects.toThrow();
  await t.mutation(api.femaleInterestWorkflow.createReview, { adminSecret, interestId, reviewTokenHash: "b".repeat(64) });
  await expect(t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash: "brother", interestId, reviewTokenHash: hash })).rejects.toThrow("invalid");
  await t.run(async ctx => { const i = (await ctx.db.get(interestId))!; await ctx.db.patch(interestId, { femaleWorkflow: { ...i.femaleWorkflow!, reviewExpiresAt: Date.now() - 1 } }); });
  await expect(t.mutation(api.femaleInterestWorkflow.respond, { sessionHash: "brother", interestId, decision: "accept" })).rejects.toThrow("expired");
  await t.mutation(api.femaleInterestWorkflow.revokeReview, { adminSecret, interestId });
  await expect(t.mutation(api.femaleInterestWorkflow.respond, { sessionHash: "brother", interestId, decision: "accept" })).rejects.toThrow("unavailable");
});
test("legacy bypass and legacy no-backfill", async () => {
  const { t, interestId } = await accepted();
  await expect(t.mutation(api.interests.convertToMatch, { adminSecret, interestId })).rejects.toThrow("female website");
  await expect(t.mutation(api.interests.updateStatus, { adminSecret, id: interestId, status: "active" })).rejects.toThrow("female website");
  await expect(t.mutation(api.applicantInterests.giveFinalApproval, { sessionHash: "sister", interestId, approved: true })).rejects.toThrow("female website");
  await t.run(ctx => ctx.db.patch(interestId, { femaleWorkflow: undefined }));
  await expect(t.mutation(api.interests.convertToMatch, { adminSecret, interestId })).rejects.toThrow("female website");
  await t.mutation(api.femaleInterestWorkflow.createReview, { adminSecret, interestId, reviewTokenHash: hash });
  const initialized = await t.run(ctx => ctx.db.get(interestId));
  expect(initialized?.femaleWorkflow?.state).toBe("awaiting_brother_review");
  expect(initialized?.femaleWorkflow?.brotherAcceptedAt).toBeUndefined();
  expect(initialized?.senderPhotoConsent).toBe("no");
  expect(initialized?.matchId).toBeUndefined();
});
test("declines never create matches; reset cancels outbox", async () => {
  const { t, interestId } = await accepted();
  await t.mutation(api.femaleInterestWorkflow.confirm, { sessionHash: "sister", interestId, confirmed: false });
  expect(await t.run(ctx => ctx.db.query("matches").take(100))).toEqual([]);
  expect(await t.mutation(internal.femaleWorkflowDelivery.claim, {})).toEqual([]);
  expect((await t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").first()))?.status).toBe("cancelled");
  const f = await accepted();
  await f.t.run(ctx => ctx.db.patch(f.interestId, { testReset: { at: Date.now(), reason: "synthetic", actor: "admin" } }));
  await expect(f.t.mutation(api.femaleInterestWorkflow.confirm, { sessionHash: "sister", interestId: f.interestId, confirmed: true })).rejects.toThrow("unavailable");
  expect(await f.t.mutation(internal.femaleWorkflowDelivery.claim, {})).toEqual([]);
});
test("disabled email fails closed; per-recipient retry and provider idempotency", async () => {
  const { t, interestId } = await accepted();
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_MODE", "disabled");
  await t.action(internal.femaleWorkflowDelivery.drain, {});
  expect(fetchMock).not.toHaveBeenCalled();
  let rows = await t.query(api.femaleInterestWorkflow.listDeliveries, { adminSecret, interestId });
  expect(rows[0].status).toBe("failed");
  await t.mutation(api.femaleInterestWorkflow.retryDelivery, { adminSecret, deliveryId: rows[0]._id });
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_MODE", "isolated"); vi.stubEnv("FEMALE_WORKFLOW_EMAIL_ALLOWED_RECIPIENTS", "sister@example.com,brother@example.com"); vi.stubEnv("FEMALE_WORKFLOW_PORTAL_URL", "https://synthetic.example.com"); vi.stubEnv("FEMALE_WORKFLOW_EMAIL_FROM", "test@example.com"); vi.stubEnv("FEMALE_WORKFLOW_RESEND_API_KEY", "synthetic-only");
  fetchMock.mockResolvedValueOnce(new Response("", { status: 500 })).mockResolvedValue(new Response("{}", { status: 200 }));
  await t.action(internal.femaleWorkflowDelivery.drain, {});
  rows = await t.query(api.femaleInterestWorkflow.listDeliveries, { adminSecret, interestId }); expect(rows[0].status).toBe("pending");
  await t.run(ctx => ctx.db.patch(rows[0]._id, { nextAttemptAt: Date.now() - 1 }));
  await t.action(internal.femaleWorkflowDelivery.drain, {});
  expect(fetchMock.mock.calls[0][1].headers["Idempotency-Key"]).toBe(fetchMock.mock.calls[1][1].headers["Idempotency-Key"]);
  expect(fetchMock.mock.calls[1][1].body).not.toContain("5550100");
  expect((await t.query(api.femaleInterestWorkflow.listDeliveries, { adminSecret, interestId }))[0].status).toBe("sent");
  await t.action(internal.femaleWorkflowDelivery.drain, {}); expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("one recipient failure never resends successful sibling; abandoned lease recovers safely", async () => {
  const { t, interestId } = await accepted();
  await t.mutation(api.femaleInterestWorkflow.confirm, { sessionHash: "sister", interestId, confirmed: true });
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_MODE", "isolated"); vi.stubEnv("FEMALE_WORKFLOW_EMAIL_ALLOWED_RECIPIENTS", "sister@example.com,brother@example.com"); vi.stubEnv("FEMALE_WORKFLOW_PORTAL_URL", "https://synthetic.example.com"); vi.stubEnv("FEMALE_WORKFLOW_EMAIL_FROM", "test@example.com"); vi.stubEnv("FEMALE_WORKFLOW_RESEND_API_KEY", "synthetic-only");
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 200 })).mockResolvedValueOnce(new Response("", { status: 500 })).mockResolvedValue(new Response("{}", { status: 200 })); vi.stubGlobal("fetch", fetchMock);
  await t.action(internal.femaleWorkflowDelivery.drain, {});
  let rows = await t.query(api.femaleInterestWorkflow.listDeliveries, { adminSecret, interestId });
  expect(rows.filter(r => r.status === "sent")).toHaveLength(1);
  const retry = rows.find(r => r.status === "pending")!;
  await t.run(ctx => ctx.db.patch(retry._id, { nextAttemptAt: Date.now() - 1 }));
  const claimed = await t.mutation(internal.femaleWorkflowDelivery.claim, {});
  expect(claimed).toHaveLength(1);
  expect(await t.mutation(internal.femaleWorkflowDelivery.claim, {})).toHaveLength(0);
  await t.run(ctx => ctx.db.patch(retry._id, { nextAttemptAt: Date.now() - 1 }));
  await t.action(internal.femaleWorkflowDelivery.drain, {});
  rows = await t.query(api.femaleInterestWorkflow.listDeliveries, { adminSecret, interestId });
  expect(rows.filter(r => r.status === "sent")).toHaveLength(2);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(fetchMock.mock.calls[1][1].headers["Idempotency-Key"]).toBe(fetchMock.mock.calls[2][1].headers["Idempotency-Key"]);
});
test("closed match, revoked session and unrelated bound match cannot expose review", async () => {
  const { t, interestId } = await accepted();
  const confirmed = await t.mutation(api.femaleInterestWorkflow.confirm, { sessionHash: "sister", interestId, confirmed: true });
  await t.mutation(api.matches.updateStatus, { adminSecret, id: confirmed.matchId!, status: "closed" });
  await expect(t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash: "brother", interestId })).rejects.toThrow("unavailable");
  await expect(t.mutation(api.femaleInterestWorkflow.releaseContacts, { adminSecret, interestId })).rejects.toThrow("unavailable");
  const f = await accepted();
  await f.t.run(async ctx => { const session = await ctx.db.query("applicantSessions").withIndex("by_sessionHash", q => q.eq("sessionHash", "brother")).unique(); await ctx.db.patch(session!._id, { revokedAt: Date.now() }); });
  await expect(f.t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash: "brother", interestId: f.interestId })).rejects.toThrow("Unauthorized");
});

for (const sessionHash of ["brother", "sister"]) test(sessionHash + " discovers fresh review after 110 historical rows and pages through empty history", async () => {
  const { t, interestId } = await accepted();
  const fresh = await t.run(async ctx => {
    const row = (await ctx.db.get(interestId))!;
    const { _id, _creationTime, ...copy } = row; void _id; void _creationTime;
    for (let n = 0; n < 110; n++) await ctx.db.insert("interests", { ...copy, status: "closed", femaleWorkflow: n % 2 ? undefined : { state: "declined" } });
    return await ctx.db.insert("interests", copy);
  });
  const first = await t.query(api.femaleInterestWorkflow.getDashboardPage, { sessionHash, paginationOpts: { cursor: null, numItems: 50 } });
  expect(first.page.some(r => r.interestId === fresh)).toBe(true); expect(first.isDone).toBe(false);
  const empty = await t.query(api.femaleInterestWorkflow.getDashboardPage, { sessionHash, paginationOpts: { cursor: first.continueCursor, numItems: 50 } });
  expect(empty.page).toEqual([]); expect(empty.isDone).toBe(false); expect(empty.continueCursor).not.toBe(first.continueCursor);
  const last = await t.query(api.femaleInterestWorkflow.getDashboardPage, { sessionHash, paginationOpts: { cursor: empty.continueCursor, numItems: 50 } });
  expect(last.page.some(r => r.interestId === interestId)).toBe(true); expect(last.isDone).toBe(true);
  const other = await t.query(api.femaleInterestWorkflow.getDashboardPage, { sessionHash: "other", paginationOpts: { cursor: null, numItems: 50 } });
  expect(other.page).toEqual([]);
});

test("PR61 cutoff also denies female portal reads and actions for old sessions", async () => {
 const {t,interestId}=await fixture();
 await t.mutation(api.femaleInterestWorkflow.createReview,{adminSecret,interestId,reviewTokenHash:hash});
 await t.mutation(api.settings.set,{adminSecret,key:"capabilitySecurityCutoffMs",value:String(Date.now())});
 await expect(t.query(api.femaleInterestWorkflow.getDashboard,{sessionHash:"brother"})).rejects.toThrow("Unauthorized");
 await expect(t.query(api.femaleInterestWorkflow.getReviewAccess,{sessionHash:"brother",interestId})).rejects.toThrow("Unauthorized");
 await expect(t.mutation(api.femaleInterestWorkflow.respond,{sessionHash:"brother",interestId,decision:"accept"})).rejects.toThrow("Unauthorized");
 await expect(t.mutation(api.femaleInterestWorkflow.confirm,{sessionHash:"sister",interestId,confirmed:true})).rejects.toThrow("Unauthorized");
 expect((await t.run(ctx=>ctx.db.get(interestId)))?.femaleWorkflow?.state).toBe("awaiting_brother_review");
});

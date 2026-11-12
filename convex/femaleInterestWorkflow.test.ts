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
async function accepted() { const f = await fixture(); await f.t.mutation(api.femaleInterestWorkflow.createReview, { adminSecret, interestId: f.interestId, reviewTokenHash: hash }); vi.stubEnv("FEMALE_WORKFLOW_EMAIL_MODE", "isolated"); vi.stubEnv("FEMALE_WORKFLOW_EMAIL_ALLOWED_RECIPIENTS", "sister@example.com,brother@example.com"); vi.stubEnv("FEMALE_WORKFLOW_PORTAL_URL", "https://synthetic.example.com"); vi.stubEnv("FEMALE_WORKFLOW_EMAIL_FROM", "test@example.com"); vi.stubEnv("FEMALE_WORKFLOW_RESEND_API_KEY", "synthetic-only"); await f.t.mutation(api.femaleInterestWorkflow.respond, { sessionHash: "brother", interestId: f.interestId, reviewTokenHash: hash, decision: "accept" }); return f; }
test("private -> authenticated read only review -> explicit accept -> one pending match -> admin contacts", async () => {
  const { t, interestId } = await fixture();
  expect(await t.query(api.femaleInterestWorkflow.getDashboard, { sessionHash: "brother" })).toEqual([]);
  await t.mutation(api.femaleInterestWorkflow.createReview, { adminSecret, interestId, reviewTokenHash: hash });
  expect(await t.query(api.femaleInterestWorkflow.getDashboard, { sessionHash: "brother" })).toHaveLength(1);
  const read = await t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash: "brother", interestId, reviewTokenHash: hash });
  expect(read.profile.email).toBeNull(); expect(read.profile.imageUrls).toEqual([]);
  expect(await t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").take(100))).toMatchObject([{ kind: "brother_review", status: "failed" }]);
  expect((await t.run(ctx => ctx.db.get(interestId)))?.femaleWorkflow?.state).toBe("awaiting_brother_review");
  await expect(t.mutation(api.femaleInterestWorkflow.confirm, { sessionHash: "sister", interestId, confirmed: true })).rejects.toThrow("Review unavailable");
  await t.mutation(api.femaleInterestWorkflow.respond, { sessionHash: "brother", interestId, decision: "accept" });
  await t.mutation(api.femaleInterestWorkflow.respond, { sessionHash: "brother", interestId, decision: "accept" });
  expect(await t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").take(100))).toHaveLength(2);
  const first = await t.mutation(api.femaleInterestWorkflow.confirm, { sessionHash: "sister", interestId, confirmed: true });
  await t.mutation(api.femaleInterestWorkflow.brotherFinal, { sessionHash: "brother", interestId: interestId, approved: true });
  const second = await t.mutation(api.femaleInterestWorkflow.confirm, { sessionHash: "sister", interestId, confirmed: true });
  await t.mutation(api.femaleInterestWorkflow.brotherFinal, { sessionHash: "brother", interestId: interestId, approved: true });
  expect(first).toEqual({ ownDecision: "approved" });
  expect(second).toEqual(first);
  const matchId = (await t.run(ctx => ctx.db.get(interestId)))!.matchId!;
  expect(await t.run(ctx => ctx.db.query("matches").take(100))).toHaveLength(1);
  expect(await t.run(ctx => ctx.db.get(matchId))).toMatchObject({ interestType: "mutual_interest", status: "reviewing" });
  expect(await t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").take(100))).toHaveLength(4);
  await expect(t.mutation(api.matches.updateStatus, { adminSecret: "wrong", id: matchId, status: "contact_shared" })).rejects.toThrow("Unauthorized");
  await expect(t.mutation(api.femaleInterestWorkflow.releaseContacts, { interestId })).rejects.toThrow("Unauthorized");
  expect((await t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash: "sister", interestId })).profile.email).toBeNull();
  await t.mutation(api.femaleInterestWorkflow.releaseContacts, { adminSecret, interestId });
  await t.mutation(api.femaleInterestWorkflow.releaseContacts, { adminSecret, interestId });
  expect(await t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").take(100))).toHaveLength(6);
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
  expect((await t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").withIndex("by_kind_and_status_and_nextAttemptAt", q => q.eq("kind", "sister_confirmation")).first()))?.status).toBe("cancelled");
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
  let rows = (await t.query(api.femaleInterestWorkflow.listDeliveries, { adminSecret, interestId })).filter(row => row.kind !== "brother_review");
  expect(rows[0].status).toBe("failed");
  await expect(t.mutation(api.femaleInterestWorkflow.retryDelivery, { adminSecret, deliveryId: rows[0]._id })).rejects.toThrow("activation");
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_MODE", "isolated"); vi.stubEnv("FEMALE_WORKFLOW_EMAIL_ALLOWED_RECIPIENTS", "sister@example.com,brother@example.com"); vi.stubEnv("FEMALE_WORKFLOW_PORTAL_URL", "https://synthetic.example.com"); vi.stubEnv("FEMALE_WORKFLOW_EMAIL_FROM", "test@example.com"); vi.stubEnv("FEMALE_WORKFLOW_RESEND_API_KEY", "synthetic-only");
  await t.mutation(api.femaleInterestWorkflow.retryDelivery, { adminSecret, deliveryId: rows[0]._id });
  fetchMock.mockResolvedValueOnce(new Response("", { status: 500 })).mockResolvedValue(new Response("{}", { status: 200 }));
  await t.action(internal.femaleWorkflowDelivery.drain, {});
  rows = (await t.query(api.femaleInterestWorkflow.listDeliveries, { adminSecret, interestId })).filter(row => row.kind !== "brother_review"); expect(rows[0].status).toBe("pending");
  await t.run(ctx => ctx.db.patch(rows[0]._id, { nextAttemptAt: Date.now() - 1 }));
  await t.action(internal.femaleWorkflowDelivery.drain, {});
  expect(fetchMock.mock.calls[0][1].headers["Idempotency-Key"]).toBe(fetchMock.mock.calls[1][1].headers["Idempotency-Key"]);
  expect(fetchMock.mock.calls[1][1].body).not.toContain("5550100");
  expect((await t.query(api.femaleInterestWorkflow.listDeliveries, { adminSecret, interestId })).find(row => row.kind === "sister_confirmation")!.status).toBe("sent");
  await t.action(internal.femaleWorkflowDelivery.drain, {}); expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("one recipient failure never resends successful sibling; abandoned lease recovers safely", async () => {
  const { t, interestId } = await accepted();
  await t.mutation(api.femaleInterestWorkflow.confirm, { sessionHash: "sister", interestId, confirmed: true });
  await t.mutation(api.femaleInterestWorkflow.brotherFinal, { sessionHash: "brother", interestId: interestId, approved: true });
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_MODE", "isolated"); vi.stubEnv("FEMALE_WORKFLOW_EMAIL_ALLOWED_RECIPIENTS", "sister@example.com,brother@example.com"); vi.stubEnv("FEMALE_WORKFLOW_PORTAL_URL", "https://synthetic.example.com"); vi.stubEnv("FEMALE_WORKFLOW_EMAIL_FROM", "test@example.com"); vi.stubEnv("FEMALE_WORKFLOW_RESEND_API_KEY", "synthetic-only");
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 200 })).mockResolvedValueOnce(new Response("", { status: 500 })).mockResolvedValue(new Response("{}", { status: 200 })); vi.stubGlobal("fetch", fetchMock);
  await t.action(internal.femaleWorkflowDelivery.drain, {});
  let rows = (await t.query(api.femaleInterestWorkflow.listDeliveries, { adminSecret, interestId })).filter(row => row.kind !== "brother_review");
  expect(rows.filter(r => r.status === "sent")).toHaveLength(1);
  const retry = rows.find(r => r.status === "pending")!;
  await t.run(ctx => ctx.db.patch(retry._id, { nextAttemptAt: Date.now() - 1 }));
  const claimed = await t.mutation(internal.femaleWorkflowDelivery.claim, {});
  expect(claimed).toHaveLength(1);
  expect(await t.mutation(internal.femaleWorkflowDelivery.claim, {})).toHaveLength(0);
  await t.run(ctx => ctx.db.patch(retry._id, { nextAttemptAt: Date.now() - 1 }));
  await t.action(internal.femaleWorkflowDelivery.drain, {});
  rows = (await t.query(api.femaleInterestWorkflow.listDeliveries, { adminSecret, interestId })).filter(row => row.kind !== "brother_review");
  expect(rows.filter(r => r.status === "sent")).toHaveLength(2);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(fetchMock.mock.calls[1][1].headers["Idempotency-Key"]).toBe(fetchMock.mock.calls[2][1].headers["Idempotency-Key"]);
});
test("closed match, revoked session and unrelated bound match cannot expose review", async () => {
  const { t, interestId } = await accepted();
  await t.mutation(api.femaleInterestWorkflow.confirm, { sessionHash: "sister", interestId, confirmed: true });
  await t.mutation(api.femaleInterestWorkflow.brotherFinal, { sessionHash: "brother", interestId: interestId, approved: true });
  const matchId = (await t.run(ctx => ctx.db.get(interestId)))!.matchId!;
  await t.mutation(api.matches.updateStatus, { adminSecret, id: matchId, status: "closed" });
  await expect(t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash: "brother", interestId })).rejects.toThrow("unavailable");
  await expect(t.mutation(api.femaleInterestWorkflow.releaseContacts, { adminSecret, interestId })).rejects.toThrow("unavailable");
  const f = await accepted();
  await f.t.run(async ctx => { const session = await ctx.db.query("applicantSessions").withIndex("by_sessionHash", q => q.eq("sessionHash", "brother")).unique(); await ctx.db.patch(session!._id, { revokedAt: Date.now() }); });
  await expect(f.t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash: "brother", interestId: f.interestId })).rejects.toThrow("Unauthorized");
});

for (const sessionHash of ["brother", "sister"]) test(sessionHash + " discovers fresh review after 110 historical rows and pages through privacy-safe history", async () => {
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
  expect(empty.page).toHaveLength(sessionHash === "sister" ? 25 : 0);
  for (const row of empty.page) expect(row).toEqual({ interestId: expect.any(String), role: "sister", state: "closed", ownDecision: "pending", ownAction: null, ownActionStage: null, paused: false, reviewExpired: false, canPause: false, canView: false }); expect(empty.isDone).toBe(false); expect(empty.continueCursor).not.toBe(first.continueCursor);
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

test("serialized brother review surfaces omit sister identity throughout approval and release", async () => {
  const { t, interestId, sister, brother } = await fixture();
  await t.run(async ctx => {
    await ctx.db.patch(sister, { publicApplicantNumber: 73 });
    await ctx.db.patch(interestId, { visibility: "admin_actionable" });
    const now = Date.now();
    const reciprocal = await ctx.db.insert("interests", { fromRegistrationId: brother, toRegistrationId: sister, eventId: (await ctx.db.get(interestId))!.eventId, source: "admin_entered", status: "new", visibility: "admin_actionable", createdAt: now, updatedAt: now });
    await ctx.db.insert("interestFlows", { interestId: reciprocal, fromRegistrationId: brother, toRegistrationId: sister, flowStatus: "awaiting_inbound_response", recipientDecision: "pending", requesterFinalApproval: "pending", recipientFinalApproval: "pending", photoDecision: "pending", createdAt: now, updatedAt: now });
  });
  async function check(state: string) {
    const review = await t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash: "brother", interestId });
    expect(review.state).toBe(state);
    expect(review.profile).not.toHaveProperty("name");
    expect(review.profile.label).toBe("Applicant #73");
    expect(JSON.stringify(review)).not.toContain("Synthetic Sister");
    const dashboard = await t.query(api.applicantInterests.getDashboard, { sessionHash: "brother" });
    for (const row of dashboard.inbound) {
      expect(row.counterparty).not.toHaveProperty("name");
      expect(row.counterparty?.label).toBe("Applicant #73");
    }
    expect(dashboard.inbound).toHaveLength(1);
    expect(dashboard.outbound).toHaveLength(1);
    expect(dashboard.outbound[0].counterparty).toMatchObject({ name: "Synthetic Sister", label: "Synthetic Sister" });
    expect(JSON.stringify(dashboard.inbound)).not.toContain("Synthetic Sister");
    expect((await t.query(api.applicantInterests.getDashboard, { sessionHash: "sister" })).applicant.name).toBe("Synthetic Sister");
    expect((await t.query(api.applicantProfile.getProfile, { sessionHash: "sister" })).registration.name).toBe("Synthetic Sister");
    expect((await t.query(api.interests.getAll, { adminSecret })).find(row => row._id === interestId)?.fromRegistration?.name).toBe("Synthetic Sister");
    expect((await t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash: "sister", interestId })).profile.name).toBe("Synthetic Brother");
    if (state !== "contacts_released") {
      expect(review.profile.email).toBeNull();
      expect(review.profile.phone).toBeNull();
    }
  }
  await t.mutation(api.femaleInterestWorkflow.createReview, { adminSecret, interestId, reviewTokenHash: hash });
  await check("in_review");
  await t.mutation(api.femaleInterestWorkflow.respond, { sessionHash: "brother", interestId, decision: "accept" });
  await check("in_review");
  await t.mutation(api.femaleInterestWorkflow.confirm, { sessionHash: "sister", interestId, confirmed: true });
  await t.mutation(api.femaleInterestWorkflow.brotherFinal, { sessionHash: "brother", interestId: interestId, approved: true });
  await check("in_review");
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_MODE", "isolated");
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_ALLOWED_RECIPIENTS", "sister@example.com,brother@example.com");
  vi.stubEnv("FEMALE_WORKFLOW_PORTAL_URL", "https://synthetic.example.com");
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_FROM", "test@example.com");
  vi.stubEnv("FEMALE_WORKFLOW_RESEND_API_KEY", "synthetic-only");
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  await t.action(internal.femaleWorkflowDelivery.drain, {});
  await t.mutation(api.femaleInterestWorkflow.releaseContacts, { adminSecret, interestId });
  await check("contacts_released");
  await t.action(internal.femaleWorkflowDelivery.drain, {});
  const messages = fetchMock.mock.calls.map(call => JSON.parse(call[1]!.body as string));
  expect(messages).toHaveLength(4);
  for (const message of messages) {
    expect(JSON.stringify(message)).not.toContain("Synthetic Sister");
    expect(message.subject).toBeTruthy();
    expect(message.text).toBeTruthy();
    expect(message.text).not.toContain("5550100");
  }
});

for (const preference of ["yes", "no", "ask_me_first"] as const) test("3945 stable authorized brother photos: " + preference, async () => {
  const f = await accepted();
  await f.t.run(async ctx => {
    const image = await ctx.storage.store(new Blob(["synthetic"], { type: "image/png" }));
    await ctx.db.patch(f.brother, { photoSharingPermission: preference, imageStorageIds: [image] });
  });
  const read = () => f.t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash: "sister", interestId: f.interestId });
  expect((await read()).profile.imageUrls).toHaveLength(preference === "yes" ? 1 : 0);
  await f.t.mutation(api.femaleInterestWorkflow.brotherFinal, { sessionHash: "brother", interestId: f.interestId, approved: true });
  expect((await read()).profile.imageUrls).toHaveLength(preference === "yes" ? 1 : 0);
  expect((await read()).profile.email).toBeNull();
  await f.t.mutation(api.femaleInterestWorkflow.confirm, { sessionHash: "sister", interestId: f.interestId, confirmed: true });
  expect((await read()).profile.imageUrls).toHaveLength(preference === "yes" ? 1 : 0);
  await f.t.run(ctx => ctx.db.patch(f.brother, { photoSharingPermission: "no" }));
  expect((await read()).profile.imageUrls).toEqual([]);
  await expect(f.t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash: "other", interestId: f.interestId })).rejects.toThrow("Unauthorized");
  await f.t.run(ctx => ctx.db.patch(f.brother, { archivedAt: Date.now() }));
  await expect(read()).rejects.toThrow();
});

test("3945 scoped grant, revoke and expired session fail closed", async () => {
 const f = await accepted();
 const flowId = await f.t.run(async ctx => {
  const image = await ctx.storage.store(new Blob(["synthetic"], {type:"image/png"}));
  await ctx.db.patch(f.brother,{imageStorageIds:[image],photoSharingPermission:"ask_me_first"});
  const flow=(await ctx.db.query("interestFlows").withIndex("by_interestId",q=>q.eq("interestId",f.interestId)).unique())!;
  await ctx.db.patch(flow._id,{photoDecision:"approved",photoRequestedByRegistrationId:f.brother});return flow._id;
 });
 const read=()=>f.t.query(api.femaleInterestWorkflow.getReviewAccess,{sessionHash:"sister",interestId:f.interestId});
 expect((await read()).profile.imageUrls).toEqual([]);
 await f.t.run(ctx=>ctx.db.patch(flowId,{photoRequestedByRegistrationId:f.sister}));
 expect((await read()).profile.imageUrls).toHaveLength(1);
 await f.t.run(ctx=>ctx.db.patch(flowId,{photoDecision:"declined"}));
 expect((await read()).profile.imageUrls).toEqual([]);
 await f.t.run(async ctx=>{const session=(await ctx.db.query("applicantSessions").withIndex("by_sessionHash",q=>q.eq("sessionHash","sister")).unique())!;await ctx.db.patch(session._id,{expiresAt:Date.now()-1});});
 await expect(read()).rejects.toThrow("Unauthorized");
 await f.t.mutation(api.femaleInterestWorkflow.revokeReview,{adminSecret,interestId:f.interestId});
 await expect(f.t.query(api.femaleInterestWorkflow.getReviewAccess,{sessionHash:"brother",interestId:f.interestId})).rejects.toThrow();
});

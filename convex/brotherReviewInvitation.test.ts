import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
const adminSecret = "synthetic-female-admin";
const hash = "a".repeat(64);
describe.each(["brother-review-production", "brother-sister-review-production"])("%s", productionMode => {
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function fixture(general = false) {
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", adminSecret);
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const now = Date.now();
    const base = { age: 30, maritalStatus: "single", education: "College", job: "Engineer", phone: "5550100", status: "approved" as const, createdAt: now };
    const sister = await ctx.db.insert("registrations", { ...base, name: "Synthetic Sister", gender: "female", email: "sister@example.com" });
    const brother = await ctx.db.insert("registrations", { ...base, name: "Synthetic Brother", gender: "male", email: "brother@example.com" });
    const other = await ctx.db.insert("registrations", { ...base, name: "Other", gender: "male", email: "other@example.com" });
    const event = await ctx.db.insert("events", { title: "Synthetic", eventCode: "test", eventMonth: "2026-11", series: "test", location: "Test", startsAt: now, endsAt: now, status: "completed", maleCapacity: 1, femaleCapacity: 1, createdAt: now, updatedAt: now });
    const interestId = await ctx.db.insert("interests", { fromRegistrationId: general ? brother : sister, toRegistrationId: general ? sister : brother, eventId: event, source: "platform_submission", status: "new", visibility: general ? "admin_actionable" : "internal_only", senderPhotoConsent: "no", ...(general ? {} : { femaleWorkflow: { state: "private_documented" as const } }), createdAt: now, updatedAt: now });
    await ctx.db.insert("interestFlows", { interestId, fromRegistrationId: general ? brother : sister, toRegistrationId: general ? sister : brother, flowStatus: general ? "awaiting_inbound_response" : "private_documented", recipientDecision: "pending", requesterFinalApproval: "pending", recipientFinalApproval: "pending", photoDecision: "pending", createdAt: now, updatedAt: now });
    for (const [registrationId, sessionHash] of [[sister, "sister"], [brother, "brother"], [other, "other"]] as const) await ctx.db.insert("applicantSessions", { registrationId, sessionHash, expiresAt: now + 86400000, createdAt: now });
    return { sister, brother, interestId };
  });
  return { t, ...ids };
}
function isolated() {
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_MODE", "isolated");
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_ALLOWED_RECIPIENTS", "sister@example.com,brother@example.com");
  vi.stubEnv("FEMALE_WORKFLOW_PORTAL_URL", "https://synthetic.example.com");
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_FROM", "test@example.com");
  vi.stubEnv("FEMALE_WORKFLOW_RESEND_API_KEY", "synthetic-only");
}
async function shared() {
  const f = await fixture(); isolated();
  await f.t.mutation(api.femaleInterestWorkflow.createReview, { adminSecret, interestId: f.interestId, reviewTokenHash: hash });
  return f;
}
test("authorized share queues once; reads, double click and reissue never duplicate or disclose identity", async () => {
  const { t, interestId, brother } = await fixture(); isolated();
  const provider = vi.fn().mockResolvedValue(new Response("{}", { status: 200 })); vi.stubGlobal("fetch", provider);
  await expect(t.mutation(api.femaleInterestWorkflow.createReview, { interestId, reviewTokenHash: hash })).rejects.toThrow("Unauthorized");
  await t.query(api.femaleInterestWorkflow.getDashboard, { sessionHash: "brother" });
  expect(await t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").take(10))).toEqual([]);
  for (const reviewTokenHash of [hash, hash, "b".repeat(64)]) await t.mutation(api.femaleInterestWorkflow.createReview, { adminSecret, interestId, reviewTokenHash });
  await t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash: "brother", interestId });
  const rows = await t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").take(10));
  expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ kind: "brother_review", recipientId: brother, status: "pending" });
  await t.action(internal.femaleWorkflowDelivery.drain, {});
  await t.mutation(api.femaleInterestWorkflow.createReview, { adminSecret, interestId, reviewTokenHash: hash });
  await t.action(internal.femaleWorkflowDelivery.drain, {});
  expect(provider).toHaveBeenCalledTimes(1);
  const payload = JSON.parse(provider.mock.calls[0][1].body);
  expect(payload).toEqual({ from: "test@example.com", to: ["brother@example.com"], subject: "New interest received in 1 Plus 1", text: "You have received a new interest in your 1 Plus 1 applicant portal.\n\nPlease log in to review it and choose whether to accept or decline. You can also leave it open while you decide.\n\nReview interest: https://synthetic.example.com/dashboard?femaleReview=" + interestId });
  for (const secret of ["Synthetic Sister", "sister@example.com", "5550100", hash, "photo", "Applicant #"]) expect(JSON.stringify(payload)).not.toContain(secret);
  for (const sessionHash of ["missing", "other"]) await expect(t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash, interestId })).rejects.toThrow("Unauthorized");
  expect(await t.run(ctx => ctx.db.query("matches").take(10))).toEqual([]);
  expect(await t.run(ctx => ctx.db.query("interestFlows").first())).toMatchObject({ requesterFinalApproval: "pending", recipientFinalApproval: "pending", photoDecision: "pending" });
});
for (const status of [500, 429, 400]) test("invitation provider " + status + " retry uses same row/key/body", async () => {
  const { t, interestId } = await shared();
  const provider = vi.fn().mockResolvedValueOnce(new Response("{}", { status, headers: status === 429 ? { "retry-after": "600" } : {} })).mockResolvedValue(new Response("{}", { status: 200 })); vi.stubGlobal("fetch", provider);
  await t.action(internal.femaleWorkflowDelivery.drain, {});
  const row = (await t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").first()))!;
  expect(row.status).toBe(status === 400 ? "failed" : "pending");
  if (status === 429) { await t.action(internal.femaleWorkflowDelivery.drain, {}); expect(provider).toHaveBeenCalledTimes(1); }
  if (status === 400) await t.mutation(api.femaleInterestWorkflow.retryDelivery, { adminSecret, deliveryId: row._id });
  await t.mutation(api.femaleInterestWorkflow.createReview, { adminSecret, interestId, reviewTokenHash: "c".repeat(64) });
  await t.run(ctx => ctx.db.patch(row._id, { nextAttemptAt: 0, providerCooldownUntil: 0 }));
  await t.action(internal.femaleWorkflowDelivery.drain, {});
  expect(provider).toHaveBeenCalledTimes(2);
  expect(provider.mock.calls[1][1].body).toBe(provider.mock.calls[0][1].body);
  expect(provider.mock.calls[1][1].headers["Idempotency-Key"]).toBe(row.key);
  expect(await t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").take(10))).toHaveLength(1);
  expect((await t.run(ctx => ctx.db.get(row._id)))?.status).toBe("sent");
});
for (const invalid of ["revoked", "closed", "expired", "reset", "accepted", "recipient", "unapproved"] as const) test("invitation rechecks " + invalid + " after claim", async () => {
  const { t, interestId, brother, sister } = await shared();
  const [row] = await t.mutation(internal.femaleWorkflowDelivery.claim, {});
  if (invalid === "revoked") await t.mutation(api.femaleInterestWorkflow.revokeReview, { adminSecret, interestId });
  if (invalid === "accepted") await t.mutation(api.femaleInterestWorkflow.respond, { sessionHash: "brother", interestId, decision: "accept" });
  await t.run(async ctx => {
    if (invalid === "closed") await ctx.db.patch(interestId, { status: "closed" });
    if (invalid === "reset") await ctx.db.patch(interestId, { testReset: { at: Date.now(), reason: "synthetic", actor: "admin" } });
    if (invalid === "expired") { const i = (await ctx.db.get(interestId))!; await ctx.db.patch(interestId, { femaleWorkflow: { ...i.femaleWorkflow!, reviewExpiresAt: Date.now() - 1 } }); }
    if (invalid === "recipient") await ctx.db.patch(row._id, { recipientId: sister });
    if (invalid === "unapproved") await ctx.db.patch(brother, { status: "rejected" });
  });
  expect(await t.mutation(internal.femaleWorkflowDelivery.markAttempt, { id: row._id, attempt: row.attempts })).toBe(false);
  expect((await t.run(ctx => ctx.db.get(row._id)))?.status).toBe("cancelled");
});
for (const invalid of ["revoked", "closed"]) test("failed invitation cannot retry after " + invalid, async () => {
  const { t, interestId } = await shared();
  const provider = vi.fn().mockResolvedValue(new Response("{}", { status: 400 })); vi.stubGlobal("fetch", provider);
  await t.action(internal.femaleWorkflowDelivery.drain, {});
  const row = (await t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").first()))!;
  if (invalid === "revoked") await t.mutation(api.femaleInterestWorkflow.revokeReview, { adminSecret, interestId });
  else await t.run(ctx => ctx.db.patch(interestId, { status: "closed" }));
  await expect(t.mutation(api.femaleInterestWorkflow.retryDelivery, { adminSecret, deliveryId: row._id })).rejects.toThrow("unavailable");
  await t.action(internal.femaleWorkflowDelivery.drain, {}); expect(provider).toHaveBeenCalledTimes(1);
});

function production() {
  isolated();
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_MODE", productionMode);
  vi.stubEnv("FEMALE_WORKFLOW_PRODUCTION_APPROVED", "true");
  vi.stubEnv("FEMALE_WORKFLOW_PORTAL_URL", "https://www.1plus1match.com");
}
async function activate(t: Awaited<ReturnType<typeof fixture>>["t"]) {
  production();
  const at = Number(await t.mutation(internal.femaleWorkflowDelivery.activateBrotherReview, {}));
  vi.spyOn(Date, "now").mockReturnValue(at + 1);
  return at;
}
for (const status of ["pending", "failed", "sending"] as const) test("production excludes historical " + status + " including config failures and retries", async () => {
  const { t, interestId } = await shared();
  const old = (await t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").first()))!;
  await t.run(ctx => ctx.db.patch(old._id, { status, nextAttemptAt: 0, leaseUntil: 0, error: "configuration missing" }));
  await activate(t);
  const provider = vi.fn(); vi.stubGlobal("fetch", provider);
  await t.mutation(api.femaleInterestWorkflow.createReview, { adminSecret, interestId, reviewTokenHash: hash });
  await t.action(internal.femaleWorkflowDelivery.drain, {});
  await expect(t.mutation(api.femaleInterestWorkflow.retryDelivery, { adminSecret, deliveryId: old._id })).rejects.toThrow("activation");
  expect(provider).not.toHaveBeenCalled();
  expect(await t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").take(10))).toHaveLength(1);
});
test("production fails closed before activation/configuration; cannot backfill a failed share", async () => {
  const { t, interestId } = await fixture(); production();
  await t.mutation(api.femaleInterestWorkflow.createReview, { adminSecret, interestId, reviewTokenHash: hash });
  const old = (await t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").first()))!;
  expect(old).toMatchObject({ status: "failed", attempts: 0 });
  vi.stubEnv("FEMALE_WORKFLOW_RESEND_API_KEY", "");
  await expect(t.mutation(internal.femaleWorkflowDelivery.activateBrotherReview, {})).rejects.toThrow("configuration");
  await activate(t);
  await expect(t.mutation(api.femaleInterestWorkflow.retryDelivery, { adminSecret, deliveryId: old._id })).rejects.toThrow("activation");
});
test("future invitation once only; immutable boundary survives repeated activation and mode toggles", async () => {
  const { t, interestId } = await fixture(); const at = await activate(t);
  await expect(t.mutation(api.settings.set, { adminSecret, key: "brotherReviewEmailActivatedAt", value: String(at - 1) })).rejects.toThrow("immutable");
  expect(await t.mutation(internal.femaleWorkflowDelivery.activateBrotherReview, {})).toBe(String(at));
  const provider = vi.fn().mockResolvedValue(new Response("{}", { status: 200 })); vi.stubGlobal("fetch", provider);
  for (let n = 0; n < 2; n++) {
    await t.mutation(api.femaleInterestWorkflow.createReview, { adminSecret, interestId, reviewTokenHash: hash });
    await t.action(internal.femaleWorkflowDelivery.drain, {});
  }
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_MODE", "disabled"); production();
  expect(await t.mutation(internal.femaleWorkflowDelivery.activateBrotherReview, {})).toBe(String(at));
  expect(provider).toHaveBeenCalledTimes(1);
});
for (const invalid of ["revoked", "expired", "config"] as const) test("future production rechecks " + invalid + " before attempt", async () => {
  const { t, interestId } = await fixture(); await activate(t);
  await t.mutation(api.femaleInterestWorkflow.createReview, { adminSecret, interestId, reviewTokenHash: hash });
  const [row] = await t.mutation(internal.femaleWorkflowDelivery.claim, {});
  if (invalid === "revoked") await t.mutation(api.femaleInterestWorkflow.revokeReview, { adminSecret, interestId });
  if (invalid === "expired") await t.run(async ctx => { const i = (await ctx.db.get(interestId))!; await ctx.db.patch(interestId, { femaleWorkflow: { ...i.femaleWorkflow!, reviewExpiresAt: Date.now() - 1 } }); });
  if (invalid === "config") vi.stubEnv("FEMALE_WORKFLOW_RESEND_API_KEY", "");
  expect(await t.mutation(internal.femaleWorkflowDelivery.markAttempt, { id: row._id, attempt: row.attempts })).toBe(false);
});
test("dedicated activation leaves all other kinds untouched even beyond batch size; rejects their manual retry", async () => {
  const { t, interestId, sister } = await fixture(); await activate(t);
  const ids = await t.run(async ctx => {
    const ids = [];
    for (let n = 0; n < 30; n++) for (const kind of ["pending_review", "contacts_ready"] as const) ids.push(await ctx.db.insert("femaleWorkflowDeliveries", { interestId, recipientId: sister, kind, key: kind + n, status: n === 0 ? "failed" : "pending", attempts: 0, nextAttemptAt: 0, createdAt: 1 }));
    return ids;
  });
  const before = await t.run(ctx => Promise.all(ids.map(id => ctx.db.get(id))));
  const provider = vi.fn().mockResolvedValue(new Response("{}", { status: 200 })); vi.stubGlobal("fetch", provider);
  await t.mutation(api.femaleInterestWorkflow.createReview, { adminSecret, interestId, reviewTokenHash: hash });
  await t.action(internal.femaleWorkflowDelivery.drain, {});
  expect(provider).toHaveBeenCalledTimes(1);
  for (const id of ids.slice(0, 2)) await expect(t.mutation(api.femaleInterestWorkflow.retryDelivery, { adminSecret, deliveryId: id })).rejects.toThrow("kind");
  expect(await t.run(ctx => Promise.all(ids.map(id => ctx.db.get(id))))).toEqual(before);
});

test("future failed production invitation cannot manually retry after expiry", async () => {
  const { t, interestId } = await fixture(); await activate(t);
  await t.mutation(api.femaleInterestWorkflow.createReview, { adminSecret, interestId, reviewTokenHash: hash });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 400 })));
  await t.action(internal.femaleWorkflowDelivery.drain, {});
  const row = (await t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").first()))!;
  await t.run(async ctx => { const i = (await ctx.db.get(interestId))!; await ctx.db.patch(interestId, { femaleWorkflow: { ...i.femaleWorkflow!, reviewExpiresAt: Date.now() - 1 } }); });
  await expect(t.mutation(api.femaleInterestWorkflow.retryDelivery, { adminSecret, deliveryId: row._id })).rejects.toThrow("unavailable");
});

});

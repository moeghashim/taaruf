import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
const adminSecret = "synthetic-female-admin";
const hash = "a".repeat(64);
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
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

function isolated() {
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_MODE", "isolated");
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_ALLOWED_RECIPIENTS", "sister@example.com,brother@example.com");
  vi.stubEnv("FEMALE_WORKFLOW_PORTAL_URL", "https://synthetic.example.com");
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_FROM", "test@example.com");
  vi.stubEnv("FEMALE_WORKFLOW_RESEND_API_KEY", "synthetic-only");
}
test("older failures remain visible and retryable beyond 100 newer successes", async () => {
  const { t } = await accepted();
  const failed = await t.run(async ctx => {
    const row = (await ctx.db.query("femaleWorkflowDeliveries").first())!;
    await ctx.db.patch(row._id, { status: "failed", error: "synthetic failure" });
    const { _id, _creationTime, ...copy } = row;
    void _creationTime;
    for (let n = 0; n < 110; n++) await ctx.db.insert("femaleWorkflowDeliveries", { ...copy, key: "history-" + n, status: "sent" });
    return _id;
  });
  const rows = await t.query(api.femaleInterestWorkflow.listDeliveries, { adminSecret });
  expect(rows.some(r => r._id === failed)).toBe(true);
  await t.mutation(api.femaleInterestWorkflow.retryDelivery, { adminSecret, deliveryId: failed });
  expect((await t.run(ctx => ctx.db.get(failed)))?.status).toBe("pending");
});
test("429 600-second cooldown defers leased siblings and newly queued work globally", async () => {
  const { t, interestId } = await accepted(); isolated();
  await t.mutation(api.femaleInterestWorkflow.confirm, { sessionHash: "sister", interestId, confirmed: true });
  const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 429, headers: { "retry-after": "600" } })); vi.stubGlobal("fetch", fetchMock);
  await t.action(internal.femaleWorkflowDelivery.drain, {});
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const rows = await t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").collect());
  const until = Math.max(...rows.map(r => r.providerCooldownUntil ?? 0));
  expect(until).toBeGreaterThan(Date.now() + 590000);
  expect(rows.filter(r => r.status === "sending")).toHaveLength(0);
  expect(rows.filter(r => r.status === "pending").every(r => r.nextAttemptAt >= until - 10)).toBe(true);
  await t.run(async ctx => {
    const row = rows.find(r => r.status === "pending")!;
    const { _id, _creationTime, ...copy } = row;
    void _id; void _creationTime;
    await ctx.db.insert("femaleWorkflowDeliveries", { ...copy, key: "new-pending", nextAttemptAt: 0, providerCooldownUntil: undefined });
  });
  const now = vi.spyOn(Date, "now").mockReturnValue(until - 1);
  expect(await t.mutation(internal.femaleWorkflowDelivery.claim, {})).toEqual([]);
  await t.action(internal.femaleWorkflowDelivery.drain, {});
  expect(fetchMock).toHaveBeenCalledTimes(1);
  now.mockRestore();
});
test("accepted-then-crash replays identical frozen provider body despite email and configuration edits", async () => {
  const { t, sister } = await accepted(); isolated();
  const [row] = await t.mutation(internal.femaleWorkflowDelivery.claim, {});
  const payload = await t.mutation(internal.femaleWorkflowDelivery.markAttempt, { id: row._id, attempt: row.attempts });
  expect(payload).toBeTruthy();
  // Simulate provider acceptance with no finish mutation (worker crash).
  const provider = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", provider);
  await fetch("https://api.resend.com/emails", { method: "POST", headers: { "Idempotency-Key": row.key }, body: JSON.stringify(payload) });
  await t.run(async ctx => { await ctx.db.patch(sister, { email: "changed@example.com" }); await ctx.db.patch(row._id, { nextAttemptAt: 0, leaseUntil: 0 }); });
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_FROM", "changed@example.com");
  vi.stubEnv("FEMALE_WORKFLOW_PORTAL_URL", "https://changed.example.com");
  await t.action(internal.femaleWorkflowDelivery.drain, {});
  expect(provider).toHaveBeenCalledTimes(2);
  expect(provider.mock.calls[1][1].body).toBe(provider.mock.calls[0][1].body);
  expect(provider.mock.calls[1][1].headers["Idempotency-Key"]).toBe(row.key);
  expect((await t.run(ctx => ctx.db.get(row._id)))?.error).toContain("Recipient changed");
});
test("send authorization rejects expired leases, superseded attempts and the exact 23h boundary", async () => {
  const { t } = await accepted(); isolated();
  const [row] = await t.mutation(internal.femaleWorkflowDelivery.claim, {});
  const now = Date.now();
  await t.run(ctx => ctx.db.patch(row._id, { leaseUntil: now }));
  expect(await t.mutation(internal.femaleWorkflowDelivery.markAttempt, { id: row._id, attempt: row.attempts })).toBe(false);
  await t.run(ctx => ctx.db.patch(row._id, { leaseUntil: now + 60000 }));
  expect(await t.mutation(internal.femaleWorkflowDelivery.markAttempt, { id: row._id, attempt: row.attempts - 1 })).toBe(false);
  await t.run(ctx => ctx.db.patch(row._id, { firstAttemptAt: now - 23 * 3600000 }));
  expect(await t.mutation(internal.femaleWorkflowDelivery.markAttempt, { id: row._id, attempt: row.attempts })).toBe(false);
  expect((await t.run(ctx => ctx.db.get(row._id)))?.error).toContain("Idempotency window expired");
  await expect(t.mutation(api.femaleInterestWorkflow.retryDelivery, { adminSecret, deliveryId: row._id })).rejects.toThrow("expired");
});
test("frozen replay still fails closed if isolated sending is disabled", async () => {
  const { t } = await accepted(); isolated();
  const [row] = await t.mutation(internal.femaleWorkflowDelivery.claim, {});
  await t.mutation(internal.femaleWorkflowDelivery.markAttempt, { id: row._id, attempt: row.attempts });
  await t.run(ctx => ctx.db.patch(row._id, { leaseUntil: 0, nextAttemptAt: 0 }));
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_MODE", "disabled");
  const provider = vi.fn(); vi.stubGlobal("fetch", provider);
  await t.action(internal.femaleWorkflowDelivery.drain, {});
  expect(provider).not.toHaveBeenCalled();
  expect((await t.run(ctx => ctx.db.get(row._id)))?.status).toBe("failed");
});

test("failed pagination reaches row 101 beyond non-retryable failures and newer successes", async () => {
  const { t } = await accepted();
  const ids = await t.run(async ctx => {
    const row = (await ctx.db.query("femaleWorkflowDeliveries").first())!;
    const { _id, _creationTime, ...copy } = row; void _creationTime;
    await ctx.db.delete(_id);
    const failed = [];
    for (let n = 0; n < 101; n++) failed.push(await ctx.db.insert("femaleWorkflowDeliveries", { ...copy, key: "failure-" + n, status: "failed", nextAttemptAt: n, firstAttemptAt: n < 100 ? Date.now() - 24 * 3600000 : undefined }));
    for (let n = 0; n < 110; n++) await ctx.db.insert("femaleWorkflowDeliveries", { ...copy, key: "success-" + n, status: "sent" });
    return failed;
  });
  const first = await t.query(api.femaleInterestWorkflow.listDeliveriesPage, { adminSecret, view: "failed", paginationOpts: { cursor: null, numItems: 100 } });
  expect(first.page.map(r => r._id)).toEqual(ids.slice(0, 100)); expect(first.isDone).toBe(false);
  await expect(t.mutation(api.femaleInterestWorkflow.retryDelivery, { adminSecret, deliveryId: ids[0] })).rejects.toThrow("expired");
  const second = await t.query(api.femaleInterestWorkflow.listDeliveriesPage, { adminSecret, view: "failed", paginationOpts: { cursor: first.continueCursor, numItems: 100 } });
  expect(second.page.map(r => r._id)).toEqual([ids[100]]); expect(second.isDone).toBe(true);
  await t.mutation(api.femaleInterestWorkflow.retryDelivery, { adminSecret, deliveryId: ids[100] });
  const history = await t.query(api.femaleInterestWorkflow.listDeliveriesPage, { adminSecret, view: "history", paginationOpts: { cursor: null, numItems: 50 } });
  expect(history.page).toHaveLength(50); expect(history.page.every(r => r.status === "sent")).toBe(true);
  await expect(t.query(api.femaleInterestWorkflow.listDeliveriesPage, { view: "failed", paginationOpts: { cursor: null, numItems: 50 } })).rejects.toThrow("Unauthorized");
});

test("production delivery configuration requires explicit release approval and exact portal origin", async () => {
 const { deliveryConfig } = await import("./femaleWorkflowDelivery");
 isolated();
 vi.stubEnv("FEMALE_WORKFLOW_EMAIL_MODE", "production");
 vi.stubEnv("FEMALE_WORKFLOW_PORTAL_URL", "https://www.1plus1match.com");
 expect(deliveryConfig("recipient@example.invalid")).toBeNull();
 vi.stubEnv("FEMALE_WORKFLOW_PRODUCTION_APPROVED", "true");
 expect(deliveryConfig("recipient@example.invalid")?.portal).toBe("https://www.1plus1match.com/dashboard");
 vi.stubEnv("FEMALE_WORKFLOW_PORTAL_URL", "https://unrelated.invalid");
 expect(deliveryConfig("recipient@example.invalid")).toBeNull();
 vi.stubEnv("FEMALE_WORKFLOW_EMAIL_MODE", "disabled");
 expect(deliveryConfig("recipient@example.invalid")).toBeNull();
});

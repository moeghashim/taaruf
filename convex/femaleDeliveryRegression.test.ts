import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
const adminSecret = "synthetic-female-admin";
const hash = "a".repeat(64);
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
async function accepted() { const f = await fixture(); await f.t.mutation(api.femaleInterestWorkflow.createReview, { adminSecret, interestId: f.interestId, reviewTokenHash: hash }); vi.stubEnv("FEMALE_WORKFLOW_EMAIL_MODE", "isolated"); vi.stubEnv("FEMALE_WORKFLOW_EMAIL_ALLOWED_RECIPIENTS", "sister@example.com,brother@example.com"); vi.stubEnv("FEMALE_WORKFLOW_PORTAL_URL", "https://synthetic.example.com"); vi.stubEnv("FEMALE_WORKFLOW_EMAIL_FROM", "test@example.com"); vi.stubEnv("FEMALE_WORKFLOW_RESEND_API_KEY", "synthetic-only"); await f.t.mutation(api.femaleInterestWorkflow.respond, { sessionHash: "brother", interestId: f.interestId, reviewTokenHash: hash, decision: "accept" }); return f; }

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
    const row = (await ctx.db.query("femaleWorkflowDeliveries").withIndex("by_kind_and_status_and_nextAttemptAt", q => q.eq("kind", "sister_confirmation")).first())!;
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
test("accepted-then-crash replays identical frozen provider body despite configuration edits", async () => {
  const { t } = await accepted(); isolated();
  const [row] = await t.mutation(internal.femaleWorkflowDelivery.claim, {});
  const payload = await t.mutation(internal.femaleWorkflowDelivery.markAttempt, { id: row._id, attempt: row.attempts });
  expect(payload).toBeTruthy();
  // Simulate provider acceptance with no finish mutation (worker crash).
  const provider = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", provider);
  await fetch("https://api.resend.com/emails", { method: "POST", headers: { "Idempotency-Key": row.key }, body: JSON.stringify(payload) });
  await t.run(async ctx => { await ctx.db.patch(row._id, { nextAttemptAt: 0, leaseUntil: 0 }); });
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_FROM", "changed@example.com");
  vi.stubEnv("FEMALE_WORKFLOW_PORTAL_URL", "https://changed.example.com");
  await t.action(internal.femaleWorkflowDelivery.drain, {});
  expect(provider).toHaveBeenCalledTimes(2);
  expect(provider.mock.calls[1][1].body).toBe(provider.mock.calls[0][1].body);
  expect(provider.mock.calls[1][1].headers["Idempotency-Key"]).toBe(row.key);
  expect((await t.run(ctx => ctx.db.get(row._id)))?.status).toBe("sent");
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
  await t.run(async ctx => { const review = await ctx.db.query("femaleWorkflowDeliveries").withIndex("by_kind_and_status_and_nextAttemptAt", q => q.eq("kind", "brother_review")).first(); if (review) await ctx.db.delete(review._id); });
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

async function reviewing(general = false) {
  const f = general ? await fixture(true) : await accepted();
  if (general) {
    await f.t.mutation(api.applicantInterests.respondToInbound, { sessionHash: "sister", interestId: f.interestId, decision: "accept" });
    for (const sessionHash of ["brother", "sister"]) await f.t.mutation(api.applicantInterests.giveFinalApproval, { sessionHash, interestId: f.interestId, approved: true });
  } else await f.t.mutation(api.femaleInterestWorkflow.confirm, { sessionHash: "sister", interestId: f.interestId, confirmed: true });
  return { ...f, matchId: (await f.t.run(ctx => ctx.db.get(f.interestId)))!.matchId! };
}

for (const general of [false, true]) for (const kind of ["pending_review", "contacts_ready"] as const) test(`paused ${general ? "general" : "female"} ${kind} retry replays only the failed recipient without changing disclosure history`, async () => {
  const { t, interestId, matchId } = await reviewing(general); isolated();
  let fail = true;
  const subject = kind === "pending_review" ? "Your connection is being reviewed" : "Your contacts are ready in the portal";
  const provider = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
    const payload = JSON.parse(options!.body as string);
    return new Response("{}", { status: fail && payload.subject === subject && payload.to[0] === "brother@example.com" ? 400 : 200 });
  });
  vi.stubGlobal("fetch", provider);
  await t.action(internal.femaleWorkflowDelivery.drain, {});
  if (kind === "contacts_ready") {
    await t.mutation(api.matches.updateStatus, { adminSecret, id: matchId, status: "contact_shared" });
    await t.action(internal.femaleWorkflowDelivery.drain, {});
  }
  const rows = await t.query(api.femaleInterestWorkflow.listDeliveries, { adminSecret, interestId });
  const failed = rows.find(row => row.kind === kind && row.status === "failed")!;
  const sibling = rows.find(row => row.kind === kind && row.status === "sent")!;
  expect(failed.providerPayload).toBeTruthy(); expect(sibling).toBeTruthy();
  await t.mutation(api.matches.updateStatus, { adminSecret, id: matchId, status: "paused" });
  const history = () => t.run(async ctx => ({ interest: await ctx.db.get(interestId), match: await ctx.db.get(matchId), flows: await ctx.db.query("interestFlows").collect(), events: await ctx.db.query("interestFlowEvents").collect(), people: await ctx.db.query("registrations").collect() }));
  const before = await history();
  await expect(t.mutation(api.femaleInterestWorkflow.retryDelivery, { deliveryId: failed._id })).rejects.toThrow("Unauthorized");
  await expect(t.mutation(api.femaleInterestWorkflow.retryDelivery, { adminSecret, deliveryId: sibling._id })).rejects.toThrow("Only failed delivery");
  const calls = provider.mock.calls.length;
  fail = false;
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_FROM", "changed@example.com");
  vi.stubEnv("FEMALE_WORKFLOW_PORTAL_URL", "https://changed.example.com");
  await t.mutation(api.femaleInterestWorkflow.retryDelivery, { adminSecret, deliveryId: failed._id });
  await t.action(internal.femaleWorkflowDelivery.drain, {});
  expect(provider).toHaveBeenCalledTimes(calls + 1);
  const replay = provider.mock.calls.at(-1)![1]!;
  expect(JSON.parse(replay.body as string)).toEqual(failed.providerPayload);
  expect(new Headers(replay.headers).get("Idempotency-Key")).toBe(failed.key);
  const retried = (await t.run(ctx => ctx.db.get(failed._id)))!;
  expect(retried.status).toBe("sent"); expect(retried.firstAttemptAt).toBe(failed.firstAttemptAt);
  expect(retried.providerPayload).toEqual(failed.providerPayload);
  expect(await t.run(ctx => ctx.db.get(sibling._id))).toEqual(sibling);
  expect(await t.query(api.femaleInterestWorkflow.listDeliveries, { adminSecret, interestId })).toHaveLength(rows.length);
  expect(await history()).toEqual(before);
  expect(before.match?.status).toBe("paused");
  expect(before.match?.contactGate).toBe(kind === "contacts_ready" ? "contacts_released" : "pending_admin_approval");
});

for (const invalid of ["closed", "declined", "interest_reset", "match_reset", "identity_corruption", "expired_window"] as const) test(`paused retry rejects ${invalid} without resending a successful sibling`, async () => {
  const { t, interestId, matchId, brother } = await reviewing(); isolated();
  const provider = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => new Response("{}", { status: JSON.parse(options!.body as string).to[0] === "brother@example.com" ? 400 : 200 }));
  vi.stubGlobal("fetch", provider);
  await t.action(internal.femaleWorkflowDelivery.drain, {});
  const rows = await t.query(api.femaleInterestWorkflow.listDeliveries, { adminSecret, interestId });
  const failed = rows.find(row => row.kind === "pending_review" && row.status === "failed")!;
  const sibling = rows.find(row => row.status === "sent")!;
  await t.mutation(api.matches.updateStatus, { adminSecret, id: matchId, status: "paused" });
  if (invalid === "closed" || invalid === "declined") await t.mutation(api.matches.updateStatus, { adminSecret, id: matchId, status: invalid });
  if (invalid === "interest_reset") await t.run(ctx => ctx.db.patch(interestId, { testReset: { at: Date.now(), reason: "Historical reset fixture", actor: "admin" } }));
  if (invalid === "match_reset") await t.run(ctx => ctx.db.patch(matchId, { testResetAt: Date.now() }));
  if (invalid === "identity_corruption") await t.run(ctx => ctx.db.patch(matchId, { femaleRegistrationId: brother }));
  if (invalid === "expired_window") vi.spyOn(Date, "now").mockReturnValue(failed.firstAttemptAt! + 23 * 3600000);
  await expect(t.mutation(api.femaleInterestWorkflow.retryDelivery, { adminSecret, deliveryId: failed._id })).rejects.toThrow(invalid === "expired_window" ? "Idempotency window expired" : /unavailable|Unavailable/);
  await t.action(internal.femaleWorkflowDelivery.drain, {});
  expect(provider).toHaveBeenCalledTimes(2);
  expect(await t.run(ctx => ctx.db.get(failed._id))).toEqual(failed);
  expect(await t.run(ctx => ctx.db.get(sibling._id))).toEqual(sibling);
});

test("disabled configuration claims once but never prepares or sends provider request", async () => {
  const { t, interestId } = await accepted();
  await t.mutation(api.femaleInterestWorkflow.confirm, { sessionHash: "sister", interestId, confirmed: true });
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_MODE", "disabled");
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  await t.action(internal.femaleWorkflowDelivery.drain, {});
  expect(fetchMock).not.toHaveBeenCalled();
  const rows = await t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").collect());
  const blocked = rows.filter(r => r.error === "Isolated delivery configuration missing or recipient not allowlisted");
  expect(blocked.length).toBeGreaterThan(0);
  for (const row of blocked) {
    expect(row).toMatchObject({ status: "failed", attempts: 1 });
    for (const field of ["firstAttemptAt", "providerPayload", "sentAt", "leaseUntil"] as const) expect(row[field]).toBeUndefined();
  }
  await t.action(internal.femaleWorkflowDelivery.drain, {});
  expect(fetchMock).not.toHaveBeenCalled();
  expect(await t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").collect())).toEqual(rows);
});

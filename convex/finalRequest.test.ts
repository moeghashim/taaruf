import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { FINAL_REQUEST_ACTIVATION_KEY } from "./finalRequest";
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

function configure() {
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_MODE", "brother-final-request-production");
  vi.stubEnv("FEMALE_WORKFLOW_PRODUCTION_APPROVED", "true");
  vi.stubEnv("FEMALE_WORKFLOW_PORTAL_URL", "https://www.1plus1match.com");
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_FROM", "test@example.com");
  vi.stubEnv("FEMALE_WORKFLOW_RESEND_API_KEY", "synthetic-only");
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function activate(f: Fixture) {
  configure();
  await f.t.mutation(internal.femaleWorkflowDelivery.activateFinalRequests, {});
  // Deterministic elapsed time, no production state touched.
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 10);
}
async function accept(f: Fixture, general: boolean) {
  if (general) await f.t.mutation(api.applicantInterests.respondToInbound, { sessionHash: "sister", interestId: f.interestId, decision: "accept" });
  else {
    const interest = await f.t.run(ctx => ctx.db.get(f.interestId));
    if (interest?.femaleWorkflow?.state === "private_documented") await f.t.mutation(api.femaleInterestWorkflow.createReview, { adminSecret, interestId: f.interestId, reviewTokenHash: hash });
    await f.t.mutation(api.femaleInterestWorkflow.respond, { sessionHash: "brother", interestId: f.interestId, decision: "accept" });
  }
}
async function decide(f: Fixture, general: boolean, who: "brother" | "sister") {
  if (general) return f.t.mutation(api.applicantInterests.giveFinalApproval, { adminSecret, sessionHash: who, interestId: f.interestId, approved: true });
  if (who === "brother") return f.t.mutation(api.femaleInterestWorkflow.brotherFinal, { sessionHash: who, interestId: f.interestId, approved: true });
  return f.t.mutation(api.femaleInterestWorkflow.confirm, { sessionHash: who, interestId: f.interestId, confirmed: true });
}
async function rows(f: Fixture) { return f.t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").withIndex("by_kind_and_status_and_nextAttemptAt", q => q.eq("kind", "final_request")).take(10)); }
for (const general of [true, false]) {
  test("bilateral first actionability, privacy, duplicate/concurrent drain " + general, async () => {
    const f = await fixture(general); await activate(f);
    const provider = vi.fn().mockResolvedValue(new Response("{}", { status: 200 })); vi.stubGlobal("fetch", provider);
    await accept(f, general); await accept(f, general);
    expect(await rows(f)).toHaveLength(2);
    expect((await rows(f)).every(r => r.status === "pending")).toBe(true);
    await Promise.all([f.t.action(internal.femaleWorkflowDelivery.drain, {}), f.t.action(internal.femaleWorkflowDelivery.drain, {})]);
    const finals = provider.mock.calls.filter(c => JSON.parse(c[1].body).subject === "Your final approval is needed");
    expect(finals).toHaveLength(2);
    expect(finals.map(c => JSON.parse(c[1].body).to[0]).sort()).toEqual(["brother@example.com", "sister@example.com"]);
    for (const call of finals) {
      const p = JSON.parse(call[1].body);
      expect(p.text).toBe("Your final approval is needed. Sign in to view and take action: https://www.1plus1match.com/" + (general ? "me?connection=" : "dashboard?femaleReview=") + f.interestId);
      for (const forbidden of ["Synthetic", hash, "5550100", "accepted", "confirmed", "photo"]) expect(p.text).not.toContain(forbidden);
    }
    expect(provider).toHaveBeenCalledTimes(2); // stale initial and all unrelated kinds excluded
    for (const who of ["brother", "sister"] as const) await decide(f, general, who);
    await f.t.action(internal.femaleWorkflowDelivery.drain, {}); expect(provider).toHaveBeenCalledTimes(2);
  });
  for (const first of ["brother", "sister"] as const) test("only own pending survives decision; both orders " + general + first, async () => {
    const f = await fixture(general); await activate(f); await accept(f, general);
    const result = await decide(f, general, first);
    if (general) expect(result).toMatchObject({ finalApprovalNotification: null });
    const provider = vi.fn().mockResolvedValue(new Response("{}", { status: 200 })); vi.stubGlobal("fetch", provider);
    await f.t.action(internal.femaleWorkflowDelivery.drain, {});
    expect(provider).toHaveBeenCalledTimes(1);
    expect(JSON.parse(provider.mock.calls[0][1].body).to).toEqual([first === "brother" ? "sister@example.com" : "brother@example.com"]);
    await decide(f, general, first === "brother" ? "sister" : "brother");
    await f.t.action(internal.femaleWorkflowDelivery.drain, {}); expect(provider).toHaveBeenCalledTimes(1);
  });
  test("no backlog or disabled tombstone replay " + general, async () => {
    const f = await fixture(general); await accept(f, general);
    expect((await rows(f)).every(r => r.status === "failed" && r.finalActivationAt === undefined)).toBe(true);
    await activate(f); await accept(f, general);
    const provider = vi.fn(); vi.stubGlobal("fetch", provider);
    await f.t.action(internal.femaleWorkflowDelivery.drain, {}); expect(provider).not.toHaveBeenCalled();
    for (const row of await rows(f)) await expect(f.t.mutation(api.femaleInterestWorkflow.retryDelivery, { adminSecret, deliveryId: row._id })).rejects.toThrow("activation");
  });
  for (const stage of ["claim", "freeze", "send"]) for (const invalid of ["decision", "reset", "archive", "recipient", "closed", "email"]) test("fence " + general + stage + invalid, async () => {
    const f = await fixture(general); await activate(f); await accept(f, general);
    const row = (await rows(f)).find(r => r.recipientId === f.brother)!;
    let attempt = 1;
    if (stage !== "claim") {
      const claimed = await f.t.mutation(internal.femaleWorkflowDelivery.claim, {}); attempt = claimed.find(r => r._id === row._id)!.attempts;
      if (stage === "send") expect(await f.t.mutation(internal.femaleWorkflowDelivery.markAttempt, { id: row._id, attempt })).toBeTruthy();
    }
    if (invalid === "decision") await decide(f, general, "brother");
    await f.t.run(async ctx => {
      if (invalid === "reset") await ctx.db.patch(f.interestId, { testReset: { at: Date.now(), reason: "test", actor: "admin" } });
      if (invalid === "archive") await ctx.db.patch(f.sister, { archivedAt: Date.now() });
      if (invalid === "recipient") await ctx.db.patch(row._id, { recipientId: f.sister });
      if (invalid === "closed") await ctx.db.patch(f.interestId, { status: "closed" });
      if (invalid === "email") await ctx.db.patch(f.brother, { email: "changed@example.com" });
    });
    if (stage === "claim") expect((await f.t.mutation(internal.femaleWorkflowDelivery.claim, {})).some(r => r._id === row._id)).toBe(false);
    else expect(await f.t.mutation(stage === "freeze" ? internal.femaleWorkflowDelivery.markAttempt : internal.femaleWorkflowDelivery.authorizeSend, { id: row._id, attempt })).toBe(false);
  });
}
test("activation immutable and dedicated mode only", async () => {
  const f = await fixture();
  await expect(f.t.mutation(internal.femaleWorkflowDelivery.activateFinalRequests, {})).rejects.toThrow("configuration");
  await activate(f);
  const before = await f.t.mutation(internal.femaleWorkflowDelivery.activateFinalRequests, {});
  expect(await f.t.mutation(internal.femaleWorkflowDelivery.activateFinalRequests, {})).toBe(before);
  await expect(f.t.mutation(api.settings.set, { adminSecret, key: FINAL_REQUEST_ACTIVATION_KEY, value: "1" })).rejects.toThrow("immutable");
});
for (const status of [429, 500]) test("frozen provider retry " + status, async () => {
  const f = await fixture(true); await activate(f); await accept(f, true);
  await decide(f, true, "sister");
  const provider = vi.fn().mockResolvedValueOnce(new Response("{}", { status })).mockResolvedValue(new Response("{}", { status: 200 })); vi.stubGlobal("fetch", provider);
  await f.t.action(internal.femaleWorkflowDelivery.drain, {});
  const row = (await rows(f)).find(r => r.recipientId === f.brother)!;
  await f.t.run(ctx => ctx.db.patch(row._id, { nextAttemptAt: 0, providerCooldownUntil: 0 }));
  await f.t.action(internal.femaleWorkflowDelivery.drain, {});
  expect(provider).toHaveBeenCalledTimes(2);
  expect(provider.mock.calls[0][1].body).toBe(provider.mock.calls[1][1].body);
  expect(provider.mock.calls[0][1].headers["Idempotency-Key"]).toBe(provider.mock.calls[1][1].headers["Idempotency-Key"]);
});

for (const stage of ["claim", "freeze", "send"]) for (const invalid of ["revoked", "expired"]) test("sister workflow " + stage + invalid, async () => {
  const f = await fixture(); await activate(f); await accept(f, false);
  const row = (await rows(f)).find(r => r.recipientId === f.brother)!;
  if (stage !== "claim") {
    await f.t.mutation(internal.femaleWorkflowDelivery.claim, {});
    if (stage === "send") await f.t.mutation(internal.femaleWorkflowDelivery.markAttempt, { id: row._id, attempt: 1 });
  }
  if (invalid === "revoked") await f.t.mutation(api.femaleInterestWorkflow.revokeReview, { adminSecret, interestId: f.interestId });
  else await f.t.run(async ctx => { const i = (await ctx.db.get(f.interestId))!; await ctx.db.patch(i._id, { femaleWorkflow: { ...i.femaleWorkflow!, reviewExpiresAt: Date.now() - 1 } }); });
  if (stage === "claim") expect((await f.t.mutation(internal.femaleWorkflowDelivery.claim, {})).some(r => r._id === row._id)).toBe(false);
  else expect(await f.t.mutation(stage === "freeze" ? internal.femaleWorkflowDelivery.markAttempt : internal.femaleWorkflowDelivery.authorizeSend, { id: row._id, attempt: 1 })).toBe(false);
});
test("private reads never enqueue, historical accepted rows never backfill without tombstones", async () => {
  const f = await fixture(); await activate(f);
  await f.t.query(api.femaleInterestWorkflow.getDashboard, { sessionHash: "sister" });
  expect(await rows(f)).toEqual([]);
  const ordinary = await fixture(true);
  await ordinary.t.run(async ctx => {
    const flow = (await ctx.db.query("interestFlows").first())!;
    await ctx.db.patch(flow._id, { recipientDecision: "accepted", bioVisibleAt: Date.now() - 1000, flowStatus: "bio_review" });
  });
  await activate(ordinary); await accept(ordinary, true); expect(await rows(ordinary)).toEqual([]);
});
test("legacy final recipient denied in dedicated mode; disabled preserves legacy behavior", async () => {
  const f = await fixture(true); await accept(f, true);
  const result = await decide(f, true, "brother");
  expect(result).toMatchObject({ finalApprovalNotification: { interestId: f.interestId } });
  configure();
  await expect(f.t.query(api.applicantInterests.getNotificationRecipient, { adminSecret, sessionHash: "brother", interestId: f.interestId, kind: "final_approval" })).rejects.toThrow("Legacy final");
});
test("dedicated mode still sends activated future brother inbound only", async () => {
  const f = await fixture(); await activate(f);
  await f.t.mutation(internal.femaleWorkflowDelivery.activateBrotherReview, {});
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 10);
  await f.t.mutation(api.femaleInterestWorkflow.createReview, { adminSecret, interestId: f.interestId, reviewTokenHash: hash });
  const provider = vi.fn().mockResolvedValue(new Response("{}", { status: 200 })); vi.stubGlobal("fetch", provider);
  await f.t.action(internal.femaleWorkflowDelivery.drain, {});
  expect(provider).toHaveBeenCalledTimes(1);
  expect(JSON.parse(provider.mock.calls[0][1].body).subject).toBe("A profile is ready for your review");
  expect(await rows(f)).toEqual([]);
});

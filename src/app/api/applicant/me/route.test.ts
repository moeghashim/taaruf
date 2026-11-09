// @vitest-environment node
import { convexTest } from "convex-test";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "../../../../../convex/_generated/api";
import schema from "../../../../../convex/schema";
import { modules } from "../../../../../convex/test.setup";
import type { Doc } from "../../../../../convex/_generated/dataModel";
const mocks = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/convex", () => ({ getConvexClient: () => mocks }));
vi.mock("@/lib/applicant-session", () => ({ getApplicantSessionHash: mocks.session }));
import { GET } from "./route";
import { GET as reviewGET } from "../female-review/route";
const secret = "synthetic-connection-admin";
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("ATTENDANCE_ADMIN_SECRET", secret); });
afterEach(() => vi.unstubAllEnvs());

async function fixture(source: Doc<"interests">["source"], female: boolean, olderHistory = true) {
  const t = convexTest(schema, modules);
  const { maleId, femaleId, eventId } = await t.run(async ctx => {
    const now = Date.now();
    const base = { age: 30, maritalStatus: "single", education: "College", job: "Engineer", phone: "5550100", status: "approved" as const, profileCompletionStatus: "completed" as const, createdAt: now };
    const maleId = await ctx.db.insert("registrations", { ...base, name: "Synthetic Brother", gender: "male", email: "brother@example.invalid", publicApplicantNumber: 1 });
    const femaleId = await ctx.db.insert("registrations", { ...base, name: "Synthetic Sister", gender: "female", email: "sister@example.invalid", publicApplicantNumber: 73 });
    const outsider = await ctx.db.insert("registrations", { ...base, name: "Other", gender: "male", email: "other@example.invalid", publicApplicantNumber: 3 });
    for (const [registrationId, sessionHash] of [[maleId, "brother"], [femaleId, "sister"], [outsider, "other"]] as const) await ctx.db.insert("applicantSessions", { registrationId, sessionHash, createdAt: now, expiresAt: now + 86400000 });
    const eventId = await ctx.db.insert("events", { title: "Synthetic", eventCode: "synthetic", series: "1plus1_match", eventMonth: "2026-11", location: "Test", startsAt: now - 3600000, endsAt: now - 1800000, status: "completed", maleCapacity: 10, femaleCapacity: 10, interestSubmissionsEnabled: true, interestSubmissionClosesAt: now + 3600000, createdAt: now, updatedAt: now });
    for (const [registrationId, gender] of [[maleId, "male"], [femaleId, "female"]] as const) {
      await ctx.db.insert("eventRegistrations", { eventId, registrationId, gender, registrationStatus: "approved", confirmationStatus: "confirmed", attendanceStatus: "attended", eligibilityStatus: "approved_member", createdAt: now, updatedAt: now });
      await ctx.db.insert("eventAttendees", { eventId, registrationId, addedAt: now });
    }
    if (olderHistory) for (let n = 0; n < 110; n++) await ctx.db.insert("interests", { eventId, fromRegistrationId: female ? femaleId : maleId, toRegistrationId: female ? maleId : femaleId, source: "admin_entered", status: "closed", visibility: female ? "internal_only" : "admin_actionable", createdAt: now, updatedAt: now });
    return { maleId, femaleId, eventId };
  });
  const id = source === "platform_submission"
    ? (await t.mutation(api.applicantInterests.submitInterestNumber, { sessionHash: female ? "sister" : "brother", expectedEventId: eventId, applicantNumber: female ? 1 : 73, applicantName: "Synthetic", photoConsent: "no" })).interestId
    : await t.mutation(api.interests.create, { adminSecret: secret, eventId, fromRegistrationId: female ? femaleId : maleId, toRegistrationId: female ? maleId : femaleId, source });
  if (female) {
    await t.mutation(api.femaleInterestWorkflow.createReview, { adminSecret: secret, interestId: id, reviewTokenHash: "a".repeat(64) });
    await t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash: "brother", interestId: id });
    await t.mutation(api.femaleInterestWorkflow.respond, { sessionHash: "brother", interestId: id, decision: "accept" });
    await t.mutation(api.femaleInterestWorkflow.confirm, { sessionHash: "sister", interestId: id, confirmed: true });
  } else {
    const discovered = await t.query(api.applicantInterests.getDashboard, { sessionHash: "sister", connectionId: id });
    expect(discovered.inbound.some(row => row.interestId === id)).toBe(true);
    await t.mutation(api.applicantInterests.respondToInbound, { sessionHash: "sister", interestId: id, decision: "accept" });
    for (const sessionHash of ["brother", "sister"]) await t.mutation(api.applicantInterests.giveFinalApproval, { sessionHash, interestId: id, approved: true });
  }
  mocks.query.mockImplementation((fn, args) => t.query(fn, args));
  mocks.mutation.mockResolvedValue(true);
  mocks.session.mockResolvedValue("brother");
  const matchId = (await t.run(ctx => ctx.db.get(id)))!.matchId!;
  return { t, id, matchId, maleId, femaleId };
}

for (const source of ["platform_submission", "admin_entered", "email", "whatsapp"] as const) for (const female of [false, true]) test(`${source} requested ${female ? "female" : "general"} pending/released connection survives 110 older closed rows`, async () => {
  const { t, id, matchId } = await fixture(source, female);
  for (const released of [false, true]) {
    if (released) await t.mutation(api.matches.updateStatus, { adminSecret: secret, id: matchId, status: "contact_shared" });
    for (const sessionHash of ["brother", "sister"]) {
      mocks.session.mockResolvedValue(sessionHash);
      const response = female && sessionHash === "brother"
        ? await reviewGET(new NextRequest(`https://synthetic.invalid/api/applicant/female-review?interestId=${id}`))
        : await GET(new NextRequest(`https://synthetic.invalid/api/applicant/me?connection=${id}`));
      expect(response.status).toBe(200);
      const payload = await response.json();
      const row = female && sessionHash === "brother" ? payload : [...payload.inbound, ...payload.outbound, ...payload.privateDocumented].find((row: { interestId: string }) => row.interestId === id);
      expect(row.interestId).toBe(id);
      const profile = row.profile ?? row.counterparty;
      expect(profile.email).toBe(released ? `${sessionHash === "brother" ? "sister" : "brother"}@example.invalid` : null);
      if (female && sessionHash === "sister") expect(row.femaleWorkflow).toEqual({ state: released ? "contacts_released" : "pending_admin_approval" });
      if (sessionHash === "brother") expect(JSON.stringify(row)).not.toContain("Synthetic Sister");
      expect(JSON.stringify(row)).not.toContain("reviewTokenHash");
    }
  }
  await t.mutation(api.matches.setPausedForApplicant, { sessionHash: "brother", interestId: id, paused: true });
  const paused = await t.query(api.applicantInterests.getDashboard, { sessionHash: female ? "sister" : "brother", connectionId: id });
  expect([...paused.inbound, ...paused.outbound, ...paused.privateDocumented].find(row => row.interestId === id)?.paused).toBe(true);
});

test("old female rows serialize their discriminator independently of newer review pages", async () => {
  const { t, id } = await fixture("email", true, false);
  await t.run(async ctx => {
    const { _id, _creationTime, ...copy } = (await ctx.db.get(id))!;
    void _id; void _creationTime;
    for (let n = 0; n < 110; n++) await ctx.db.insert("interests", { ...copy, matchId: undefined, status: "closed", femaleWorkflow: { state: "declined" } });
  });
  mocks.session.mockResolvedValue("sister");
  const response = await GET(new NextRequest("https://synthetic.invalid/api/applicant/me"));
  const payload = await response.json();
  expect(payload.privateDocumented.find((row: { interestId: string }) => row.interestId === id)?.femaleWorkflow).toEqual({ state: "pending_admin_approval" });
  expect(mocks.query).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(payload)).not.toContain("reviewTokenHash");
});

test("requested lookup denies unrelated, anonymous and stale records", async () => {
  const { t, id, matchId } = await fixture("email", false);
  const request = () => new NextRequest(`https://synthetic.invalid/api/applicant/me?connection=${id}`);
  mocks.session.mockResolvedValue("other");
  expect((await GET(request())).status).toBe(404);
  await expect(t.query(api.applicantInterests.getDashboard, { sessionHash: "other", connectionId: id })).rejects.toThrow("Connection unavailable");
  mocks.session.mockResolvedValue(null);
  expect((await GET(request())).status).toBe(401);
  await expect(t.query(api.applicantInterests.getDashboard, { sessionHash: "missing", connectionId: id })).rejects.toThrow("Unauthorized");
  mocks.session.mockResolvedValue("brother");
  await t.mutation(api.matches.updateStatus, { adminSecret: secret, id: matchId, status: "closed" });
  expect((await GET(request())).status).toBe(404);
});

test("requested reset and privately unshared female reviews are unavailable", async () => {
  const { t, id, matchId, femaleId } = await fixture("email", false);
  await t.mutation(api.matches.updateStatus, { adminSecret: secret, id: matchId, status: "closed" });
  const privateId = await t.mutation(api.applicantInterests.submitInterestNumber, { sessionHash: "sister", expectedEventId: (await t.run(ctx => ctx.db.get(id)))!.eventId, applicantNumber: 1, applicantName: "Synthetic", photoConsent: "no" });
  await expect(t.query(api.applicantInterests.getDashboard, { sessionHash: "brother", connectionId: privateId.interestId })).rejects.toThrow("Connection unavailable");
  await t.mutation(api.interests.updateStatus, { adminSecret: secret, id: privateId.interestId, status: "closed" });
  const next = await t.mutation(api.interests.create, { adminSecret: secret, fromRegistrationId: (await t.run(ctx => ctx.db.get(id)))!.fromRegistrationId, toRegistrationId: femaleId, eventId: (await t.run(ctx => ctx.db.get(id)))!.eventId, source: "email" });
  await t.run(ctx => ctx.db.patch(next, { testReset: { at: Date.now(), reason: "Historical reset fixture", actor: "admin" } }));
  await expect(t.query(api.applicantInterests.getDashboard, { sessionHash: "brother", connectionId: next })).rejects.toThrow("Connection unavailable");
});

test("female requested reviews deny unrelated and anonymous sessions beyond history limits", async () => {
  const { t, id } = await fixture("email", true);
  const request = () => new NextRequest(`https://synthetic.invalid/api/applicant/female-review?interestId=${id}`);
  mocks.session.mockResolvedValue("other");
  expect((await reviewGET(request())).status).toBe(401);
  await expect(t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash: "other", interestId: id })).rejects.toThrow("Unauthorized");
  mocks.session.mockResolvedValue(null);
  expect((await reviewGET(request())).status).toBe(401);
});

test("pending general access and malformed requested identifiers retain their boundaries", async () => {
  const { t, maleId } = await fixture("email", false);
  await t.run(ctx => ctx.db.patch(maleId, { status: "pending" }));
  const response = await GET(new NextRequest("https://synthetic.invalid/api/applicant/me"));
  expect(response.status).toBe(200);
  expect((await response.json()).applicant.status).toBe("pending");
  mocks.query.mockClear();
  expect((await GET(new NextRequest("https://synthetic.invalid/api/applicant/me?connection="))).status).toBe(400);
  expect(mocks.query).not.toHaveBeenCalled();
});

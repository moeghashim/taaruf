// @vitest-environment node
import { convexTest } from "convex-test";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "../../../../../convex/_generated/api";
import schema from "../../../../../convex/schema";
import { modules } from "../../../../../convex/test.setup";
import type { Doc } from "../../../../../convex/_generated/dataModel";
const mocks = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), session: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/convex", () => ({ getConvexClient: () => mocks }));
vi.mock("@/lib/applicant-session", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/applicant-session")>(), getApplicantSessionHash: mocks.session }));
vi.mock("resend", () => ({ Resend: class { emails = { send: mocks.send }; } }));
import { POST as loginPOST } from "../login/route";
import { GET as verifyGET } from "../login/verify/route";
import { applicantSessionCookie, hashToken } from "@/lib/applicant-session";
import { POST as interestPOST } from "../interests/route";
import { GET } from "./route";
import { GET as reviewGET, POST as reviewPOST } from "../female-review/route";
const secret = "synthetic-connection-admin";
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("ATTENDANCE_ADMIN_SECRET", secret); vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://synthetic.invalid"); mocks.send.mockResolvedValue({ data: { id: "synthetic-only" }, error: null }); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

async function fixture(source: Doc<"interests">["source"], female: boolean, olderHistory = true, complete = true) {
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
  if (complete && female) {
    await t.mutation(api.femaleInterestWorkflow.createReview, { adminSecret: secret, interestId: id, reviewTokenHash: "a".repeat(64) });
    await t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash: "brother", interestId: id });
    await t.mutation(api.femaleInterestWorkflow.respond, { sessionHash: "brother", interestId: id, decision: "accept" });
    await t.mutation(api.femaleInterestWorkflow.confirm, { sessionHash: "sister", interestId: id, confirmed: true });
  } else if (complete) {
    const discovered = await t.query(api.applicantInterests.getDashboard, { sessionHash: "sister", connectionId: id });
    expect(discovered.inbound.some(row => row.interestId === id)).toBe(true);
    await t.mutation(api.applicantInterests.respondToInbound, { sessionHash: "sister", interestId: id, decision: "accept" });
    for (const sessionHash of ["brother", "sister"]) await t.mutation(api.applicantInterests.giveFinalApproval, { sessionHash, interestId: id, approved: true });
  }
  mocks.query.mockImplementation((fn, args) => t.query(fn, args));
  mocks.mutation.mockResolvedValue(true);
  mocks.session.mockResolvedValue("brother");
  const matchId = (await t.run(ctx => ctx.db.get(id)))!.matchId!;
  return { t, id, matchId, maleId, femaleId, eventId };
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
      if (female && sessionHash === "sister") expect(row.femaleWorkflow).toBe(true);
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
  expect(payload.privateDocumented.find((row: { interestId: string }) => row.interestId === id)?.femaleWorkflow).toBe(true);
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

test("both ordinary emitted notification URLs resolve their connection beyond 110 closed rows", async () => {
  const { t, id: original, eventId } = await fixture("email", false, true, false);
  await t.mutation(api.interests.updateStatus, { adminSecret: secret, id: original, status: "closed" });
  mocks.mutation.mockImplementation((fn, args) => t.mutation(fn, args));
  const post = (body: object) => interestPOST(new NextRequest("https://synthetic.invalid/api/applicant/interests", { method: "POST", body: JSON.stringify(body) }));
  const submission = await post({ action: "submit_number", expectedEventId: eventId, applicantNumber: 73, applicantName: "Synthetic", photoConsent: "no" });
  expect(submission.status).toBe(200);
  const id = (await submission.json()).result.interestId;
  expect(mocks.send).toHaveBeenCalledTimes(1);
  async function land(index: number, sessionHash: string, expectedStatus: string) {
    const message = mocks.send.mock.calls[index][0];
    const url = new URL(/href="([^"]+)"/.exec(message.html)![1]);
    expect(url.pathname).toBe("/me"); expect(url.searchParams.get("connection")).toBe(id);
    expect(message.text).toContain(url.toString());
    mocks.session.mockResolvedValue(sessionHash);
    const response = await GET(new NextRequest(`https://synthetic.invalid/api/applicant/me${url.search}`));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect([...payload.inbound, ...payload.outbound].find((row: { interestId: string }) => row.interestId === id)?.flowStatus).toBe(expectedStatus === "contact_shared" ? "contact_shared" : "in_progress");
    if (sessionHash === "brother") expect(JSON.stringify(message)).not.toContain("Synthetic Sister");
  }
  await land(0, "sister", "awaiting_inbound_response");
  expect((await post({ action: "respond", interestId: id, decision: "accept" })).status).toBe(200);
  expect((await post({ action: "final_approval", interestId: id, approved: true })).status).toBe(200);
  expect(mocks.send).toHaveBeenCalledTimes(2);
  await land(1, "brother", "awaiting_final_approvals");
});

for (const confirmed of [false, true]) test(`selected older female review supports decision=${confirmed} and pause/resume outside its first history page`, async () => {
  const { t, id } = await fixture("email", true, false, false);
  await t.mutation(api.femaleInterestWorkflow.createReview, { adminSecret: secret, interestId: id, reviewTokenHash: "a".repeat(64) });
  await t.mutation(api.femaleInterestWorkflow.respond, { sessionHash: "brother", interestId: id, decision: "accept" });
  await t.run(async ctx => {
    const { _id, _creationTime, ...history } = (await ctx.db.get(id))!;
    void _id; void _creationTime;
    for (let n = 0; n < 60; n++) await ctx.db.insert("interests", { ...history, status: "closed", femaleWorkflow: { state: "declined" } });
  });
  mocks.mutation.mockImplementation((fn, args) => t.mutation(fn, args));
  mocks.session.mockResolvedValue("sister");
  const firstPage = await t.query(api.femaleInterestWorkflow.getDashboardPage, { sessionHash: "sister", paginationOpts: { cursor: null, numItems: 50 } });
  expect(firstPage.page).toHaveLength(50); expect(firstPage.isDone).toBe(false);
  for (const row of firstPage.page) expect(row).toEqual({ interestId: expect.any(String), role: "sister", state: "closed", ownDecision: "pending", ownAction: null, paused: false, reviewExpired: false, canPause: false, canView: false });
  expect(firstPage.page.some(row => row.interestId === id)).toBe(false);
  const get = () => reviewGET(new NextRequest(`https://synthetic.invalid/api/applicant/female-review?interestId=${id}`));
  expect((await (await get()).json()).state).toBe("in_review");
  const decide = () => reviewPOST(new NextRequest("https://synthetic.invalid/api/applicant/female-review", { method: "POST", headers: { origin: "https://synthetic.invalid", host: "synthetic.invalid" }, body: JSON.stringify({ action: "confirm", interestId: id, confirmed }) }));
  mocks.session.mockResolvedValue("other"); expect((await decide()).status).toBe(401);
  mocks.session.mockResolvedValue(null); expect((await decide()).status).toBe(401);
  mocks.session.mockResolvedValue("sister"); expect((await decide()).status).toBe(200);
  if (!confirmed) { expect((await get()).status).toBe(409); return; }
  expect((await (await get()).json()).state).toBe("in_review");
  for (const paused of [true, false]) {
    const response = await interestPOST(new NextRequest("https://synthetic.invalid/api/applicant/interests", { method: "POST", body: JSON.stringify({ action: paused ? "pause_connection" : "resume_connection", interestId: id }) }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({error: "Pause unavailable until contact release"});
  }
  await t.mutation(api.femaleInterestWorkflow.releaseContacts, {adminSecret: secret, interestId: id});
  for (const paused of [true, false]) {
    const action = paused ? "pause_connection" : "resume_connection";
    expect((await interestPOST(new NextRequest("https://synthetic.invalid/api/applicant/interests", { method: "POST", body: JSON.stringify({ action, interestId: id }) }))).status).toBe(200);
    const response = await get(); expect(response.status).toBe(200);
    expect((await response.json()).paused).toBe(paused);
  }
});

async function requestMagicLink(email: string, next: string) {
  const response = await loginPOST(new NextRequest("https://synthetic.invalid/api/applicant/login", { method: "POST", body: JSON.stringify({ email, next }) }));
  expect(response.status).toBe(200);
  const message = mocks.send.mock.calls.at(-1)![0];
  return new URL(/href="([^"]+)"/.exec(message.html)![1]);
}

for (const source of ["platform_submission", "admin_entered", "email", "whatsapp"] as const) for (const female of [false, true]) for (const released of [false, true]) test(`expired-session ${source} ${female ? "female" : "general"} magic login returns to ${released ? "released" : "pending"} target`, async () => {
  const { t, id, matchId } = await fixture(source, female);
  if (released) await t.mutation(api.matches.updateStatus, { adminSecret: secret, id: matchId, status: "contact_shared" });
  if (female) await t.run(async ctx => {
    const { _id, _creationTime, ...history } = (await ctx.db.get(id))!;
    void _id; void _creationTime;
    for (let n = 0; n < 60; n++) await ctx.db.insert("interests", { ...history, matchId: undefined, status: "closed", femaleWorkflow: { state: "declined" } });
  });
  await t.run(async ctx => {
    const session = await ctx.db.query("applicantSessions").withIndex("by_sessionHash", q => q.eq("sessionHash", "brother")).unique();
    await ctx.db.patch(session!._id, { expiresAt: Date.now() - 1 });
  });
  const destination = female ? `/dashboard?femaleReview=${id}` : `/me?connection=${id}`;
  const targetRequest = () => new NextRequest(female ? `https://synthetic.invalid/api/applicant/female-review?interestId=${id}` : `https://synthetic.invalid/api/applicant/me?connection=${id}`);
  expect((await (female ? reviewGET(targetRequest()) : GET(targetRequest()))).status).toBe(401);
  mocks.mutation.mockImplementation((fn, args) => t.mutation(fn, args));
  const link = await requestMagicLink("brother@example.invalid", destination + "&reviewToken=never-forward-this-secret");
  expect(link.searchParams.get("next")).toBe(destination);
  expect(link.toString()).not.toContain("never-forward-this-secret");
  const verified = await verifyGET(new NextRequest(link));
  expect(verified.status).toBe(307);
  expect(verified.headers.get("location")).toBe("https://synthetic.invalid" + destination);
  expect(verified.headers.get("referrer-policy")).toBe("no-referrer");
  const cookie = verified.cookies.get(applicantSessionCookie)!;
  expect(cookie.httpOnly).toBe(true); expect(cookie.sameSite).toBe("lax");
  mocks.session.mockResolvedValue(hashToken(cookie.value));
  const landed = await (female ? reviewGET(targetRequest()) : GET(targetRequest()));
  expect(landed.status).toBe(200);
  const payload = await landed.json();
  const profile = female ? payload.profile : payload.outbound.find((row: { interestId: string }) => row.interestId === id)?.counterparty;
  expect(profile.email).toBe(released ? "sister@example.invalid" : null);
  expect(JSON.stringify(payload)).not.toContain("Synthetic Sister");
  const replay = await verifyGET(new NextRequest(link));
  const retry = new URL(replay.headers.get("location")!);
  expect(retry.pathname).toBe("/login"); expect(retry.searchParams.get("next")).toBe(destination);
  expect(retry.searchParams.get("error")).toBe("invalid"); expect(retry.searchParams.has("token")).toBe(false);
});

for (const destination of ["https://evil.invalid", "//evil.invalid", "/\\evil.invalid", "%2f%2fevil.invalid", "/me%3fconnection=target", "/me?connection=%2f%2fevil.invalid", "/me?connection=a&connection=b"]) test(`login and verify independently reject ${destination}`, async () => {
  const { t } = await fixture("email", false, false, false);
  mocks.mutation.mockImplementation((fn, args) => t.mutation(fn, args));
  const link = await requestMagicLink("brother@example.invalid", destination);
  expect(link.searchParams.has("next")).toBe(false);
  link.searchParams.set("next", destination);
  const verified = await verifyGET(new NextRequest(link));
  expect(verified.headers.get("location")).toBe("https://synthetic.invalid/me");
});

test("capability cutoff denies the magic link while retaining only a safe retry destination", async () => {
  const { t, id } = await fixture("email", false);
  mocks.mutation.mockImplementation((fn, args) => t.mutation(fn, args));
  const destination = `/me?connection=${id}`;
  const link = await requestMagicLink("brother@example.invalid", destination);
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 1000);
  await t.mutation(api.settings.set, { adminSecret: secret, key: "capabilitySecurityCutoffMs", value: String(Date.now()) });
  const response = await verifyGET(new NextRequest(link));
  const retry = new URL(response.headers.get("location")!);
  expect(retry.searchParams.get("next")).toBe(destination); expect(retry.searchParams.get("error")).toBe("invalid");
  expect(response.cookies.get(applicantSessionCookie)).toBeUndefined();
});

for (const female of [false, true]) test(`reauthentication grants no access to unrelated or closed ${female ? "review" : "general"} connections`, async () => {
  const { t, id, matchId } = await fixture("email", female);
  mocks.mutation.mockImplementation((fn, args) => t.mutation(fn, args));
  const destination = female ? `/dashboard?femaleReview=${id}` : `/me?connection=${id}`;
  const land = () => female ? reviewGET(new NextRequest(`https://synthetic.invalid/api/applicant/female-review?interestId=${id}`)) : GET(new NextRequest(`https://synthetic.invalid/api/applicant/me?connection=${id}`));
  const other = await verifyGET(new NextRequest(await requestMagicLink("other@example.invalid", destination)));
  mocks.session.mockResolvedValue(hashToken(other.cookies.get(applicantSessionCookie)!.value));
  expect((await land()).status).toBe(female ? 401 : 404);
  await t.mutation(api.matches.updateStatus, { adminSecret: secret, id: matchId, status: "closed" });
  const own = await verifyGET(new NextRequest(await requestMagicLink("brother@example.invalid", destination)));
  mocks.session.mockResolvedValue(hashToken(own.cookies.get(applicantSessionCookie)!.value));
  expect((await land()).status).toBe(female ? 409 : 404);
});

test("missing login tokens preserve a safe destination without disclosing incoming secrets", async () => {
  const next = "/dashboard?femaleReview=older&reviewToken=private-secret";
  const url = new URL("https://synthetic.invalid/api/applicant/login/verify"); url.searchParams.set("next", next);
  const response = await verifyGET(new NextRequest(url));
  const retry = new URL(response.headers.get("location")!);
  expect(retry.searchParams.get("next")).toBe("/dashboard?femaleReview=older");
  expect(retry.searchParams.get("error")).toBe("missing");
  expect(retry.toString()).not.toContain("private-secret"); expect(mocks.mutation).not.toHaveBeenCalled();
});

test("unregistered login requests retain the generic response and send no mail", async () => {
  const { t } = await fixture("email", false, false, false);
  mocks.mutation.mockImplementation((fn, args) => t.mutation(fn, args));
  const response = await loginPOST(new NextRequest("https://synthetic.invalid/api/applicant/login", { method: "POST", body: JSON.stringify({ email: "absent@example.invalid", next: "/dashboard?femaleReview=private" }) }));
  expect(await response.json()).toEqual({ success: true }); expect(mocks.send).not.toHaveBeenCalled();
});

test("a fresh magic login cannot revive a reset requested submission", async () => {
  const { t, id } = await fixture("platform_submission", false, true, false);
  await t.mutation(api.interestTestReset.reset, { adminSecret: secret, id, confirmTest: true, reason: "Synthetic reset before reauthentication" });
  mocks.mutation.mockImplementation((fn, args) => t.mutation(fn, args));
  const verified = await verifyGET(new NextRequest(await requestMagicLink("brother@example.invalid", `/me?connection=${id}`)));
  mocks.session.mockResolvedValue(hashToken(verified.cookies.get(applicantSessionCookie)!.value));
  expect((await GET(new NextRequest(`https://synthetic.invalid/api/applicant/me?connection=${id}`))).status).toBe(404);
});

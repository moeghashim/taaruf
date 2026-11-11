import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";

import { convexTest } from "convex-test";
import type { Id, Doc } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

const workflowAdmin = "workflow-synthetic-admin";
const reviewHash = "a".repeat(64);
async function publicWorld() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const now = Date.now();
    const event = await ctx.db.insert("events", { title: "Synthetic", eventCode: "synthetic", eventMonth: "2026-11", series: "1plus1_match", location: "Test", startsAt: now - 3600000, endsAt: now - 1800000, status: "completed", maleCapacity: 10, femaleCapacity: 10, interestSubmissionsEnabled: true, interestSubmissionClosesAt: now + 3600000, createdAt: now, updatedAt: now });
    const people = [];
    for (const [index, gender] of ["male", "female", "male", "female"].entries()) {
      const name = ["Brother Alpha", "Sister Private", "Brother Beta", "Other Sister"][index];
      const id = await ctx.db.insert("registrations", { name, publicApplicantNumber: index + 1, gender: gender as "male" | "female", age: 30, maritalStatus: "single", education: "College", job: "Engineer", email: `person${index}@example.invalid`, phone: `555010${index}`, status: "approved", profileCompletionStatus: "completed", createdAt: now });
      people.push(id);
      await ctx.db.insert("applicantSessions", { registrationId: id, sessionHash: `session-${index}`, createdAt: now, expiresAt: now + 86400000 });
      await ctx.db.insert("eventRegistrations", { eventId: event, registrationId: id, gender: gender as "male" | "female", registrationStatus: "approved", confirmationStatus: "confirmed", attendanceStatus: "attended", eligibilityStatus: "approved_member", createdAt: now, updatedAt: now });
      await ctx.db.insert("eventAttendees", { eventId: event, registrationId: id, addedAt: now });
    }
    return { event, people };
  });
  async function submit(source: Doc<"interests">["source"], from = 0, to = 1) {
    if (source === "platform_submission") return (await t.mutation(api.applicantInterests.submitInterestNumber, { sessionHash: `session-${from}`, expectedEventId: ids.event, applicantNumber: to + 1, applicantName: to === 1 || to === 3 ? (to === 1 ? "Sister" : "Other") : "Brother", photoConsent: "no" })).interestId;
    return await t.mutation(api.interests.create, { adminSecret: workflowAdmin, fromRegistrationId: ids.people[from], toRegistrationId: ids.people[to], eventId: ids.event, source });
  }
  async function open(interestId: Id<"interests">, femaleOrigin = false, recipient = 1) {
    if (femaleOrigin) {
      await t.mutation(api.femaleInterestWorkflow.createReview, { adminSecret: workflowAdmin, interestId, reviewTokenHash: reviewHash });
      const reviews = await t.query(api.femaleInterestWorkflow.getDashboard, { sessionHash: "session-0" });
      if (!reviews.some(row => row.interestId === interestId)) throw new Error("Review discovery failed");
      await t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash: "session-0", interestId });
    } else {
      const dashboard = await t.query(api.applicantInterests.getDashboard, { sessionHash: `session-${recipient}` });
      if (!dashboard.inbound.some(row => row.interestId === interestId)) throw new Error("Inbound discovery failed");
      await t.mutation(api.applicantInterests.respondToInbound, { sessionHash: `session-${recipient}`, interestId, decision: "accept" });
    }
  }
  async function approve(interestId: Id<"interests">, person: number) {
    return await t.mutation(api.applicantInterests.giveFinalApproval, { adminSecret: workflowAdmin, sessionHash: `session-${person}`, interestId, approved: true });
  }
  return { t, ...ids, submit, open, approve };
}

beforeEach(() => vi.stubEnv("ATTENDANCE_ADMIN_SECRET", workflowAdmin));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const sources = ["platform_submission", "admin_entered", "email", "whatsapp"] as const;

for (const source of sources) for (const femaleOrigin of [false, true]) test(`${source} ${femaleOrigin ? "female" : "male"} public discovery, consent, release and resume`, async () => {
  const w = await publicWorld();
  const interestId = await w.submit(source, femaleOrigin ? 1 : 0, femaleOrigin ? 0 : 1);
  const original = await w.t.run(ctx => ctx.db.get(interestId));
  await w.open(interestId, femaleOrigin);
  expect(await w.t.run(ctx => ctx.db.query("matches").collect())).toHaveLength(0);
  if (femaleOrigin) {
    await w.t.mutation(api.femaleInterestWorkflow.respond, { sessionHash: "session-0", interestId, decision: "accept" });
    expect(await w.t.run(ctx => ctx.db.query("matches").collect())).toHaveLength(0);
    await w.t.mutation(api.femaleInterestWorkflow.confirm, { sessionHash: "session-1", interestId, confirmed: true });
  } else {
    const first = await w.approve(interestId, 0);
    expect(JSON.stringify(first)).not.toContain("Sister Private");
    expect(JSON.stringify(first)).not.toContain("person1@example.invalid");
    expect(first.matchId).toBeNull();
    await w.approve(interestId, 1);
  }
  const row = (await w.t.run(ctx => ctx.db.get(interestId)))!;
  expect(row.source).toBe(source);
  expect(row.senderPhotoConsent).toBe(original?.senderPhotoConsent);
  expect(row.eventId).toBe(w.event);
  const matchId = row.matchId!;
  expect(await w.t.run(ctx => ctx.db.get(matchId))).toMatchObject({ status: "reviewing", contactGate: "pending_admin_approval" });
  await expect(w.t.mutation(api.matches.setPausedForApplicant, { sessionHash: "session-0", interestId, paused: true })).rejects.toThrow("Pause unavailable until contact release");
  await w.t.mutation(api.matches.updateStatus, { adminSecret: workflowAdmin, id: matchId, status: "paused" });
  await w.t.mutation(api.matches.updateStatus, { adminSecret: workflowAdmin, id: matchId, status: "paused", adminNotes: "Paused notes retained" });
  expect((await w.t.run(ctx => ctx.db.get(matchId)))?.adminNotes).toBe("Paused notes retained");
  await expect(w.t.mutation(api.matches.updateStatus, { adminSecret: workflowAdmin, id: matchId, status: "contact_shared" })).rejects.toThrow("not active");
  await expect(w.t.mutation(api.matches.setPausedForApplicant, { sessionHash: "session-2", interestId, paused: false })).rejects.toThrow("Unauthorized");
  await w.t.mutation(api.matches.resume, { adminSecret: workflowAdmin, id: matchId });
  await w.t.mutation(api.matches.updateStatus, { adminSecret: workflowAdmin, id: matchId, status: "contact_shared" });
  const deliveries = await w.t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").collect());
  expect(deliveries.filter(d => d.kind === "contacts_ready")).toHaveLength(2);
  await w.t.mutation(api.matches.updateStatus, { adminSecret: workflowAdmin, id: matchId, status: "contact_shared", adminNotes: "Released notes retained" });
  expect((await w.t.run(ctx => ctx.db.get(matchId)))?.adminNotes).toBe("Released notes retained");
  const first = await w.t.run(ctx => ctx.db.get(matchId));
  await w.t.mutation(api.matches.updateStatus, { adminSecret: workflowAdmin, id: matchId, status: "paused" });
  await w.t.mutation(api.matches.setPausedForApplicant, { sessionHash: "session-1", interestId, paused: false });
  expect((await w.t.run(ctx => ctx.db.get(matchId)))?.adminReleasedAt).toBe(first?.adminReleasedAt);
  expect(await w.t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").collect())).toEqual(deliveries);
  for (const person of [0, 1]) {
    const payload = femaleOrigin ? await w.t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash: `session-${person}`, interestId }) : await w.t.query(api.applicantInterests.getDashboard, { sessionHash: `session-${person}` });
    expect(JSON.stringify(payload)).toContain(`person${1 - person}@example.invalid`);
  }
});

for (const source of sources) for (const femaleFirst of [false, true]) for (const reverse of [false, true]) test(`reciprocal ${source} submissions=${femaleFirst} approvals=${reverse}`, async () => {
  const w = await publicWorld();
  const ids = femaleFirst ? [await w.submit(source, 1, 0), await w.submit(source)] : [await w.submit(source), await w.submit(source, 1, 0)];
  const female = ids[femaleFirst ? 0 : 1];
  const male = ids[femaleFirst ? 1 : 0];
  await w.open(male);
  await w.open(female, true);
  expect(await w.t.run(ctx => ctx.db.query("matches").collect())).toHaveLength(0);
  if (reverse) {
    await w.approve(male, 1);
    expect(await w.t.run(ctx => ctx.db.query("matches").collect())).toHaveLength(0);
    await w.t.mutation(api.femaleInterestWorkflow.respond, { sessionHash: "session-0", interestId: female, decision: "accept" });
  } else {
    await w.t.mutation(api.femaleInterestWorkflow.respond, { sessionHash: "session-0", interestId: female, decision: "accept" });
    expect(await w.t.run(ctx => ctx.db.query("matches").collect())).toHaveLength(0);
    await w.approve(male, 1);
  }
  const matches = await w.t.run(ctx => ctx.db.query("matches").collect());
  expect(matches).toHaveLength(1);
  for (const id of ids) expect((await w.t.run(ctx => ctx.db.get(id)))?.matchId).toBe(matches[0]._id);
  await w.approve(male, 0);
  await w.t.mutation(api.femaleInterestWorkflow.confirm, { sessionHash: "session-1", interestId: female, confirmed: true });
  await w.t.mutation(api.matches.updateStatus, { adminSecret: workflowAdmin, id: matches[0]._id, status: "contact_shared" });
  await w.approve(male, 1);
  await w.t.mutation(api.femaleInterestWorkflow.respond, { sessionHash: "session-0", interestId: female, decision: "accept" });
  expect(await w.t.run(ctx => ctx.db.query("matches").collect())).toHaveLength(1);
  const deliveries = await w.t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").collect());
  expect(deliveries.filter(d => d.kind === "pending_review")).toHaveLength(2);
  expect(deliveries.filter(d => d.kind === "contacts_ready")).toHaveLength(2);
});

for (const source of sources) test(`participant reservation blocks competing ${source} pending matches`, async () => {
  const w = await publicWorld();
  const first = await w.submit(source);
  const second = await w.submit(source, 2, 1);
  await w.open(first); await w.open(second);
  await w.approve(first, 0); await w.approve(second, 2);
  const results = await Promise.allSettled([w.approve(first, 1), w.approve(second, 1)]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(await w.t.run(ctx => ctx.db.query("matches").collect())).toHaveLength(1);
});

test("public mutation responses are safe and notification recipients require server authorization", async () => {
  const w = await publicWorld();
  const submission = await w.t.mutation(api.applicantInterests.submitInterestNumber, { sessionHash: "session-0", expectedEventId: w.event, applicantNumber: 2, applicantName: "Sister", photoConsent: "no" });
  expect(JSON.stringify(submission)).not.toContain("Sister Private");
  expect(JSON.stringify(submission)).not.toContain("person1@example.invalid");
  await expect(w.t.query(api.applicantInterests.getNotificationRecipient, { sessionHash: "session-0", interestId: submission.interestId, kind: "inbound" })).rejects.toThrow("Unauthorized");
  expect(await w.t.query(api.applicantInterests.getNotificationRecipient, { adminSecret: workflowAdmin, sessionHash: "session-0", interestId: submission.interestId, kind: "inbound" })).toMatchObject({ name: "Sister Private", email: "person1@example.invalid" });
  await w.open(submission.interestId);
  const result = await w.approve(submission.interestId, 0);
  expect(JSON.stringify(result)).not.toContain("Sister Private");
  expect(JSON.stringify(result)).not.toContain("person1@example.invalid");
});

for (const source of sources) test(`unshared ${source} female interest can be closed or declined`, async () => {
  for (const status of ["closed", "declined"] as const) {
    const w = await publicWorld(); const id = await w.submit(source, 1, 0);
    await expect(w.t.mutation(api.interests.updateStatus, { id, status })).rejects.toThrow("Unauthorized");
    await w.t.mutation(api.interests.updateStatus, { adminSecret: workflowAdmin, id, status });
    expect((await w.t.run(ctx => ctx.db.get(id)))?.status).toBe(status);
    expect(await w.t.query(api.femaleInterestWorkflow.getDashboard, { sessionHash: "session-0" })).toEqual([]);
    expect(await w.t.run(ctx => ctx.db.query("matches").collect())).toHaveLength(0);
  }
});

test("resume fails after an intervening match and retains paused history", async () => {
  const w = await publicWorld();
  const first = await w.submit("platform_submission"); await w.open(first); await w.approve(first, 0); const approved = await w.approve(first, 1);
  await w.t.mutation(api.matches.updateStatus, { adminSecret: workflowAdmin, id: approved.matchId!, status: "paused" });
  const second = await w.submit("email", 2, 1); await w.open(second); await w.approve(second, 2); await w.approve(second, 1);
  await expect(w.t.mutation(api.matches.resume, { adminSecret: workflowAdmin, id: approved.matchId! })).rejects.toThrow("active match");
  expect((await w.t.run(ctx => ctx.db.get(approved.matchId!)))?.status).toBe("paused");
});

for (const femaleOrigin of [false, true]) test(`new frozen notification routes to authenticated ${femaleOrigin ? "review" : "general connection"}`, async () => {
  const w = await publicWorld(); const id = await w.submit("email", femaleOrigin ? 1 : 0, femaleOrigin ? 0 : 1); await w.open(id, femaleOrigin);
  if (femaleOrigin) {
    await w.t.mutation(api.femaleInterestWorkflow.respond, { sessionHash: "session-0", interestId: id, decision: "accept", reviewTokenHash: reviewHash });
    await w.t.mutation(api.femaleInterestWorkflow.confirm, { sessionHash: "session-1", interestId: id, confirmed: true });
  } else { await w.approve(id, 0); await w.approve(id, 1); }
  vi.stubEnv("FEMALE_WORKFLOW_EMAIL_MODE", "isolated"); vi.stubEnv("FEMALE_WORKFLOW_EMAIL_ALLOWED_RECIPIENTS", "person0@example.invalid,person1@example.invalid"); vi.stubEnv("FEMALE_WORKFLOW_PORTAL_URL", "https://isolated.example.invalid"); vi.stubEnv("FEMALE_WORKFLOW_EMAIL_FROM", "test@example.invalid"); vi.stubEnv("FEMALE_WORKFLOW_RESEND_API_KEY", "synthetic-only");
  const send = vi.fn<typeof fetch>().mockImplementation(async () => new Response("{}", { status: 200 })); vi.stubGlobal("fetch", send);
  await w.t.action(internal.femaleWorkflowDelivery.drain, {});
  const messages = send.mock.calls.map(call => JSON.parse(call[1]!.body as string));
  expect(messages).toHaveLength(2);
  for (const message of messages) {
    const url = new URL(message.text.split(" ").at(-1));
    const interestId = url.searchParams.get(femaleOrigin ? "femaleReview" : "connection");
    expect(interestId).toBe(id);
    const sessionHash = message.to[0] === "person0@example.invalid" ? "session-0" : "session-1";
    if (url.pathname === "/dashboard") expect((await w.t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash, interestId: id })).state).toBe("in_review");
    else {
      expect(url.pathname).toBe("/me");
      const d = await w.t.query(api.applicantInterests.getDashboard, { sessionHash });
      expect([...d.inbound, ...d.outbound].find(row => row.interestId === interestId)).toMatchObject({ flowStatus: "in_progress", contactSharedAt: null });
    }
    expect(message.text).not.toContain("Sister Private");
    expect(message.text).not.toContain("555010");
  }
});

for (const afterRelease of [false, true]) test(`female completion joins unopened generic sibling; stale retry released=${afterRelease}`, async () => {
  const w = await publicWorld();
  const male = await w.submit("email");
  const female = await w.submit("platform_submission", 1, 0);
  await w.open(female, true);
  await w.t.mutation(api.femaleInterestWorkflow.respond, { sessionHash: "session-0", interestId: female, decision: "accept" });
  const result = await w.t.mutation(api.femaleInterestWorkflow.confirm, { sessionHash: "session-1", interestId: female, confirmed: true });
  expect(result).toEqual({ ownDecision: "approved" });
  const matchId = (await w.t.run(ctx => ctx.db.get(female)))!.matchId!;
  if (afterRelease) await w.t.mutation(api.matches.updateStatus, { adminSecret: workflowAdmin, id: matchId, status: "contact_shared" });
  await w.open(male);
  await w.approve(male, 0); await w.approve(male, 1);
  expect(await w.t.run(ctx => ctx.db.query("matches").collect())).toHaveLength(1);
  expect((await w.t.run(ctx => ctx.db.get(male)))?.matchId).toBe(matchId);
  expect((await w.t.run(ctx => ctx.db.query("femaleWorkflowDeliveries").collect())).filter(d => d.kind === "contacts_ready")).toHaveLength(afterRelease ? 2 : 0);
});

test("female and generic approval paths share participant reservations", async () => {
  const w = await publicWorld();
  const female = await w.submit("whatsapp", 1, 0); await w.open(female, true);
  await w.t.mutation(api.femaleInterestWorkflow.respond, { sessionHash: "session-0", interestId: female, decision: "accept" });
  const generic = await w.submit("email", 2, 1); await w.open(generic); await w.approve(generic, 2); await w.approve(generic, 1);
  await expect(w.t.mutation(api.femaleInterestWorkflow.confirm, { sessionHash: "session-1", interestId: female, confirmed: true })).rejects.toThrow("active match");
  expect(await w.t.run(ctx => ctx.db.query("matches").collect())).toHaveLength(1);
});

test("pending applicants retain general reads but cannot access review actions", async () => {
  const w = await publicWorld(); const id = await w.submit("email", 1, 0); await w.open(id, true);
  await w.t.run(ctx => ctx.db.patch(w.people[0], { status: "pending" }));
  expect((await w.t.query(api.applicantInterests.getDashboard, { sessionHash: "session-0" })).applicant.status).toBe("pending");
  expect((await w.t.query(api.applicantProfile.getProfile, { sessionHash: "session-0" })).registration.name).toBe("Brother Alpha");
  await expect(w.t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash: "session-0", interestId: id })).rejects.toThrow("Unauthorized");
  await expect(w.t.mutation(api.femaleInterestWorkflow.respond, { sessionHash: "session-0", interestId: id, decision: "accept" })).rejects.toThrow("Unauthorized");
});

for (const status of ["closed", "declined"] as const) test(`terminal ${status} match cannot resume or recreate from stale approvals`, async () => {
  const w = await publicWorld(); const id = await w.submit("platform_submission"); await w.open(id); await w.approve(id, 0); const result = await w.approve(id, 1);
  await w.t.mutation(api.matches.updateStatus, { adminSecret: workflowAdmin, id: result.matchId!, status });
  await expect(w.t.mutation(api.matches.resume, { adminSecret: workflowAdmin, id: result.matchId! })).rejects.toThrow("not active");
  await expect(w.approve(id, 1)).rejects.toThrow("no longer active");
  expect(await w.t.run(ctx => ctx.db.query("matches").collect())).toHaveLength(1);
});

test("test-reset submission cannot approve or pause through a stale applicant action", async () => {
  const w = await publicWorld(); const id = await w.submit("platform_submission", 1, 0);
  await w.t.mutation(api.interestTestReset.reset, { adminSecret: workflowAdmin, id, confirmTest: true, reason: "Synthetic review reset" });
  await expect(w.t.mutation(api.femaleInterestWorkflow.createReview, { adminSecret: workflowAdmin, interestId: id, reviewTokenHash: reviewHash })).rejects.toThrow();
  await expect(w.t.mutation(api.matches.setPausedForApplicant, { sessionHash: "session-1", interestId: id, paused: false })).rejects.toThrow("Unauthorized");
  expect(await w.t.run(ctx => ctx.db.query("matches").collect())).toHaveLength(0);
});

for (const source of sources) for (const releaseBeforeShare of [false, true]) test(`private sibling remains unpublished through ${source} approvals, released=${releaseBeforeShare}`, async () => {
  const w = await publicWorld();
  await w.t.run(async ctx => {
    const image = await ctx.storage.store(new Blob(["synthetic-private-photo"], { type: "image/png" }));
    await ctx.db.patch(w.people[1], { imageStorageIds: [image], photoSharingPermission: "yes" });
  });
  const female = (await w.t.mutation(api.applicantInterests.submitInterestNumber, { sessionHash: "session-1", expectedEventId: w.event, applicantNumber: 1, applicantName: "Brother", photoConsent: "yes" })).interestId;
  // The new interest snapshots Yes; later profile changes must not expand other contexts.
  await w.t.run(ctx => ctx.db.patch(w.people[1], { photoSharingPermission: "no" }));
  const male = await w.submit(source);
  async function privateReviewDenied() {
    const rows = await w.t.query(api.femaleInterestWorkflow.getDashboardPage, { sessionHash: "session-0", paginationOpts: { cursor: null, numItems: 50 } });
    expect(rows.page.some(row => row.interestId === female)).toBe(false);
    await expect(w.t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash: "session-0", interestId: female })).rejects.toThrow("Review unavailable");
    const dashboard = await w.t.query(api.applicantInterests.getDashboard, { sessionHash: "session-0", connectionId: male });
    expect(dashboard.outbound.find(row => row.interestId === male)?.counterparty?.imageUrls).toEqual([]);
  }
  await privateReviewDenied();
  await w.open(male);
  await privateReviewDenied();
  const first = await w.approve(male, 0);
  expect(first.matchId).toBeNull();
  await privateReviewDenied();
  const both = await w.approve(male, 1);
  await privateReviewDenied();
  if (releaseBeforeShare) {
    await w.t.mutation(api.matches.updateStatus, { adminSecret: workflowAdmin, id: both.matchId!, status: "contact_shared" });
    await privateReviewDenied();
  }
  expect((await w.t.run(ctx => ctx.db.get(female)))?.femaleWorkflow?.state).toBe("private_documented");
  await w.t.mutation(api.femaleInterestWorkflow.createReview, { adminSecret: workflowAdmin, interestId: female, reviewTokenHash: reviewHash });
  const access = await w.t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash: "session-0", interestId: female });
  expect(access.state).toBe(releaseBeforeShare ? "contacts_released" : "in_review");
  expect(access.profile.imageUrls).toHaveLength(1);
  expect(access.profile.email).toBe(releaseBeforeShare ? "person1@example.invalid" : null);
  expect(JSON.stringify(access)).not.toContain("Sister Private");
  const discovery = await w.t.query(api.femaleInterestWorkflow.getDashboard, { sessionHash: "session-0" });
  expect(discovery.some(row => row.interestId === female)).toBe(true);
  await w.t.mutation(api.applicantInterests.revokeSenderPhotoConsent, { sessionHash: "session-1", interestId: female });
  expect((await w.t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash: "session-0", interestId: female })).profile.imageUrls).toEqual([]);
  expect(await w.t.run(ctx => ctx.db.query("matches").collect())).toHaveLength(1);
  const row = (await w.t.run(ctx => ctx.db.get(female)))!;
  expect(row.source).toBe("platform_submission"); expect(row.eventId).toBe(w.event); expect(row.senderPhotoConsent).toBe("yes");
});


test("private draft never reserves applicants or prevents ordinary consent and contact release", async () => {
  const w = await publicWorld();
  const draft = await w.t.mutation(api.matches.create, { adminSecret: workflowAdmin, maleRegistrationId: w.people[0], femaleRegistrationId: w.people[1] });
  const before = await w.t.run(ctx => ctx.db.get(draft));
  const interestId = await w.submit("platform_submission");
  await w.open(interestId);
  await w.approve(interestId, 0);
  await w.approve(interestId, 1);
  const official = (await w.t.run(ctx => ctx.db.get(interestId)))!.matchId!;
  expect(official).not.toBe(draft);
  await w.t.mutation(api.matches.updateStatus, { adminSecret: workflowAdmin, id: official, status: "contact_shared" });
  expect((await w.t.run(ctx => ctx.db.get(official)))?.status).toBe("contact_shared");
  expect(await w.t.run(ctx => ctx.db.get(draft))).toEqual(before);
});

for (const female of [false, true]) test("real counterpart join does not change prior approver payload or pause probes: " + female, async () => {
  const w = await publicWorld();
  const interestId = await w.submit("platform_submission", female ? 1 : 0, female ? 0 : 1);
  await w.open(interestId, female);
  if (female) await w.t.mutation(api.femaleInterestWorkflow.respond, { sessionHash: "session-0", interestId, decision: "accept" });
  else await w.t.mutation(api.applicantInterests.giveFinalApproval, { sessionHash: "session-0", interestId, approved: true });
  const payload = async () => female ? {
    list: await w.t.query(api.femaleInterestWorkflow.getDashboardPage, { sessionHash: "session-0", paginationOpts: {numItems: 50, cursor: null} }),
    detail: await w.t.query(api.femaleInterestWorkflow.getReviewAccess, { sessionHash: "session-0", interestId }),
  } : await w.t.query(api.applicantInterests.getDashboard, { sessionHash: "session-0", connectionId: interestId });
  const retry = () => w.t.mutation(api.applicantInterests.submitInterestNumber, { sessionHash: female ? "session-1" : "session-0", expectedEventId: w.event, applicantNumber: female ? 1 : 2, applicantName: female ? "Brother" : "Sister" });
  const probe = async () => {
    for (const sessionHash of ["session-0", "session-1"]) for (const paused of [false, true])
      await expect(w.t.mutation(api.matches.setPausedForApplicant, { sessionHash, interestId, paused })).rejects.toThrow("Pause unavailable until contact release");
  };
  const before = await payload();
  const receipt = await retry();
  expect(receipt).not.toHaveProperty("matchId");
  await probe();
  if (female) await w.t.mutation(api.femaleInterestWorkflow.confirm, { sessionHash: "session-1", interestId, confirmed: true });
  else await w.t.mutation(api.applicantInterests.giveFinalApproval, { sessionHash: "session-1", interestId, approved: true });
  const matchId = (await w.t.run(ctx => ctx.db.get(interestId)))!.matchId!;
  expect(matchId).toBeTruthy();
  expect(await payload()).toEqual(before);
  expect(await retry()).toEqual(receipt);
  await probe();
  await w.t.mutation(api.matches.updateStatus, { adminSecret: workflowAdmin, id: matchId, status: "contact_shared" });
  for (const paused of [true, false]) await w.t.mutation(api.matches.setPausedForApplicant, { sessionHash: "session-0", interestId, paused });
});

for (const decision of ["accept", "keep_open", "decline"] as const) test("own initial receipt survives closure independently of final approval: " + decision, async () => {
  const w = await publicWorld();
  const interestId = await w.submit("platform_submission");
  await w.t.mutation(api.applicantInterests.respondToInbound, { sessionHash: "session-1", interestId, decision });
  const expected = decision === "accept" ? "accepted" : decision === "keep_open" ? "kept_open" : "declined";
  if (decision !== "decline") {
    const dashboard = await w.t.query(api.applicantInterests.getDashboard, {sessionHash: "session-1"});
    expect(dashboard.inbound[0]).toMatchObject({ownInitialDecision: expected, ownFinalApproval: "pending"});
    if (decision === "accept") await w.t.mutation(api.applicantInterests.giveFinalApproval, {sessionHash: "session-0", interestId, approved: false});
    else await w.t.mutation(api.applicantInterests.withdrawOutbound, {sessionHash: "session-0", interestId});
  }
  const history = (await w.t.query(api.applicantInterests.getDashboard, {sessionHash: "session-1"})).history;
  expect(history[0]).toMatchObject({ownInitialDecision: expected, ownFinalApproval: "pending"});
  expect(history[0]).not.toHaveProperty("counterparty");
});

process.env.ATTENDANCE_ADMIN_SECRET ??= "synthetic-admin-test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

afterEach(() => vi.unstubAllEnvs());

type Gender = "male" | "female";

async function createRegistration(
  t: ReturnType<typeof convexTest>,
  name: string,
  gender: Gender,
  completed = true
) {
  return await t.run(async (ctx) => {
    const existingEvent = (await ctx.db.query("events").take(10)).find((event) => event.eventCode === "apr26");
    const now = Date.now();
    const eventId = existingEvent?._id ?? await ctx.db.insert("events", {
      title: "1Plus1 Match Event - Apr26",
      eventCode: "apr26",
      eventMonth: "2026-04",
      series: "1plus1_match",
      location: "ROIC",
      startsAt: now - 60 * 60 * 1000,
      endsAt: now - 30 * 60 * 1000,
      status: "completed",
      maleCapacity: 60,
      femaleCapacity: 60,
      interestSubmissionsEnabled: true,
      interestSubmissionClosesAt: now + 60 * 60 * 1000,
      createdAt: now,
      updatedAt: now,
    });
    const registrationId = await ctx.db.insert("registrations", {
      name,
      applicantNumber: (await ctx.db.query("registrations").take(1000)).length + 1,
      publicApplicantNumber: (await ctx.db.query("registrations").take(1000)).length + 1,
      age: 30,
      gender,
      maritalStatus: "single",
      education: "College",
      job: "Engineer",
      email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
      phone: "555-0100",
      paymentStatus: "paid",
      status: "approved",
      searchStatus: "active",
      createdAt: Date.now(),
      profileCompletionStatus: completed ? "completed" : "not_started",
      ethnicity: "Arab",
      prayerCommitment: "always_five",
      hijabResponse: gender === "female" ? "yes" : "open",
      spouseRequirement1: `${name} requirement one`,
      spouseRequirement2: `${name} requirement two`,
      spouseRequirement3: `${name} requirement three`,
      shareableBio: `${name} bio text`,
      photoSharingPermission: "ask_me_first",
    });
    await ctx.db.insert("eventRegistrations", {
      eventId,
      registrationId,
      gender,
      registrationStatus: "approved",
      confirmationStatus: "confirmed",
      attendanceStatus: "attended",
      eligibilityStatus: "approved_member",
      approvedAt: now,
      confirmedAt: now,
      checkedInAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("eventAttendees", { eventId, registrationId, addedAt: now });
    return registrationId;
  });
}

async function getTestEvent(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const event = (await ctx.db.query("events").take(10)).find((row) => row.eventCode === "apr26");
    if (!event) throw new Error("Test event not found");
    return event._id;
  });
}

async function createAdminInterest(
  t: ReturnType<typeof convexTest>,
  args: {
    fromRegistrationId: Id<"registrations">;
    toRegistrationId: Id<"registrations">;
    source: "admin_entered" | "email" | "whatsapp" | "platform_submission";
    rank?: number;
    notes?: string;
  }
) {
  process.env.ATTENDANCE_ADMIN_SECRET = "synthetic-admin-secret";
  return await t.mutation(api.interests.create, {
    adminSecret: "synthetic-admin-secret",
    ...args,
    eventId: await getTestEvent(t),
  });
}

async function getInterest(t: ReturnType<typeof convexTest>, id: Id<"interests">) {
  return await t.run(async (ctx) => {
    const interest = await ctx.db.get(id);
    if (!interest) throw new Error("Interest not found");
    return interest;
  });
}

async function getRegistration(t: ReturnType<typeof convexTest>, id: Id<"registrations">) {
  return await t.run(async (ctx) => {
    const registration = await ctx.db.get(id);
    if (!registration) throw new Error("Registration not found");
    return registration;
  });
}

async function createSession(t: ReturnType<typeof convexTest>, registrationId: Id<"registrations">) {
  const sessionHash = `session-${registrationId}`;
  await t.run(async (ctx) => {
    await ctx.db.insert("applicantSessions", {
      registrationId,
      sessionHash,
      expiresAt: Date.now() + 60 * 60 * 1000,
      createdAt: Date.now(),
    });
  });
  return sessionHash;
}

describe("interest rules", () => {
  test("requires both applicants to have completed profiles", async () => {
    const t = convexTest(schema, modules);
    const completedMale = await createRegistration(t, "Completed Male", "male");
    const incompleteFemale = await createRegistration(t, "Incomplete Female", "female", false);

    await expect(
      createAdminInterest(t, {
        fromRegistrationId: completedMale,
        toRegistrationId: incompleteFemale,
        source: "admin_entered",
      })
    ).rejects.toThrow("Recipient must complete their profile");

    const incompleteMale = await createRegistration(t, "Incomplete Male", "male", false);
    const completedFemale = await createRegistration(t, "Completed Female", "female");

    await expect(
      createAdminInterest(t, {
        fromRegistrationId: incompleteMale,
        toRegistrationId: completedFemale,
        source: "admin_entered",
      })
    ).rejects.toThrow("Requester must complete their profile");
  });

  test("caps applicants at three open outbound interests and frees closed slots", async () => {
    const t = convexTest(schema, modules);
    const male = await createRegistration(t, "Cap Male", "male");
    const recipients = await Promise.all(
      ["One", "Two", "Three", "Four"].map((name) => createRegistration(t, `Cap ${name}`, "female"))
    );

    const first = await createAdminInterest(t, {
      fromRegistrationId: male,
      toRegistrationId: recipients[0],
      source: "admin_entered",
    });
    await createAdminInterest(t, {
      fromRegistrationId: male,
      toRegistrationId: recipients[1],
      source: "admin_entered",
    });
    await createAdminInterest(t, {
      fromRegistrationId: male,
      toRegistrationId: recipients[2],
      source: "admin_entered",
    });

    await expect(
      createAdminInterest(t, {
        fromRegistrationId: male,
        toRegistrationId: recipients[3],
        source: "admin_entered",
      })
    ).rejects.toThrow("Applicant already has 3 open interests");

    await t.mutation(api.interests.updateStatus, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,
      id: first,
      status: "declined",
    });
    const replacement = await createAdminInterest(t, {
      fromRegistrationId: male,
      toRegistrationId: recipients[3],
      source: "admin_entered",
    });

    await expect(getInterest(t, replacement)).resolves.toMatchObject({
      status: "new",
    });
  });

  test("prevents duplicate open interests but allows a new one after close", async () => {
    const t = convexTest(schema, modules);
    const male = await createRegistration(t, "Duplicate Male", "male");
    const female = await createRegistration(t, "Duplicate Female", "female");

    const first = await createAdminInterest(t, {
      fromRegistrationId: male,
      toRegistrationId: female,
      source: "admin_entered",
    });

    await expect(
      createAdminInterest(t, {
        fromRegistrationId: male,
        toRegistrationId: female,
        source: "admin_entered",
      })
    ).rejects.toThrow("An open interest already exists");

    await t.mutation(api.interests.updateStatus, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,
      id: first,
      status: "closed",
    });
    const second = await createAdminInterest(t, {
      fromRegistrationId: male,
      toRegistrationId: female,
      source: "admin_entered",
    });

    await expect(getInterest(t, second)).resolves.toMatchObject({
      status: "new",
    });
  });

  test("reciprocal submissions do not create an official match or active pointers", async () => {
    const t = convexTest(schema, modules);
    const male = await createRegistration(t, "Mutual Male", "male");
    const female = await createRegistration(t, "Mutual Female", "female");

    await createAdminInterest(t, {
      fromRegistrationId: male,
      toRegistrationId: female,
      source: "admin_entered",
    });
    const reciprocal = await createAdminInterest(t, {
      fromRegistrationId: female,
      toRegistrationId: male,
      source: "admin_entered",
    });
    const reciprocalInterest = await getInterest(t, reciprocal);
    const maleRegistration = await getRegistration(t, male);
    const femaleRegistration = await getRegistration(t, female);

    expect(reciprocalInterest.status).toBe("new");
    expect(reciprocalInterest.matchId).toBeUndefined();
    expect(maleRegistration.activeMatchId).toBeUndefined();
    expect(femaleRegistration.activeMatchId).toBeUndefined();

    expect(await t.run(ctx => ctx.db.query("matches").collect())).toHaveLength(0);
  });

  test("contact_shared sets activeMatchId, queues active interests, and close promotes FIFO", async () => {
    const t = convexTest(schema, modules);
    const male = await createRegistration(t, "Active Male", "male");
    const female = await createRegistration(t, "Active Female", "female");
    const queuedRequester = await createRegistration(t, "Queued Requester", "female");
    const queuedTarget = await createRegistration(t, "Queued Target", "female");

    const interestId = await createAdminInterest(t, {
      fromRegistrationId: male,
      toRegistrationId: female,
      source: "admin_entered",
    });
    await expect(t.mutation(api.interests.convertToMatch, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!, interestId })).rejects.toThrow("automatically");
    await t.run(async ctx => {
      const now = Date.now();
      for (const [registrationId, sessionHash] of [[male, "consent-m"], [female, "consent-f"]] as const) await ctx.db.insert("applicantSessions", { registrationId, sessionHash, createdAt: now, expiresAt: now + 100000 });
    });
    await t.mutation(api.applicantInterests.respondToInbound, { sessionHash: "consent-f", interestId, decision: "accept" });
    await t.mutation(api.applicantInterests.giveFinalApproval, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!, sessionHash: "consent-m", interestId, approved: true });
    const approved = await t.mutation(api.applicantInterests.giveFinalApproval, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!, sessionHash: "consent-f", interestId, approved: true });
    const matchId = approved.matchId!;

    const activeAlternative = await createAdminInterest(t, {
      fromRegistrationId: male,
      toRegistrationId: queuedTarget,
      source: "admin_entered",
    });
    vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "test-only-secret");
    await t.mutation(api.matches.updateStatus, {
      id: matchId,
      status: "contact_shared",
      adminSecret: "test-only-secret",
    });

    await expect(getRegistration(t, male)).resolves.toMatchObject({
      activeMatchId: matchId,
    });
    await expect(getRegistration(t, female)).resolves.toMatchObject({
      activeMatchId: matchId,
    });
    await expect(getInterest(t, activeAlternative)).resolves.toMatchObject({
      status: "queued",
    });

    const queuedInbound = await createAdminInterest(t, {
      fromRegistrationId: queuedRequester,
      toRegistrationId: male,
      source: "admin_entered",
    });
    await expect(getInterest(t, queuedInbound)).resolves.toMatchObject({
      status: "queued",
    });

    await t.mutation(api.matches.updateStatus, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,
      id: matchId,
      status: "closed",
    });

    expect((await getRegistration(t, male)).activeMatchId).toBeUndefined();
    await expect(getInterest(t, interestId)).resolves.toMatchObject({
      status: "closed",
    });
    await expect(getInterest(t, activeAlternative)).resolves.toMatchObject({
      status: "active",
    });
    await expect(getInterest(t, queuedInbound)).resolves.toMatchObject({
      status: "queued",
    });
  });

  test("decline notification claim is idempotent and failure is retryable", async () => {
    const t = convexTest(schema, modules);
    const male = await createRegistration(t, "Decline Male", "male");
    const female = await createRegistration(t, "Decline Female", "female");
    const interestId = await createAdminInterest(t, {
      fromRegistrationId: male,
      toRegistrationId: female,
      source: "admin_entered",
    });

    await t.mutation(api.interests.updateAdminStatus, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,
      id: interestId,
      adminStatus: "declined",
    });

    const firstClaim = await t.mutation(api.interests.claimDeclineNotification, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,
      id: interestId,
    });
    expect(firstClaim).toMatchObject({
      claimed: true,
      requesterEmail: "decline.male@example.com",
      targetNumber: 2,
    });

    const secondClaim = await t.mutation(api.interests.claimDeclineNotification, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,
      id: interestId,
    });
    expect(secondClaim).toMatchObject({
      claimed: false,
      alreadySent: true,
    });

    await t.mutation(api.interests.recordDeclineNotificationFailure, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,
      id: interestId,
      error: "provider failed",
    });
    const failedNotificationInterest = await getInterest(t, interestId);
    expect(failedNotificationInterest.declineNotificationSentAt).toBeUndefined();
    expect(failedNotificationInterest.declineNotificationError).toBe("provider failed");

    const retryClaim = await t.mutation(api.interests.claimDeclineNotification, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,
      id: interestId,
    });
    expect(retryClaim).toMatchObject({
      claimed: true,
    });
  });

  test("male number submission creates visible inbound interest for female dashboard", async () => {
    const t = convexTest(schema, modules);
    const male = await createRegistration(t, "Portal Male", "male");
    const female = await createRegistration(t, "Portal Female", "female");
    const maleSession = await createSession(t, male);
    const femaleSession = await createSession(t, female);

    const result = await t.mutation(api.applicantInterests.submitInterestNumber, { photoConsent: "no",
      expectedEventId: await getTestEvent(t),
      sessionHash: maleSession,
      applicantNumber: 2,
      applicantName: "Portal",
    });
    const interest = await getInterest(t, result.interestId);

    expect(result.private).toBe(false);
    expect(result.inboundInterestNotification).toMatchObject({
      interestId: result.interestId,
    });
    expect(interest.visibility).toBe("admin_actionable");
    expect(interest.inboundInterestNotificationSentAt).toBeTypeOf("number");
    expect(interest.inboundInterestNotificationError).toBeUndefined();
    await expect(
      t.query(api.applicantInterests.getDashboard, {
        sessionHash: femaleSession,
      })
    ).resolves.toMatchObject({
      inbound: [
        {
          interestId: result.interestId,
          visibility: "admin_actionable",
          flowStatus: "in_progress", canRespond: true,
        },
      ],
    });
  });

  test("number submission allows a target without attendance without exposing a directory", async () => {
    const t = convexTest(schema, modules);
    const male = await createRegistration(t, "Cross Event Male", "male");
    const female = await createRegistration(t, "Cross Event Female", "female");
    const maleSession = await createSession(t, male);
    await t.run(async ctx => {
      const rows = await ctx.db.query("eventAttendees").take(10);
      for (const row of rows) if (row.registrationId === female) await ctx.db.delete(row._id);
      for (const row of await ctx.db.query("eventRegistrations").take(10)) if (row.registrationId === female) await ctx.db.patch(row._id, { attendanceStatus: "not_checked_in" });
    });
    const dashboard = await t.query(api.applicantInterests.getDashboard, { sessionHash: maleSession });
    expect(dashboard).not.toHaveProperty("eligibleInterestTargets");
    await expect(t.mutation(api.applicantInterests.submitInterestNumber, { photoConsent: "no",
      expectedEventId: await getTestEvent(t),
      sessionHash: maleSession, applicantNumber: 2, applicantName: "Cross",
    })).resolves.toHaveProperty("interestId");
  });

  test("pending applicant can submit interest", async () => {
    const t = convexTest(schema, modules);
    const male = await createRegistration(t, "Pending Submitter Male", "male");
    await createRegistration(t, "Approved Target Female", "female");
    const maleSession = await createSession(t, male);

    await t.run(async (ctx) => {
      await ctx.db.patch(male, { status: "pending" });
    });

    const result = await t.mutation(api.applicantInterests.submitInterestNumber, { photoConsent: "no",
      expectedEventId: await getTestEvent(t),
      sessionHash: maleSession,
      applicantNumber: 2,
      applicantName: "Approved",
    });

    await expect(getInterest(t, result.interestId)).resolves.toMatchObject({
      fromRegistrationId: male,
      visibility: "admin_actionable",
    });
  });

  test("number submission resolves public applicant numbers before legacy fallback numbers", async () => {
    const t = convexTest(schema, modules);
    const male = await createRegistration(t, "Numbered Male", "male");
    const female = await createRegistration(t, "Numbered Female", "female");
    const maleSession = await createSession(t, male);

    await t.run(async (ctx) => {
      await ctx.db.patch(female, { publicApplicantNumber: 3 });
      await ctx.db.insert("registrations", {
        name: "Legacy Unnumbered Male",
        age: 30,
        gender: "male",
        maritalStatus: "single",
        education: "College",
        job: "Engineer",
        email: "legacy.unnumbered.male@example.com",
        phone: "555-0100",
        paymentStatus: "paid",
        status: "approved",
        searchStatus: "active",
        createdAt: Date.now(),
        profileCompletionStatus: "completed",
        ethnicity: "Arab",
        prayerCommitment: "always_five",
        hijabResponse: "open",
        spouseRequirement1: "Legacy requirement one",
        spouseRequirement2: "Legacy requirement two",
        spouseRequirement3: "Legacy requirement three",
        shareableBio: "Legacy bio text",
        photoSharingPermission: "ask_me_first",
      });
    });

    const result = await t.mutation(api.applicantInterests.submitInterestNumber, { photoConsent: "no",
      expectedEventId: await getTestEvent(t),
      sessionHash: maleSession,
      applicantNumber: 3,
      applicantName: "Numbered",
    });

    await expect(getInterest(t, result.interestId)).resolves.toMatchObject({
      fromRegistrationId: male,
      toRegistrationId: female,
    });
  });

  test("female recipient sees male initiator's profile on inbound before accepting", async () => {
    const t = convexTest(schema, modules);
    const male = await createRegistration(t, "Visible Male", "male");
    const female = await createRegistration(t, "Visible Female", "female");
    const maleSession = await createSession(t, male);
    const femaleSession = await createSession(t, female);

    await t.mutation(api.applicantInterests.submitInterestNumber, { photoConsent: "no",
      expectedEventId: await getTestEvent(t),
      sessionHash: maleSession,
      applicantNumber: 2,
      applicantName: "Visible",
    });

    const femaleDashboard = await t.query(api.applicantInterests.getDashboard, {
      sessionHash: femaleSession,
    });
    expect(femaleDashboard.inbound[0]?.flowStatus).toBe("in_progress");
    expect(femaleDashboard.inbound[0]?.counterparty).toMatchObject({
      name: "Visible Male",
      fullProfileVisible: true,
      maritalStatus: "single",
      education: "College",
      job: "Engineer",
      ethnicity: "Arab",
      prayerCommitment: "always_five",
      hijabResponse: "open",
      spouseRequirement1: "Visible Male requirement one",
      spouseRequirement2: "Visible Male requirement two",
      spouseRequirement3: "Visible Male requirement three",
      photoSharingPermission: "ask_me_first",
      shareableBio: null, // Initial interest has not been accepted.
      label: "Visible Male",
      email: null,
      phone: null,
    });

    const maleDashboard = await t.query(api.applicantInterests.getDashboard, {
      sessionHash: maleSession,
    });
    expect(maleDashboard.outbound[0]?.counterparty).toMatchObject({
      fullProfileVisible: true,
      maritalStatus: "single",
      education: "College",
      job: "Engineer",
      ethnicity: "Arab",
      spouseRequirement1: null,
      shareableBio: null, // Initial interest has not been accepted.
      label: "Visible Female",
      email: null,
      phone: null,
    });
    expect(maleDashboard.outbound[0]?.counterparty?.imageUrls).toEqual([]);
  });

  test("first inbound approval keeps full profile visible but not contact details", async () => {
    const t = convexTest(schema, modules);
    const male = await createRegistration(t, "Submitting Male", "male");
    const female = await createRegistration(t, "Approving Female", "female");
    const maleSession = await createSession(t, male);
    const femaleSession = await createSession(t, female);

    const result = await t.mutation(api.applicantInterests.submitInterestNumber, { photoConsent: "no",
      expectedEventId: await getTestEvent(t),
      sessionHash: maleSession,
      applicantNumber: 2,
      applicantName: "Approving",
    });

    const beforeApproval = await t.query(api.applicantInterests.getDashboard, {
      sessionHash: femaleSession,
    });
    expect(beforeApproval.inbound[0]?.counterparty).toMatchObject({
      name: "Submitting Male",
      fullProfileVisible: true,
      maritalStatus: "single",
      email: null,
      phone: null,
    });

    await t.mutation(api.applicantInterests.respondToInbound, {
      sessionHash: femaleSession,
      interestId: result.interestId,
      decision: "accept",
    });

    const afterApproval = await t.query(api.applicantInterests.getDashboard, {
      sessionHash: femaleSession,
    });
    expect(afterApproval.inbound[0]?.counterparty).toMatchObject({
      name: "Submitting Male",
      fullProfileVisible: true,
      maritalStatus: "single",
      education: "College",
      job: "Engineer",
      ethnicity: "Arab",
      prayerCommitment: "always_five",
      hijabResponse: "open",
      spouseRequirement1: "Submitting Male requirement one",
      spouseRequirement2: "Submitting Male requirement two",
      spouseRequirement3: "Submitting Male requirement three",
      photoSharingPermission: "ask_me_first",
      email: null,
      phone: null,
    });
  });

  test("first final approval updates dashboards and requests the other applicant's approval", async () => {
    const t = convexTest(schema, modules);
    const male = await createRegistration(t, "Final Approval Male", "male");
    const female = await createRegistration(t, "Final Approval Female", "female");
    const maleSession = await createSession(t, male);
    const femaleSession = await createSession(t, female);

    const result = await t.mutation(api.applicantInterests.submitInterestNumber, { photoConsent: "no",
      expectedEventId: await getTestEvent(t),
      sessionHash: maleSession,
      applicantNumber: 2,
      applicantName: "Final",
    });

    await t.mutation(api.applicantInterests.respondToInbound, {
      sessionHash: femaleSession,
      interestId: result.interestId,
      decision: "accept",
    });

    const firstApproval = await t.mutation(api.applicantInterests.giveFinalApproval, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,
      sessionHash: femaleSession,
      interestId: result.interestId,
      approved: true,
    });

    expect(firstApproval.finalApprovalNotification).toMatchObject({
      interestId: result.interestId,
    });

    const femaleDashboard = await t.query(api.applicantInterests.getDashboard, {
      sessionHash: femaleSession,
    });
    expect(femaleDashboard.inbound[0]).toMatchObject({
      flowStatus: "in_progress", ownFinalApproval: "approved", canFinalApprove: false,
    });

    const maleDashboard = await t.query(api.applicantInterests.getDashboard, {
      sessionHash: maleSession,
    });
    expect(maleDashboard.outbound[0]).toMatchObject({
      flowStatus: "in_progress", ownFinalApproval: "pending", canFinalApprove: true,
    });

    const duplicateApproval = await t.mutation(api.applicantInterests.giveFinalApproval, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,
      sessionHash: femaleSession,
      interestId: result.interestId,
      approved: true,
    });
    expect(duplicateApproval).toMatchObject({
      finalApprovalNotification: null,
      alreadyRecorded: true,
    });

    const secondApproval = await t.mutation(api.applicantInterests.giveFinalApproval, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,
      sessionHash: maleSession,
      interestId: result.interestId,
      approved: true,
    });
    expect(secondApproval.contactSharedNotification).toBeNull();
    const pending = await t.query(api.applicantInterests.getDashboard, { sessionHash: maleSession });
    expect(pending.outbound[0]?.counterparty?.email).toBeNull();
    await t.mutation(api.matches.updateStatus, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!, id: secondApproval.matchId!, status: "contact_shared" });

    const finalMaleDashboard = await t.query(api.applicantInterests.getDashboard, {
      sessionHash: maleSession,
    });
    expect(finalMaleDashboard.outbound[0]).toMatchObject({
      flowStatus: "contact_shared",
      ownFinalApproval: "approved",
    });
    expect(finalMaleDashboard.outbound[0]?.counterparty).toMatchObject({
      email: "final.approval.female@example.com",
      phone: "555-0100",
    });

    await t.mutation(api.applicantInterests.closeConnection, {
      sessionHash: maleSession,
      interestId: result.interestId,
    });

    const closedMatch = await t.query(api.matches.getById, { adminSecret: process.env.ATTENDANCE_ADMIN_SECRET!,
      id: secondApproval.matchId as Id<"matches">,
    });
    expect(closedMatch).toMatchObject({
      status: "closed",
      closedReason: "applicant_closed_connection",
    });
    await expect(getInterest(t, result.interestId)).resolves.toMatchObject({
      status: "closed",
    });

    const closedMaleDashboard = await t.query(api.applicantInterests.getDashboard, {
      sessionHash: maleSession,
    });
    const closedFemaleDashboard = await t.query(api.applicantInterests.getDashboard, {
      sessionHash: femaleSession,
    });
    expect(closedMaleDashboard.outbound).toEqual([]);
    expect(closedFemaleDashboard.inbound).toEqual([]);
  });

  test("female initiator sees male recipient's profile on private documented interest", async () => {
    const t = convexTest(schema, modules);
    await createRegistration(t, "Documented Male", "male");
    const female = await createRegistration(t, "Documenting Female", "female");
    const femaleSession = await createSession(t, female);

    await t.mutation(api.applicantInterests.submitInterestNumber, { photoConsent: "no",
      expectedEventId: await getTestEvent(t),
      sessionHash: femaleSession,
      applicantNumber: 1,
      applicantName: "Documented",
    });

    const dashboard = await t.query(api.applicantInterests.getDashboard, {
      sessionHash: femaleSession,
    });
    expect(dashboard.privateDocumented[0]?.counterparty).toMatchObject({
      name: "Documented Male",
      fullProfileVisible: true,
      maritalStatus: "single",
      education: "College",
      job: "Engineer",
      ethnicity: "Arab",
      spouseRequirement1: null,
      shareableBio: null, // Private documentation is not initial acceptance.
      label: "Documented Male",
      email: null,
      phone: null,
    });
  });

  test("female number submission stays private from male dashboard before match", async () => {
    const t = convexTest(schema, modules);
    const male = await createRegistration(t, "Private Male", "male");
    const female = await createRegistration(t, "Private Female", "female");
    const maleSession = await createSession(t, male);
    const femaleSession = await createSession(t, female);

    const result = await t.mutation(api.applicantInterests.submitInterestNumber, { photoConsent: "no",
      expectedEventId: await getTestEvent(t),
      sessionHash: femaleSession,
      applicantNumber: 1,
      applicantName: "Private",
    });
    const interest = await getInterest(t, result.interestId);

    expect(result.private).toBe(true);
    expect(result.inboundInterestNotification).toBeNull();
    expect(interest.visibility).toBe("internal_only");
    expect(interest.inboundInterestNotificationSentAt).toBeUndefined();
    await expect(
      t.query(api.applicantInterests.getDashboard, {
        sessionHash: femaleSession,
      })
    ).resolves.toMatchObject({
      privateDocumented: [
        {
          interestId: result.interestId,
          visibility: "internal_only",
          flowStatus: "in_progress",
        },
      ],
    });
    await expect(
      t.query(api.applicantInterests.getDashboard, {
        sessionHash: maleSession,
      })
    ).resolves.toMatchObject({
      inbound: [],
      outbound: [],
      privateDocumented: [],
    });
  });
});

 test("applicant event decisions are private for both roles while admin retains full flow", async () => {
  const t = convexTest(schema, modules);
  const male = await createRegistration(t, "Privacy Male", "male");
  const female = await createRegistration(t, "Privacy Female", "female");
  const sessions = [await createSession(t, male), await createSession(t, female)];
  const result = await t.mutation(api.applicantInterests.submitInterestNumber, { expectedEventId: await getTestEvent(t), sessionHash: sessions[0], applicantNumber: 2, applicantName: "Privacy" });
  await t.mutation(api.applicantInterests.respondToInbound, {sessionHash: sessions[1], interestId: result.interestId, decision: "accept"});
  for (const sessionHash of sessions) {
    const viewerIsMale = sessionHash === sessions[0];
    const before = await t.query(api.applicantInterests.getDashboard, {sessionHash});
    const row = [...before.inbound, ...before.outbound][0];
    expect(row).toMatchObject({ownFinalApproval:"pending", canFinalApprove:true, flowStatus:"in_progress"});
    for (const key of ["requesterFinalApproval", "recipientFinalApproval", "adminStatus", "updatedAt"]) expect(row).not.toHaveProperty(key);
    const flow = await t.run(ctx => ctx.db.query("interestFlows").withIndex("by_interestId", q => q.eq("interestId", result.interestId)).unique());
    await t.run(ctx => ctx.db.patch(flow!._id, viewerIsMale ? {recipientFinalApproval:"approved"} : {requesterFinalApproval:"approved"}));
    const after = await t.query(api.applicantInterests.getDashboard, {sessionHash});
    expect([...after.inbound, ...after.outbound][0]).toEqual(row);
    await t.run(ctx => ctx.db.patch(flow!._id, {requesterFinalApproval:"pending", recipientFinalApproval:"pending"}));
  }
  const flow = await t.run(ctx => ctx.db.query("interestFlows").withIndex("by_interestId", q => q.eq("interestId", result.interestId)).unique());
  await t.run(ctx => ctx.db.patch(flow!._id, {recipientFinalApproval:"declined", flowStatus:"declined"}));
  const closed = await t.query(api.applicantInterests.getDashboard, {sessionHash:sessions[0]});
  expect(closed.outbound[0]).toMatchObject({flowStatus:"closed", canFinalApprove:false, canRespond:false, ownFinalApproval:"pending"});
  expect(await t.run(ctx => ctx.db.get(flow!._id))).toMatchObject({recipientFinalApproval:"declined", flowStatus:"declined"});
 });

for (const action of ["initial", "male-final", "female-final", "withdraw"] as const) test("own closed history uses real ordinary action: " + action, async () => {
 const t=convexTest(schema,modules); const male=await createRegistration(t,"Own Male","male"), female=await createRegistration(t,"Own Female","female");
 const ms=await createSession(t,male), fs=await createSession(t,female);
 const {interestId}=await t.mutation(api.applicantInterests.submitInterestNumber,{sessionHash:ms,expectedEventId:await getTestEvent(t),applicantNumber:2,applicantName:"Own"});
 if(action === "initial") await t.mutation(api.applicantInterests.respondToInbound,{sessionHash:fs,interestId,decision:"decline"});
 else if(action === "withdraw") await t.mutation(api.applicantInterests.withdrawOutbound,{sessionHash:ms,interestId});
 else { await t.mutation(api.applicantInterests.respondToInbound,{sessionHash:fs,interestId,decision:"accept"}); await t.mutation(api.applicantInterests.giveFinalApproval,{sessionHash:action === "male-final" ? ms : fs,interestId,approved:false}); }
 const owner = action === "male-final" || action === "withdraw" ? ms : fs;
 for(const sessionHash of [ms,fs]) {
  const dashboard=await t.query(api.applicantInterests.getDashboard,{sessionHash});
  expect(dashboard.history).toHaveLength(sessionHash === owner ? 1 : 0);
  if(sessionHash === owner) expect(dashboard.history[0]).toMatchObject({interestId,ownDecision:action === "withdraw" ? "withdrawn" : "declined"});
  expect(dashboard.inbound).toEqual([]); expect(dashboard.outbound).toEqual([]);
  expect(JSON.stringify(dashboard.history)).not.toMatch(/counterparty|actorRegistrationId|email|phone|closedReason/);
 }
 const audit = await t.run(ctx=>ctx.db.query("interestFlowEvents").withIndex("by_interestId",q=>q.eq("interestId",interestId)).collect());
 expect(audit.length).toBeGreaterThan(0);
 // Losing authoritative provenance must not reinterpret legacy state as own action.
 await t.run(async ctx=>{for(const e of audit) await ctx.db.delete(e._id);});
 expect((await t.query(api.applicantInterests.getDashboard,{sessionHash:owner})).history).toEqual([]);
});

test("public final approval receipts hide delivery eligibility and preserve own closed history", async () => {
 const t=convexTest(schema,modules);const male=await createRegistration(t,"Receipt Male","male");const female=await createRegistration(t,"Receipt Female","female");
 const ms=await createSession(t,male),fs=await createSession(t,female);
 const {interestId}=await t.mutation(api.applicantInterests.submitInterestNumber,{sessionHash:ms,expectedEventId:await getTestEvent(t),applicantNumber:2,applicantName:"Receipt"});
 await t.mutation(api.applicantInterests.respondToInbound,{sessionHash:fs,interestId,decision:"accept"});
 const first=await t.mutation(api.applicantInterests.giveFinalApproval,{sessionHash:ms,interestId,approved:true});
 expect(first).toMatchObject({flowId:null,matchId:null,finalApprovalNotification:null});
 const second=await t.mutation(api.applicantInterests.giveFinalApproval,{sessionHash:fs,interestId,approved:true});
 expect(second).toMatchObject({flowId:null,matchId:null,finalApprovalNotification:null});
 expect(await t.run(ctx=>ctx.db.get(interestId))).toMatchObject({matchId:expect.any(String)});
 await t.run(ctx=>ctx.db.patch(interestId,{status:"closed"}));
 for(const sessionHash of [ms,fs]){const d=await t.query(api.applicantInterests.getDashboard,{sessionHash});expect(d.history).toEqual([]);}
});

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

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
      attendanceStatus: "attended",
      eligibilityStatus: "approved_member",
      approvedAt: now,
      checkedInAt: now,
      createdAt: now,
      updatedAt: now,
    });
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
  return await t.mutation(api.interests.create, {
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

    await t.mutation(api.interests.updateStatus, {
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

    await t.mutation(api.interests.updateStatus, {
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

  test("mutual interest creates a new match without setting activeMatchId", async () => {
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

    expect(reciprocalInterest.status).toBe("converted_to_match");
    expect(reciprocalInterest.matchId).toBeTruthy();
    expect(maleRegistration.activeMatchId).toBeUndefined();
    expect(femaleRegistration.activeMatchId).toBeUndefined();

    const match = await t.query(api.matches.getById, {
      id: reciprocalInterest.matchId as Id<"matches">,
    });
    expect(match).toMatchObject({
      status: "new",
      interestType: "mutual_interest",
    });
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
    const matchId = await t.mutation(api.interests.convertToMatch, {
      interestId,
    });

    const activeAlternative = await createAdminInterest(t, {
      fromRegistrationId: male,
      toRegistrationId: queuedTarget,
      source: "admin_entered",
    });
    await t.mutation(api.matches.updateStatus, {
      id: matchId,
      status: "contact_shared",
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

    await t.mutation(api.matches.updateStatus, {
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

    await t.mutation(api.interests.updateAdminStatus, {
      id: interestId,
      adminStatus: "declined",
    });

    const firstClaim = await t.mutation(api.interests.claimDeclineNotification, {
      id: interestId,
    });
    expect(firstClaim).toMatchObject({
      claimed: true,
      requesterEmail: "decline.male@example.com",
      targetNumber: 2,
    });

    const secondClaim = await t.mutation(api.interests.claimDeclineNotification, {
      id: interestId,
    });
    expect(secondClaim).toMatchObject({
      claimed: false,
      alreadySent: true,
    });

    await t.mutation(api.interests.recordDeclineNotificationFailure, {
      id: interestId,
      error: "provider failed",
    });
    const failedNotificationInterest = await getInterest(t, interestId);
    expect(failedNotificationInterest.declineNotificationSentAt).toBeUndefined();
    expect(failedNotificationInterest.declineNotificationError).toBe("provider failed");

    const retryClaim = await t.mutation(api.interests.claimDeclineNotification, {
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

    const result = await t.mutation(api.applicantInterests.submitInterestNumber, {
      sessionHash: maleSession,
      applicantNumber: 2,
    });
    const interest = await getInterest(t, result.interestId);

    expect(result.private).toBe(false);
    expect(result.inboundInterestNotification).toMatchObject({
      interestId: result.interestId,
      name: "Portal Female",
      email: "portal.female@example.com",
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
          flowStatus: "awaiting_inbound_response",
        },
      ],
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

    const result = await t.mutation(api.applicantInterests.submitInterestNumber, {
      sessionHash: maleSession,
      applicantNumber: 3,
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

    await t.mutation(api.applicantInterests.submitInterestNumber, {
      sessionHash: maleSession,
      applicantNumber: 2,
    });

    const femaleDashboard = await t.query(api.applicantInterests.getDashboard, {
      sessionHash: femaleSession,
    });
    expect(femaleDashboard.inbound[0]?.flowStatus).toBe("awaiting_inbound_response");
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
      shareableBio: "Visible Male bio text",
      label: "Visible Male",
      email: null,
      phone: null,
    });

    const maleDashboard = await t.query(api.applicantInterests.getDashboard, {
      sessionHash: maleSession,
    });
    expect(maleDashboard.outbound[0]?.counterparty).toMatchObject({
      name: "Visible Female",
      fullProfileVisible: true,
      maritalStatus: "single",
      education: "College",
      job: "Engineer",
      ethnicity: "Arab",
      spouseRequirement1: "Visible Female requirement one",
      shareableBio: "Visible Female bio text",
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

    const result = await t.mutation(api.applicantInterests.submitInterestNumber, {
      sessionHash: maleSession,
      applicantNumber: 2,
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

    const result = await t.mutation(api.applicantInterests.submitInterestNumber, {
      sessionHash: maleSession,
      applicantNumber: 2,
    });

    await t.mutation(api.applicantInterests.respondToInbound, {
      sessionHash: femaleSession,
      interestId: result.interestId,
      decision: "accept",
    });

    const firstApproval = await t.mutation(api.applicantInterests.giveFinalApproval, {
      sessionHash: femaleSession,
      interestId: result.interestId,
      approved: true,
    });

    expect(firstApproval.finalApprovalNotification).toMatchObject({
      registrationId: male,
      name: "Final Approval Male",
      email: "final.approval.male@example.com",
    });

    const femaleDashboard = await t.query(api.applicantInterests.getDashboard, {
      sessionHash: femaleSession,
    });
    expect(femaleDashboard.inbound[0]).toMatchObject({
      flowStatus: "awaiting_final_approvals",
      requesterFinalApproval: "pending",
      recipientFinalApproval: "approved",
    });

    const maleDashboard = await t.query(api.applicantInterests.getDashboard, {
      sessionHash: maleSession,
    });
    expect(maleDashboard.outbound[0]).toMatchObject({
      flowStatus: "awaiting_final_approvals",
      requesterFinalApproval: "pending",
      recipientFinalApproval: "approved",
    });

    const duplicateApproval = await t.mutation(api.applicantInterests.giveFinalApproval, {
      sessionHash: femaleSession,
      interestId: result.interestId,
      approved: true,
    });
    expect(duplicateApproval).toMatchObject({
      finalApprovalNotification: null,
      alreadyRecorded: true,
    });

    const secondApproval = await t.mutation(api.applicantInterests.giveFinalApproval, {
      sessionHash: maleSession,
      interestId: result.interestId,
      approved: true,
    });
    expect(secondApproval.contactSharedNotification).toMatchObject({
      recipients: [
        {
          registrationId: male,
          name: "Final Approval Male",
          email: "final.approval.male@example.com",
        },
        {
          registrationId: female,
          name: "Final Approval Female",
          email: "final.approval.female@example.com",
        },
      ],
    });

    const finalMaleDashboard = await t.query(api.applicantInterests.getDashboard, {
      sessionHash: maleSession,
    });
    expect(finalMaleDashboard.outbound[0]).toMatchObject({
      flowStatus: "contact_shared",
      requesterFinalApproval: "approved",
      recipientFinalApproval: "approved",
    });
    expect(finalMaleDashboard.outbound[0]?.counterparty).toMatchObject({
      email: "final.approval.female@example.com",
      phone: "555-0100",
    });

    await t.mutation(api.applicantInterests.closeConnection, {
      sessionHash: maleSession,
      interestId: result.interestId,
    });

    const closedMatch = await t.query(api.matches.getById, {
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

    await t.mutation(api.applicantInterests.submitInterestNumber, {
      sessionHash: femaleSession,
      applicantNumber: 1,
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
      spouseRequirement1: "Documented Male requirement one",
      shareableBio: "Documented Male bio text",
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

    const result = await t.mutation(api.applicantInterests.submitInterestNumber, {
      sessionHash: femaleSession,
      applicantNumber: 1,
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
          flowStatus: "private_documented",
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

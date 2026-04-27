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
    return await ctx.db.insert("registrations", {
      name,
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
    });
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

describe("interest rules", () => {
  test("requires both applicants to have completed profiles", async () => {
    const t = convexTest(schema, modules);
    const completedMale = await createRegistration(t, "Completed Male", "male");
    const incompleteFemale = await createRegistration(t, "Incomplete Female", "female", false);

    await expect(
      t.mutation(api.interests.create, {
        fromRegistrationId: completedMale,
        toRegistrationId: incompleteFemale,
        source: "admin_entered",
      })
    ).rejects.toThrow("Recipient must complete their profile");

    const incompleteMale = await createRegistration(t, "Incomplete Male", "male", false);
    const completedFemale = await createRegistration(t, "Completed Female", "female");

    await expect(
      t.mutation(api.interests.create, {
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

    const first = await t.mutation(api.interests.create, {
      fromRegistrationId: male,
      toRegistrationId: recipients[0],
      source: "admin_entered",
    });
    await t.mutation(api.interests.create, {
      fromRegistrationId: male,
      toRegistrationId: recipients[1],
      source: "admin_entered",
    });
    await t.mutation(api.interests.create, {
      fromRegistrationId: male,
      toRegistrationId: recipients[2],
      source: "admin_entered",
    });

    await expect(
      t.mutation(api.interests.create, {
        fromRegistrationId: male,
        toRegistrationId: recipients[3],
        source: "admin_entered",
      })
    ).rejects.toThrow("Applicant already has 3 open interests");

    await t.mutation(api.interests.updateStatus, {
      id: first,
      status: "declined",
    });
    const replacement = await t.mutation(api.interests.create, {
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

    const first = await t.mutation(api.interests.create, {
      fromRegistrationId: male,
      toRegistrationId: female,
      source: "admin_entered",
    });

    await expect(
      t.mutation(api.interests.create, {
        fromRegistrationId: male,
        toRegistrationId: female,
        source: "admin_entered",
      })
    ).rejects.toThrow("An open interest already exists");

    await t.mutation(api.interests.updateStatus, {
      id: first,
      status: "closed",
    });
    const second = await t.mutation(api.interests.create, {
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

    await t.mutation(api.interests.create, {
      fromRegistrationId: male,
      toRegistrationId: female,
      source: "admin_entered",
    });
    const reciprocal = await t.mutation(api.interests.create, {
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

    const interestId = await t.mutation(api.interests.create, {
      fromRegistrationId: male,
      toRegistrationId: female,
      source: "admin_entered",
    });
    const matchId = await t.mutation(api.interests.convertToMatch, {
      interestId,
    });

    const activeAlternative = await t.mutation(api.interests.create, {
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

    const queuedInbound = await t.mutation(api.interests.create, {
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
    const interestId = await t.mutation(api.interests.create, {
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
});

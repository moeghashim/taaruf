import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import type { Doc, Id } from "./_generated/dataModel";

const baseRegistrationArgs = {
  name: "Test Applicant",
  age: 28,
  gender: "male" as const,
  maritalStatus: "single",
  education: "bachelor",
  job: "Engineer",
  phone: "555-0100",
  ethnicity: "Arab",
  prayerCommitment: "always_five" as const,
  hijabResponse: "open" as const,
  spouseRequirement1: "Kind",
  spouseRequirement2: "Patient",
  spouseRequirement3: "Smart",
  shareableBio: "Bio",
  photoSharingPermission: "ask_me_first" as const,
};

async function insertScheduledEvent(ctx: Parameters<Parameters<ReturnType<typeof convexTest>["run"]>[0]>[0]) {
  const now = Date.now();
  return await ctx.db.insert("events", {
    title: "May Workshop",
    eventCode: "may-workshop",
    eventMonth: "2026-05",
    series: "1plus1_match",
    location: "ROIC",
    startsAt: now + 7 * 24 * 60 * 60 * 1000,
    endsAt: now + 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000,
    status: "scheduled",
    maleCapacity: 10,
    femaleCapacity: 10,
    createdAt: now,
    updatedAt: now,
  });
}

async function getRegistration(
  t: ReturnType<typeof convexTest>,
  id: Id<"registrations">
) {
  return await t.run((ctx) => ctx.db.get(id)) as Doc<"registrations"> | null;
}

describe("applicant number", () => {
  test("starts at 1 and increments by 1 across consecutive registrations", async () => {
    const t = convexTest(schema, modules);

    const firstId = await t.mutation(api.registrations.create, {
      ...baseRegistrationArgs,
      email: "applicant1@example.com",
    });
    const secondId = await t.mutation(api.registrations.create, {
      ...baseRegistrationArgs,
      email: "applicant2@example.com",
    });

    const first = await getRegistration(t, firstId);
    const second = await getRegistration(t, secondId);

    expect(first?.applicantNumber).toBe(1);
    expect(second?.applicantNumber).toBe(2);
    expect(first?.publicApplicantNumber).toBe(1);
    expect(second?.publicApplicantNumber).toBe(2);
  });

  test("deleting a registration never reuses its applicant number", async () => {
    const t = convexTest(schema, modules);

    const firstId = await t.mutation(api.registrations.create, {
      ...baseRegistrationArgs,
      email: "applicant1@example.com",
    });
    const secondId = await t.mutation(api.registrations.create, {
      ...baseRegistrationArgs,
      email: "applicant2@example.com",
    });

    const second = await getRegistration(t, secondId);
    expect(second?.applicantNumber).toBe(2);
    expect(second?.publicApplicantNumber).toBe(2);

    await t.mutation(api.registrations.deleteRegistration, { id: secondId });

    const thirdId = await t.mutation(api.registrations.create, {
      ...baseRegistrationArgs,
      email: "applicant3@example.com",
    });
    const third = await getRegistration(t, thirdId);

    expect(third?.applicantNumber).toBe(3);
    expect(third?.publicApplicantNumber).toBe(3);

    const first = await getRegistration(t, firstId);
    expect(first?.applicantNumber).toBe(1);
    expect(first?.publicApplicantNumber).toBe(1);
  });

  test("even if every registration is deleted, the counter does not reset", async () => {
    const t = convexTest(schema, modules);

    const firstId = await t.mutation(api.registrations.create, {
      ...baseRegistrationArgs,
      email: "applicant1@example.com",
    });
    const secondId = await t.mutation(api.registrations.create, {
      ...baseRegistrationArgs,
      email: "applicant2@example.com",
    });

    await t.mutation(api.registrations.deleteRegistration, { id: firstId });
    await t.mutation(api.registrations.deleteRegistration, { id: secondId });

    const newId = await t.mutation(api.registrations.create, {
      ...baseRegistrationArgs,
      email: "applicant3@example.com",
    });
    const fresh = await getRegistration(t, newId);

    expect(fresh?.applicantNumber).toBe(3);
    expect(fresh?.publicApplicantNumber).toBe(3);
  });

  test("rejects a second registration with the same email", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.registrations.create, {
      ...baseRegistrationArgs,
      email: "dup@example.com",
    });
    await expect(
      t.mutation(api.registrations.create, {
        ...baseRegistrationArgs,
        email: "dup@example.com",
      })
    ).rejects.toThrow(/already registered/i);
  });

  test("reuses an existing profile for event registration with the same email", async () => {
    const t = convexTest(schema, modules);
    await t.run(insertScheduledEvent);

    const profileId = await t.mutation(api.registrations.create, {
      ...baseRegistrationArgs,
      email: "Existing.Profile@Example.com",
    });
    const eventSignupId = await t.mutation(api.registrations.create, {
      ...baseRegistrationArgs,
      email: "existing.profile@example.com",
      stripeSessionId: "cs_existing_email",
      eventCode: "may-workshop",
    });

    expect(eventSignupId).toBe(profileId);

    const result = await t.run(async (ctx) => {
      const registrations = await ctx.db.query("registrations").take(10);
      const eventRegistrations = await ctx.db.query("eventRegistrations").take(10);
      const profile = await ctx.db.get(profileId) as Doc<"registrations"> | null;
      return { registrations, eventRegistrations, profile };
    });

    expect(result.registrations).toHaveLength(1);
    expect(result.profile?.applicantNumber).toBe(1);
    expect(result.profile?.publicApplicantNumber).toBe(1);
    expect(result.profile?.stripeSessionId).toBe("cs_existing_email");
    expect(result.eventRegistrations).toEqual([
      expect.objectContaining({
        registrationId: profileId,
        registrationStatus: "pending",
      }),
    ]);
  });

  test("reuses an existing profile for event registration with the same phone", async () => {
    const t = convexTest(schema, modules);
    await t.run(insertScheduledEvent);

    const profileId = await t.mutation(api.registrations.create, {
      ...baseRegistrationArgs,
      email: "phone-original@example.com",
      phone: "(555) 010-2000",
    });
    const eventSignupId = await t.mutation(api.registrations.create, {
      ...baseRegistrationArgs,
      email: "phone-new@example.com",
      phone: "5550102000",
      stripeSessionId: "cs_existing_phone",
      eventCode: "may-workshop",
    });

    expect(eventSignupId).toBe(profileId);

    const counts = await t.run(async (ctx) => ({
      registrations: (await ctx.db.query("registrations").take(10)).length,
      eventRegistrations: (await ctx.db.query("eventRegistrations").take(10)).length,
    }));

    expect(counts).toEqual({ registrations: 1, eventRegistrations: 1 });
  });
});

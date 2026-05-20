import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

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

    const first = await t.run((ctx) => ctx.db.get(firstId));
    const second = await t.run((ctx) => ctx.db.get(secondId));

    expect(first?.applicantNumber).toBe(1);
    expect(second?.applicantNumber).toBe(2);
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

    const second = await t.run((ctx) => ctx.db.get(secondId));
    expect(second?.applicantNumber).toBe(2);

    await t.mutation(api.registrations.deleteRegistration, { id: secondId });

    const thirdId = await t.mutation(api.registrations.create, {
      ...baseRegistrationArgs,
      email: "applicant3@example.com",
    });
    const third = await t.run((ctx) => ctx.db.get(thirdId));

    expect(third?.applicantNumber).toBe(3);

    const first = await t.run((ctx) => ctx.db.get(firstId));
    expect(first?.applicantNumber).toBe(1);
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
    const fresh = await t.run((ctx) => ctx.db.get(newId));

    expect(fresh?.applicantNumber).toBe(3);
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
});

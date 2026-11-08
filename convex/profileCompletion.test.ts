import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

async function createBaseRegistration(
  t: ReturnType<typeof convexTest>,
  name: string,
  fields: Partial<{
    describeYourself: string;
    lookingFor: string;
    shareableBio: string;
    spouseRequirement1: string;
    spouseRequirement2: string;
    spouseRequirement3: string;
  }>
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("registrations", {
      name,
      age: 30,
      gender: "male",
      maritalStatus: "single",
      education: "College",
      job: "Engineer",
      email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
      phone: "555-0100",
      paymentStatus: "paid",
      status: "approved",
      searchStatus: "active",
      createdAt: Date.now(),
      profileCompletionStatus: "not_started",
      ...fields,
    });
  });
}

async function getRegistration(t: ReturnType<typeof convexTest>, id: Id<"registrations">) {
  return await t.run(async (ctx) => {
    const registration = await ctx.db.get(id);
    if (!registration) throw new Error("Registration not found");
    return registration;
  });
}

beforeEach(() => vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "synthetic-admin-secret"));
afterEach(() => vi.unstubAllEnvs());

describe("profile completion migrations", () => {
  test("backfills canonical profile content from legacy fields without overwriting current data", async () => {
    const t = convexTest(schema, modules);
    const legacyOnlyId = await createBaseRegistration(t, "Legacy Only", {
      describeYourself: "Legacy bio",
      lookingFor: "Kind, Practicing, Family oriented",
    });
    const currentId = await createBaseRegistration(t, "Current Profile", {
      describeYourself: "Old bio",
      lookingFor: "Old one, Old two, Old three",
      shareableBio: "Current bio",
      spouseRequirement1: "Current one",
      spouseRequirement2: "Current two",
      spouseRequirement3: "Current three",
    });

    const dryRun = await t.action(api.migrations.profileCompletion.backfillLegacyProfileContent, { adminSecret: "synthetic-admin-secret",
      dryRun: true,
      batchSize: 10,
    });

    expect(dryRun.updated).toBe(1);
    expect(dryRun.aboutBackfilled).toBe(1);
    expect(dryRun.lookingForBackfilled).toBe(1);
    await expect(getRegistration(t, legacyOnlyId)).resolves.not.toMatchObject({
      shareableBio: "Legacy bio",
    });

    const result = await t.action(api.migrations.profileCompletion.backfillLegacyProfileContent, { adminSecret: "synthetic-admin-secret",
      dryRun: false,
      batchSize: 10,
    });

    expect(result.updated).toBe(1);
    await expect(getRegistration(t, legacyOnlyId)).resolves.toMatchObject({
      shareableBio: "Legacy bio",
      spouseRequirement1: "Kind",
      spouseRequirement2: "Practicing",
      spouseRequirement3: "Family oriented",
    });
    await expect(getRegistration(t, currentId)).resolves.toMatchObject({
      shareableBio: "Current bio",
      spouseRequirement1: "Current one",
      spouseRequirement2: "Current two",
      spouseRequirement3: "Current three",
    });
  });
});

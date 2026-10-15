import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { hijabOptions, hijabQuestion, formatHijabResponse } from "../src/lib/hijab";

const profileFields = {
  ethnicity: "Arab",
  prayerCommitment: "always_five" as const,
  spouseRequirement1: "Kind",
  spouseRequirement2: "Patient",
  spouseRequirement3: "Practicing",
  shareableBio: "Test bio",
  photoSharingPermission: "ask_me_first" as const,
};
const registrationFields = {
  name: "Test Applicant", age: 28, maritalStatus: "single",
  education: "College", job: "Engineer", phone: "555-0100",
  email: "test@example.com", profileAccessToken: "test-profile-token",
};

describe("gender-specific hijab question", () => {
  test("offers exactly the requested five female answers", () => {
    expect(hijabQuestion("female")).toBe("Do you currently wear/practice hijab?");
    expect(hijabOptions("female").map(({ label }) => label)).toEqual([
      "Yes, I wear Burqa", "Yes, I wear Niqab", "Yes",
      "Not yet, but I am working on it", "No",
    ]);
  });
  test("preserves male preferences and waits for gender selection", () => {
    expect(hijabQuestion("male")).toBe("Do you wish for your wife to wear hijab?");
    expect(hijabOptions("male").map(({ value }) => value)).toEqual(["yes", "no", "open"]);
    expect(hijabOptions("")).toEqual([]);
    expect(hijabQuestion(undefined)).not.toContain("wife");
  });
  test("preserves legacy female open answers without reinterpreting them", () => {
    expect(hijabOptions("female", "open")).toContainEqual({ value: "open", label: "Not yet, but I am working on it" });
    expect(formatHijabResponse("open")).toBe("Open");
  });
  test.each(hijabOptions("female"))("formats $value for shared profiles", ({ value, label }) => {
    expect(formatHijabResponse(value)).toBe(label);
  });
});

describe("hijab persistence", () => {
  test.each(["burqa", "niqab", "yes", "working_on_it", "no", "open"] as const)(
    "supports female %s in signup and both profile editors", async (hijabResponse) => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.registrations.create, {
        ...registrationFields, ...profileFields, gender: "female", hijabResponse,
      });
      expect((await t.run((ctx) => ctx.db.get(id)))?.hijabResponse).toBe(hijabResponse);
      const imageId = await t.run((ctx) => ctx.storage.store(new Blob(["test"], { type: "image/png" })));
      const update = { ...profileFields, imageStorageIds: [imageId], hijabResponse };
      await t.run(async (ctx) => {
        await ctx.db.patch(id, { hijabResponse: undefined });
        await ctx.db.insert("applicantSessions", {
          registrationId: id, sessionHash: "test-session", createdAt: Date.now(), expiresAt: Date.now() + 60000,
        });
      });
      await t.mutation(api.registrations.updateProfile, { ...update, token: registrationFields.profileAccessToken });
      expect((await t.run((ctx) => ctx.db.get(id)))?.hijabResponse).toBe(hijabResponse);
      await t.run((ctx) => ctx.db.patch(id, { hijabResponse: undefined }));
      await t.mutation(api.applicantProfile.updateProfile, { ...update, sessionHash: "test-session" });
      expect((await t.run((ctx) => ctx.db.get(id)))?.hijabResponse).toBe(hijabResponse);
    }
  );
  test.each(["yes", "no", "open"] as const)("still accepts male %s", async (hijabResponse) => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(api.registrations.create, {
      ...registrationFields, ...profileFields, gender: "male", hijabResponse,
    });
    expect((await t.run((ctx) => ctx.db.get(id)))?.hijabResponse).toBe(hijabResponse);
  });
});

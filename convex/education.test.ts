import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { educationOptions, educationOptionsFor, formatEducation, isEducation } from "../src/lib/education";
const base = { name: "Synthetic", age: 30, gender: "female" as const, maritalStatus: "single", education: "College", job: "Engineer", phone: "5550100", email: "synthetic@example.invalid", profileAccessToken: "owner-token" };
const fields = { ethnicity: "Arab", prayerCommitment: "always_five" as const, hijabResponse: "yes" as const, spouseRequirement1: "Kind", spouseRequirement2: "Patient", spouseRequirement3: "Practicing", shareableBio: "Synthetic bio", photoSharingPermission: "ask_me_first" as const };
async function fixture() {
  const t = convexTest(schema, modules);
  const id = await t.mutation(api.registrations.create, base);
  const other = await t.mutation(api.registrations.create, { ...base, email: "other@example.invalid", profileAccessToken: "other-token" });
  const image = await t.run(ctx => ctx.storage.store(new Blob(["synthetic"])));
  await t.run(ctx => ctx.db.insert("applicantSessions", { registrationId: id, sessionHash: "owner", createdAt: Date.now(), expiresAt: Date.now() + 60000 }));
  return { t, id, other, update: { ...fields, imageStorageIds: [image] } };
}
test.each(educationOptions)("$label persists through signup and both editors", async ({ value, label }) => {
  const { t, id, other, update } = await fixture();
  const signup = await t.mutation(api.registrations.create, { ...base, email: "signup-" + value + "@example.invalid", education: value });
  expect((await t.run(ctx => ctx.db.get(signup)))?.education).toBe(value);
  await t.mutation(api.applicantProfile.updateProfile, { ...update, sessionHash: "owner", education: value });
  expect((await t.query(api.applicantProfile.getProfile, { sessionHash: "owner" })).registration.education).toBe(value);
  expect((await t.run(ctx => ctx.db.get(id)))?.education).toBe(value);
  expect((await t.run(ctx => ctx.db.get(other)))?.education).toBe("College");
  await t.run(ctx => ctx.db.patch(id, { education: "College" }));
  await t.mutation(api.registrations.updateProfile, { ...update, token: "owner-token", education: value });
  expect((await t.query(api.registrations.getByProfileAccessToken, { token: "owner-token" }))?.education).toBe(value);
  expect(formatEducation(value)).toBe(label);
});
test("omitted and unchanged historic values survive both editors", async () => {
  const { t, id, update } = await fixture();
  for (const value of ["College", "Legacy custom degree", "highSchool", "md_do"]) {
    await t.run(ctx => ctx.db.patch(id, { education: value }));
    for (const education of [undefined, value]) {
      await t.mutation(api.applicantProfile.updateProfile, { ...update, sessionHash: "owner", education });
      await t.mutation(api.registrations.updateProfile, { ...update, token: "owner-token", education });
      expect((await t.query(api.applicantProfile.getProfile, { sessionHash: "owner" })).registration.education).toBe(value);
    }
    expect(educationOptionsFor(value).some(option => option.value === value)).toBe(true);
  }
});
test.each(["", "invented", null, 42])("rejects invalid education %s without changing stored value", async education => {
  const { t, id, update } = await fixture();
  // Deliberately exercise runtime validation with malformed client input.
  const invalid = education as string;
  await expect(t.mutation(api.applicantProfile.updateProfile, { ...update, sessionHash: "owner", education: invalid })).rejects.toThrow();
  await expect(t.mutation(api.registrations.updateProfile, { ...update, token: "owner-token", education: invalid })).rejects.toThrow();
  expect((await t.run(ctx => ctx.db.get(id)))?.education).toBe("College");
  await expect(t.mutation(api.registrations.create, { ...base, email: "invalid@example.invalid", education: invalid })).rejects.toThrow();
  expect(isEducation(education)).toBe(false);
});
test("session ownership, missing/expired/revoked authentication and token checks", async () => {
  const { t, id, update } = await fixture();
  await t.run(async ctx => {
    await ctx.db.insert("applicantSessions", { registrationId: id, sessionHash: "expired", createdAt: 1, expiresAt: 2 });
    await ctx.db.insert("applicantSessions", { registrationId: id, sessionHash: "revoked", createdAt: 1, expiresAt: Date.now() + 60000, revokedAt: 2 });
  });
  for (const sessionHash of ["", "wrong", "expired", "revoked"]) {
    await expect(t.query(api.applicantProfile.getProfile, { sessionHash })).rejects.toThrow("Unauthorized");
    await expect(t.mutation(api.applicantProfile.updateProfile, { ...update, sessionHash, education: "other" })).rejects.toThrow("Unauthorized");
  }
  await expect(t.mutation(api.registrations.updateProfile, { ...update, token: "wrong", education: "other" })).rejects.toThrow("Profile not found");
  expect((await t.run(ctx => ctx.db.get(id)))?.education).toBe("College");
});

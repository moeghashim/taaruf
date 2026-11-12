import { convexTest } from "convex-test";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
const adminSecret = "synthetic-upload-secret";
const signupCapabilityHash = "a".repeat(64);
beforeEach(() => vi.stubEnv("ATTENDANCE_ADMIN_SECRET", adminSecret));
afterEach(() => vi.unstubAllEnvs());
const base = { name: "Synthetic", age: 30, gender: "male" as const, maritalStatus: "single", education: "College", job: "Test", email: "a@example.invalid", phone: "555" };
const profile = { ethnicity: "test", prayerCommitment: "always_five" as const, hijabResponse: "yes" as const, spouseRequirement1: "one", spouseRequirement2: "two", spouseRequirement3: "three", shareableBio: "bio", photoSharingPermission: "no" as const };
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const a = await ctx.db.insert("registrations", { ...base, status: "pending", createdAt: Date.now(), profileAccessToken: "owner-a" });
    const b = await ctx.db.insert("registrations", { ...base, email: "b@example.invalid", status: "pending", createdAt: Date.now(), profileAccessToken: "owner-b" });
    await ctx.db.insert("applicantSessions", { registrationId: a, sessionHash: "session-a", createdAt: Date.now(), expiresAt: Date.now() + 60000 });
    const image = await ctx.storage.store(new Blob(["synthetic"], { type: "image/png" }));
    const second = await ctx.storage.store(new Blob(["second"], { type: "image/png" }));
    // convex-test storeBlob omits contentType; model the HTTP upload metadata.
    // @ts-expect-error Test-only emulation of system metadata written by HTTP storage.
    await ctx.db.patch(image, { contentType: "image/png" });
    // @ts-expect-error Test-only emulation of system metadata written by HTTP storage.
    await ctx.db.patch(second, { contentType: "image/png" });
    return { a, b, image, second };
  });
  return { t, ...ids };
}
test("public URL issuance and arbitrary ledger registration fail closed", async () => {
  const { t, image } = await fixture();
  for (const secret of [undefined, "wrong"]) {
    await expect(t.mutation(api.registrations.generateImageUploadUrl, { adminSecret: secret })).rejects.toThrow("Unauthorized");
    await expect(t.mutation(api.photoUploads.record, { adminSecret: secret, storageId: image, signupCapabilityHash })).rejects.toThrow("Unauthorized");
  }
});
test("unknown and unattached foreign uploads cannot be claimed by profile or signup", async () => {
  const { t, image } = await fixture();
  await expect(t.mutation(api.registrations.updateProfile, { ...profile, token: "owner-b", imageStorageIds: [image] })).rejects.toThrow();
  await t.mutation(api.photoUploads.record, { adminSecret, storageId: image, sessionHash: "session-a" });
  await expect(t.mutation(api.registrations.updateProfile, { ...profile, token: "owner-b", imageStorageIds: [image] })).rejects.toThrow("Image does not belong");
  await expect(t.mutation(api.registrations.create, { ...base, adminSecret, signupCapabilityHash, imageStorageIds: [image] })).rejects.toThrow("Image does not belong");
});
test("valid session upload attaches; removal and deletion never release ownership", async () => {
  const { t, image, second, a } = await fixture();
  for (const storageId of [image, second]) await t.mutation(api.photoUploads.record, { adminSecret, storageId, sessionHash: "session-a" });
  await t.mutation(api.applicantProfile.updateProfile, { ...profile, sessionHash: "session-a", imageStorageIds: [image] });
  await t.mutation(api.applicantProfile.updateProfile, { ...profile, sessionHash: "session-a", imageStorageIds: [second] });
  await expect(t.mutation(api.registrations.updateProfile, { ...profile, token: "owner-b", imageStorageIds: [image] })).rejects.toThrow("Image does not belong");
  await t.run(ctx => ctx.db.delete(a));
  await expect(t.mutation(api.registrations.updateProfile, { ...profile, token: "owner-b", imageStorageIds: [image] })).rejects.toThrow("Image does not belong");
});
test("legacy retain and removal persist ownership; legacy-token upload attaches", async () => {
  const { t, image, second, a } = await fixture();
  await t.run(ctx => ctx.db.patch(a, { imageStorageIds: [image] }));
  await t.mutation(api.registrations.updateProfile, { ...profile, token: "owner-a", imageStorageIds: [image] });
  await t.mutation(api.photoUploads.record, { adminSecret, storageId: second, profileToken: "owner-a" });
  await t.mutation(api.registrations.updateProfile, { ...profile, token: "owner-a", imageStorageIds: [second] });
  await expect(t.mutation(api.registrations.updateProfile, { ...profile, token: "owner-b", imageStorageIds: [image] })).rejects.toThrow("Image does not belong");
});
test("signup capability attaches atomically and cannot be reused by another signup", async () => {
  const { t, image } = await fixture();
  await t.mutation(api.photoUploads.record, { adminSecret, storageId: image, signupCapabilityHash });
  await expect(t.mutation(api.registrations.create, { ...base, email: "new@example.invalid", adminSecret, signupCapabilityHash: "b".repeat(64), imageStorageIds: [image] })).rejects.toThrow("Image does not belong");
  const id = await t.mutation(api.registrations.create, { ...base, email: "new@example.invalid", adminSecret, signupCapabilityHash, imageStorageIds: [image] });
  expect(await t.run(ctx => ctx.db.get(id))).toMatchObject({ imageStorageIds: [image] });
  await expect(t.mutation(api.registrations.create, { ...base, email: "other@example.invalid", adminSecret, signupCapabilityHash, imageStorageIds: [image] })).rejects.toThrow("Image does not belong");
});

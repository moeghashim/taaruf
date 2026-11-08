import { convexTest } from "convex-test";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const secret = "synthetic-boundary-secret";
beforeEach(() => vi.stubEnv("ATTENDANCE_ADMIN_SECRET", secret));
afterEach(() => vi.unstubAllEnvs());
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const base = { name: "Synthetic", age: 30, maritalStatus: "single", education: "College", job: "Test", phone: "555", status: "approved" as const, profileCompletionStatus: "completed" as const, photoSharingPermission: "yes" as const, createdAt: Date.now() };
    const image = await ctx.storage.store(new Blob(["synthetic-image"]));
    const male = await ctx.db.insert("registrations", { ...base, gender: "male", email: "m@example.invalid", profileAccessToken: "private-profile-token", stripeSessionId: "private-checkout", imageStorageIds: [image] });
    const female = await ctx.db.insert("registrations", { ...base, gender: "female", email: "f@example.invalid" });
    const eventId = await ctx.db.insert("events", { title: "Synthetic", eventCode: "synthetic", eventMonth: "2026-11", series: "synthetic", location: "Test", startsAt: Date.now(), endsAt: Date.now(), status: "completed", maleCapacity: 2, femaleCapacity: 2, createdAt: Date.now(), updatedAt: Date.now() });
    const interest = await ctx.db.insert("interests", { eventId, fromRegistrationId: male, toRegistrationId: female, source: "platform_submission", status: "new", visibility: "admin_actionable", senderPhotoConsent: "no", createdAt: Date.now(), updatedAt: Date.now() });
    const share = await ctx.db.insert("profileShares", { ownerRegistrationId: male, recipientRegistrationId: female, interestId: interest, shareToken: "share-bearer", includeImages: true, status: "shared", createdAt: Date.now(), updatedAt: Date.now() });
    return { male, female, image, interest, share };
  });
  return { t, ...ids };
}
test("raw discovery and writes fail closed before touching data", async () => {
  const { t, male, image, interest } = await fixture();
  for (const adminSecret of [undefined, "wrong"]) {
    await expect(t.query(api.registrations.getAll, { adminSecret })).rejects.toThrow("Unauthorized");
    await expect(t.query(api.registrations.getById, { id: male, adminSecret })).rejects.toThrow("Unauthorized");
    await expect(t.query(api.registrations.getByEmail, { email: "m@example.invalid", adminSecret })).rejects.toThrow("Unauthorized");
    await expect(t.query(api.registrations.getByStripeSession, { stripeSessionId: "private-checkout", adminSecret })).rejects.toThrow("Unauthorized");
    await expect(t.query(api.registrations.getImageUrls, { storageIds: [image], adminSecret })).rejects.toThrow("Unauthorized");
    await expect(t.query(api.interests.getAll, { adminSecret })).rejects.toThrow("Unauthorized");
    await expect(t.query(api.matches.getAll, { adminSecret })).rejects.toThrow("Unauthorized");
    await expect(t.query(api.profileShares.getAll, { adminSecret })).rejects.toThrow("Unauthorized");
    await expect(t.mutation(api.interests.remove, { id: interest, adminSecret })).rejects.toThrow("Unauthorized");
    await expect(t.mutation(api.registrations.updateStatus, { id: male, status: "approved", adminSecret })).rejects.toThrow("Unauthorized");
    await expect(t.mutation(api.applicantAuth.createLoginToken, { email: "m@example.invalid", tokenHash: "attacker", adminSecret })).rejects.toThrow("Unauthorized");
    await expect(t.query(api.applicantAuth.getSession, { sessionHash: "guessed", adminSecret })).rejects.toThrow("Unauthorized");
  }
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "");
  await expect(t.query(api.registrations.getAll, { adminSecret: secret })).rejects.toThrow("Unauthorized");
});
test("admin lists and bearer shares do not expose reusable credentials or private owner fields", async () => {
  const { t } = await fixture();
  for (const rows of [await t.query(api.registrations.getAll, { adminSecret: secret }), await t.query(api.interests.getAll, { adminSecret: secret }), await t.query(api.profileShares.getAll, { adminSecret: secret })]) {
    expect(JSON.stringify(rows)).not.toMatch(/private-profile-token|private-checkout|share-bearer/);
  }
  const share = await t.query(api.profileShares.getByShareToken, { shareToken: "share-bearer" });
  expect(share?.includeImages).toBe(false);
  expect(share?.owner?.imageStorageIds).toEqual([]);
  expect(JSON.stringify(share)).not.toMatch(/m@example|private-profile-token|private-checkout|share-bearer/);
});
test("share consent follows linked sender no, yes, revoke, private, reset", async () => {
  const { t, interest } = await fixture();
  const get = () => t.query(api.profileShares.getByShareToken, { shareToken: "share-bearer" });
  expect((await get())?.includeImages).toBe(false);
  await t.run(ctx => ctx.db.patch(interest, { senderPhotoConsent: "yes" }));
  expect((await get())?.includeImages).toBe(true);
  await t.run(ctx => ctx.db.patch(interest, { senderPhotoConsentRevokedAt: Date.now() }));
  expect((await get())?.includeImages).toBe(false);
  await t.run(ctx => ctx.db.patch(interest, { senderPhotoConsentRevokedAt: undefined, visibility: "internal_only" }));
  expect(await get()).toBeNull();
  await t.run(ctx => ctx.db.patch(interest, { visibility: "admin_actionable", testReset: { at: Date.now(), reason: "synthetic", actor: "admin" } }));
  expect(await get()).toBeNull();
});
test("profile owner cannot attach another applicant's private storage id", async () => {
  const { t, female, image } = await fixture();
  await t.run(ctx => ctx.db.patch(female, { profileAccessToken: "female-token" }));
  await expect(t.mutation(api.registrations.updateProfile, { token: "female-token", imageStorageIds: [image], ethnicity: "Test", prayerCommitment: "always_five", hijabResponse: "yes", spouseRequirement1: "a", spouseRequirement2: "b", spouseRequirement3: "c", shareableBio: "Test", photoSharingPermission: "yes" })).rejects.toThrow("does not belong");
});

test("reset consent audit cannot be mutated by its former owner", async () => {
  const { t, male, interest } = await fixture();
  await t.run(async ctx => {
    await ctx.db.insert("applicantSessions", { registrationId: male, sessionHash: "owner-session", expiresAt: Date.now() + 60000, createdAt: Date.now() });
    await ctx.db.patch(interest, { testReset: { at: Date.now(), reason: "synthetic", actor: "admin" } });
  });
  const before = await t.run(ctx => ctx.db.get(interest));
  await expect(t.mutation(api.applicantInterests.revokeSenderPhotoConsent, { sessionHash: "owner-session", interestId: interest })).rejects.toThrow("Unauthorized");
  expect(await t.run(ctx => ctx.db.get(interest))).toEqual(before);
});

test("unlinked and match-only shares cannot bypass recipient-specific consent", async () => {
  const {t, male, female, interest, share} = await fixture();
  await t.run(ctx => ctx.db.patch(share, {interestId: undefined}));
  const get = () => t.query(api.profileShares.getByShareToken, {shareToken: "share-bearer"});
  expect(await get()).toBeNull();
  await expect(t.mutation(api.profileShares.create, {adminSecret: secret, ownerRegistrationId: male, recipientRegistrationId: female, includeImages:true, shareToken:"new-unlinked"})).rejects.toThrow("context");
  const match = await t.run(async ctx => {
    const id = await ctx.db.insert("matches", {maleRegistrationId:male, femaleRegistrationId:female, interestId:interest, status:"new", interestType:"mutual_interest", initiatedBy:"interest_signal", createdAt:Date.now(), updatedAt:Date.now()});
    await ctx.db.patch(share, {matchId:id}); return id;
  });
  expect((await get())?.includeImages).toBe(false);
  await t.run(ctx => ctx.db.patch(interest,{senderPhotoConsent:"yes"}));
  expect((await get())?.includeImages).toBe(true);
  await t.run(ctx => ctx.db.patch(interest,{senderPhotoConsentRevokedAt:Date.now()}));
  expect((await get())?.includeImages).toBe(false);
  for (const status of ["closed", "declined", "withdrawn"] as const) {
    await t.run(ctx => ctx.db.patch(interest,{status})); expect(await get()).toBeNull();
  }
  await t.run(ctx => ctx.db.patch(interest,{status:"new",visibility:"internal_only"}));
  expect(await get()).toBeNull();
  await expect(t.mutation(api.profileShares.create, {adminSecret:secret, ownerRegistrationId:male,recipientRegistrationId:female,includeImages:false,shareToken:"match-private",matchId:match})).rejects.toThrow("context");
});
test("administrative backfill verifier requires authorization", async () => {
  const {t}=await fixture();
  await expect(t.query(api.events.verifyEventBackfill, {})).rejects.toThrow("Unauthorized");
  await expect(t.query(api.events.verifyEventBackfill, {adminSecret:secret})).resolves.toBeDefined();
});

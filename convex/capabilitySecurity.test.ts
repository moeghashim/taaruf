import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { capabilityAllowed, CAPABILITY_CUTOFF_KEY } from "./capabilitySecurity";
const adminSecret = "synthetic-cutoff-admin";
const now = 1800000000000;
beforeEach(() => { vi.stubEnv("ATTENDANCE_ADMIN_SECRET", adminSecret); vi.spyOn(Date, "now").mockReturnValue(now); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const base = { name: "Synthetic", age: 30, maritalStatus: "single", education: "College", job: "Test", phone: "synthetic", status: "approved" as const, profileCompletionStatus: "completed" as const, photoSharingPermission: "yes" as const, createdAt: now - 1000 };
    const image = await ctx.storage.store(new Blob(["synthetic"]));
    const owner = await ctx.db.insert("registrations", { ...base, gender: "male", email: "cutoff@example.invalid", profileAccessToken: "old-profile", imageStorageIds: [image] });
    const recipient = await ctx.db.insert("registrations", { ...base, gender: "female", email: "recipient@example.invalid" });
    await ctx.db.insert("profileShares", { ownerRegistrationId: owner, recipientRegistrationId: recipient, shareToken: "old-share", includeImages: true, status: "shared", createdAt: now - 1000, updatedAt: now - 1000 });
    await ctx.db.insert("applicantSessions", { registrationId: owner, sessionHash: "old-session", createdAt: now - 1000, expiresAt: now + 10000 });
    await ctx.db.insert("applicantLoginTokens", { registrationId: owner, tokenHash: "old-login", createdAt: now - 1000, expiresAt: now + 10000 });
    return { owner, recipient, image };
  });
  return { t, ...ids };
}
async function activate(t: Awaited<ReturnType<typeof fixture>>["t"], cutoff = now) {
  return t.mutation(api.settings.set, { adminSecret, key: CAPABILITY_CUTOFF_KEY, value: String(cutoff) });
}
test("inactive compatibility, strict boundary, missing timestamp, corrupt config and monotonic activation", async () => {
  const { t } = await fixture();
  expect(await t.run(ctx => capabilityAllowed(ctx))).toBe(true);
  await expect(t.mutation(api.settings.set, { key: CAPABILITY_CUTOFF_KEY, value: String(now) })).rejects.toThrow("Unauthorized");
  await activate(t);
  for (const timestamp of [undefined, now - 1, now, NaN, Infinity]) expect(await t.run(ctx => capabilityAllowed(ctx, timestamp))).toBe(false);
  expect(await t.run(ctx => capabilityAllowed(ctx, now + 1))).toBe(true);
  for (const value of ["", "0", "invalid", String(now - 1), String(now + 1)]) await expect(t.mutation(api.settings.set, { adminSecret, key: CAPABILITY_CUTOFF_KEY, value })).rejects.toThrow("Cutoff");
  await activate(t); // idempotent, no reset
  await t.run(async ctx => { const row = await ctx.db.query("settings").withIndex("by_key", q => q.eq("key", CAPABILITY_CUTOFF_KEY)).unique(); await ctx.db.patch(row!._id, { value: "invalid" }); });
  expect(await t.run(ctx => capabilityAllowed(ctx, now + 1))).toBe(false);
});
test("all old read/write/upload/redemption paths deny without changing preserved rows or storage", async () => {
  const { t, image } = await fixture();
  expect(await t.query(api.registrations.getByProfileAccessToken, { token: "old-profile" })).not.toBeNull();
  const snapshot = () => t.run(async ctx => ({ registrations: await ctx.db.query("registrations").collect(), shares: await ctx.db.query("profileShares").collect(), sessions: await ctx.db.query("applicantSessions").collect(), tokens: await ctx.db.query("applicantLoginTokens").collect(), interests: await ctx.db.query("interests").collect(), matches: await ctx.db.query("matches").collect(), events: await ctx.db.query("events").collect(), uploads: await ctx.db.query("photoUploads").collect(), attendees: await ctx.db.query("eventAttendees").collect(), audits: await ctx.db.query("pairTestResetAudits").collect(), eventRegistrations: await ctx.db.query("eventRegistrations").collect(), image: await (await ctx.storage.get(image))!.text() }));
  await t.run(async ctx => {
    const rows = await ctx.db.query("registrations").collect();
    const eventId = await ctx.db.insert("events", { title: "Synthetic", eventCode: "cutoff", eventMonth: "2026-11", series: "test", location: "test", startsAt: now - 1000, endsAt: now, status: "completed", maleCapacity: 2, femaleCapacity: 2, createdAt: now, updatedAt: now });
    await ctx.db.insert("interests", { eventId, fromRegistrationId: rows[0]._id, toRegistrationId: rows[1]._id, source: "platform_submission", status: "new", visibility: "admin_actionable", createdAt: now, updatedAt: now });
    await ctx.db.insert("matches", { maleRegistrationId: rows[0]._id, femaleRegistrationId: rows[1]._id, interestType: "mutual_interest", status: "new", createdAt: now, updatedAt: now });
    await ctx.db.insert("eventAttendees", { eventId, registrationId: rows[0]._id, addedAt: now });
    await ctx.db.insert("pairTestResetAudits", { operationKey: "synthetic", request: "synthetic", snapshot: "synthetic", createdAt: now });
  });
  const before = await snapshot();
  await activate(t);
  expect(await t.query(api.registrations.getByProfileAccessToken, { token: "old-profile" })).toBeNull();
  expect(await t.query(api.profileShares.getByShareToken, { shareToken: "old-share" })).toBeNull();
  await expect(t.mutation(api.profileShares.markViewed, { shareToken: "old-share" })).rejects.toThrow("not found");
  expect(await t.query(api.applicantAuth.getSession, { adminSecret, sessionHash: "old-session" })).toBeNull();
  expect(await t.mutation(api.applicantAuth.touchSession, { adminSecret, sessionHash: "old-session" })).toBe(false);
  expect(await t.mutation(api.applicantAuth.claimLoginToken, { adminSecret, tokenHash: "old-login", sessionHash: "forbidden-session" })).toBeNull();
  for (const target of [api.applicantProfile.getProfile, api.applicantInterests.getDashboard, api.events.getApplicantEvents]) await expect(t.query(target, { sessionHash: "old-session" })).rejects.toThrow("Unauthorized");
  for (const credential of [{ sessionHash: "old-session" }, { profileToken: "old-profile" }]) await expect(t.query(api.photoUploads.authorize, { adminSecret, ...credential })).rejects.toThrow("Unauthorized");
  await expect(t.mutation(api.registrations.updateProfile, { token: "old-profile", ethnicity: "Test", imageStorageIds: [image], prayerCommitment: "always_five", hijabResponse: "no", spouseRequirement1: "one", spouseRequirement2: "two", spouseRequirement3: "three", shareableBio: "Test", photoSharingPermission: "yes" })).rejects.toThrow("Profile not found");
  expect(await snapshot()).toEqual(before);
});
test("fresh authenticated recovery, single-use redemption, expiry, rotation and consent", async () => {
  const { t, owner, recipient } = await fixture();
  await activate(t, now - 1);
  await expect(t.mutation(api.registrations.setProfileAccessToken, { id: owner, token: "new-profile" })).rejects.toThrow("Unauthorized");
  await expect(t.mutation(api.registrations.setProfileAccessToken, { adminSecret, id: owner, token: "old-profile" })).rejects.toThrow("fresh");
  await t.mutation(api.registrations.setProfileAccessToken, { adminSecret, id: owner, token: "new-profile", recoveryOnly: true });
  expect(await t.query(api.registrations.getByProfileAccessToken, { token: "new-profile" })).not.toBeNull();
  expect(await t.query(api.registrations.getByProfileAccessToken, { token: "old-profile" })).toBeNull();
  expect(await t.query(api.photoUploads.authorize, { adminSecret, profileToken: "new-profile" })).toBe(true);
  await t.mutation(api.applicantAuth.createLoginToken, { adminSecret, email: "cutoff@example.invalid", tokenHash: "new-login" });
  expect(await t.mutation(api.applicantAuth.claimLoginToken, { adminSecret, tokenHash: "new-login", sessionHash: "new-session" })).not.toBeNull();
  expect(await t.mutation(api.applicantAuth.claimLoginToken, { adminSecret, tokenHash: "new-login", sessionHash: "replay" })).toBeNull();
  expect(await t.query(api.applicantAuth.getSession, { adminSecret, sessionHash: "new-session" })).not.toBeNull();
  expect(await t.query(api.photoUploads.authorize, { adminSecret, sessionHash: "new-session" })).toBe(true);
  await t.mutation(api.applicantAuth.createLoginToken, { adminSecret, email: "cutoff@example.invalid", tokenHash: "expired", expiresInMs: 0 });
  expect(await t.mutation(api.applicantAuth.claimLoginToken, { adminSecret, tokenHash: "expired", sessionHash: "expired-session" })).toBeNull();
  await t.mutation(api.applicantAuth.revokeSession, { adminSecret, sessionHash: "new-session" });
  expect(await t.query(api.applicantAuth.getSession, { adminSecret, sessionHash: "new-session" })).toBeNull();
  expect((await t.run(ctx => ctx.db.get(owner)))?.profileCompletionStatus).toBe("completed");
  await t.mutation(api.profileShares.create, { adminSecret, ownerRegistrationId: owner, recipientRegistrationId: recipient, includeImages: true, shareToken: "new-share" });
  expect((await t.query(api.profileShares.getByShareToken, { shareToken: "new-share" }))?.includeImages).toBe(true);
  await expect(t.mutation(api.profileShares.create, { adminSecret, ownerRegistrationId: owner, recipientRegistrationId: recipient, includeImages: true, shareToken: "old-share" })).rejects.toThrow("fresh");
  await t.run(ctx => ctx.db.patch(owner, { photoSharingPermission: "no" }));
  expect((await t.query(api.profileShares.getByShareToken, { shareToken: "new-share" }))?.includeImages).toBe(false);
});

for (const status of ["not_started", "in_progress", "completed"] as const) test(`email issuance replaces denied capabilities and preserves ${status} profiles`, async () => {
  const { t, owner } = await fixture();
  await t.run(ctx => ctx.db.patch(owner, { profileCompletionStatus: status, shareableBio: "Preserved bio", spouseRequirement1: "Preserved requirement" }));
  await activate(t, now - 1);
  const before = await t.run(ctx => ctx.db.get(owner));
  await expect(t.mutation(api.registrations.ensureProfileAccessToken, { expectedEmail: before!.email, id: owner, token: "fresh-email" })).rejects.toThrow("Unauthorized");
  expect(await t.query(api.registrations.getByProfileAccessToken, { token: "old-profile" })).toBeNull();
  const token = await t.mutation(api.registrations.ensureProfileAccessToken, { expectedEmail: before!.email, adminSecret, id: owner, token: "fresh-email" });
  expect(token).toBe("fresh-email");
  expect(await t.query(api.registrations.getByProfileAccessToken, { token })).not.toBeNull();
  expect(await t.query(api.registrations.getByProfileAccessToken, { token: "old-profile" })).toBeNull();
  expect(await t.run(ctx => ctx.db.get(owner))).toEqual({ ...before, profileAccessToken: token, profileAccessTokenIssuedAt: now });
  expect(await t.mutation(api.registrations.ensureProfileAccessToken, { expectedEmail: before!.email, adminSecret, id: owner, token: "unused" })).toBe(token);
  await activate(t, now);
  await expect(t.mutation(api.registrations.ensureProfileAccessToken, { expectedEmail: before!.email, adminSecret, id: owner, token: "equal-cutoff" })).rejects.toThrow("issuance unavailable");
  expect((await t.run(ctx => ctx.db.get(owner)))?.profileAccessToken).toBe(token);
});

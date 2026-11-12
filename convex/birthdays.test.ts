import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { ageFromDateOfBirth, calendarDay, validateDateOfBirth } from "./age";
import { currentAge } from "./birthdays";
beforeEach(() => { vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "birthday-test"); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-10T18:00:00Z")); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
const base = { adminSecret: "birthday-test", name: "Synthetic", age: 30, gender: "female" as const, maritalStatus: "single", education: "College", job: "Engineer", phone: "5550100", email: "birthday@example.invalid", profileAccessToken: "owner-token" };
const fields = { ethnicity: "Arab", prayerCommitment: "always_five" as const, hijabResponse: "yes" as const, spouseRequirement1: "Kind", spouseRequirement2: "Patient", spouseRequirement3: "Practicing", shareableBio: "Synthetic", photoSharingPermission: "no" as const };
async function fixture() {
  const t = convexTest(schema, modules);
  const id = await t.mutation(api.registrations.create, base);
  const other = await t.mutation(api.registrations.create, { ...base, email: "other@example.invalid", profileAccessToken: "other-token" });
  const image = await t.run(ctx => ctx.storage.store(new Blob(["synthetic"])));
  await t.run(async ctx => { await ctx.db.patch(id, { imageStorageIds: [image] }); await ctx.db.insert("applicantSessions", { registrationId: id, sessionHash: "owner", createdAt: Date.now(), expiresAt: Date.now() + 86400000 }); });
  return { t, id, other, update: { ...fields, imageStorageIds: [image] } };
}
test("calendar day respects Chicago midnight and DST", () => {
  expect(calendarDay(Date.parse("2026-11-11T05:59:59Z"))).toBe("2026-11-10");
  expect(calendarDay(Date.parse("2026-11-11T06:00:00Z"))).toBe("2026-11-11");
  expect(calendarDay(Date.parse("2026-07-11T04:59:59Z"))).toBe("2026-07-10");
  expect(calendarDay(Date.parse("2026-07-11T05:00:00Z"))).toBe("2026-07-11");
});
test("birthday, leap day and age boundaries are calendar based", () => {
  expect(ageFromDateOfBirth("2000-02-29", "2025-02-28")).toBe(24);
  expect(ageFromDateOfBirth("2000-02-29", "2025-03-01")).toBe(25);
  expect(ageFromDateOfBirth("2000-02-29", "2024-02-29")).toBe(24);
  expect(validateDateOfBirth("2008-11-10")).toBe(18);
  expect(validateDateOfBirth("1926-11-11")).toBe(99);
  for (const dob of ["2008-11-11", "1926-11-10", "2027-01-01", "2001-02-29", "2000-04-31", "2000-2-01", "", "0000-01-01", "2000-01-01T00:00:00Z"]) expect(() => validateDateOfBirth(dob)).toThrow();
});
test("signup stores private DOB and ignores supplied age; legacy retains numeric age", async () => {
  const { t, id } = await fixture();
  const added = await t.mutation(api.registrations.create, { ...base, email: "new@example.invalid", age: 98, dateOfBirth: "2000-11-11" });
  const raw = await t.run(ctx => ctx.db.get(added));
  expect(raw?.age).toBe(25);
  expect(raw).not.toHaveProperty("dateOfBirth");
  expect((await t.run(ctx => ctx.db.get(id)))?.age).toBe(30);
  const withoutAge = await t.mutation(api.registrations.create, { ...base, email: "no-age@example.invalid", age: undefined, dateOfBirth: "2000-01-01" });
  expect((await t.run(ctx => ctx.db.get(withoutAge)))?.age).toBe(26);
});
test.each(["2008-11-11", "1926-11-10", "2000-02-30", "", "2030-01-01"])("invalid DOB %s rejected atomically by signup and both editors", async dateOfBirth => {
  const { t, id, update } = await fixture();
  await expect(t.mutation(api.registrations.create, { ...base, email: "bad@example.invalid", dateOfBirth })).rejects.toThrow();
  await expect(t.mutation(api.applicantProfile.updateProfile, { ...update, sessionHash: "owner", dateOfBirth })).rejects.toThrow();
  await expect(t.mutation(api.registrations.updateProfile, { ...update, token: "owner-token", dateOfBirth })).rejects.toThrow();
  expect(await t.run(ctx => ctx.db.query("registrationBirthdays").collect())).toEqual([]);
  expect((await t.run(ctx => ctx.db.get(id)))?.age).toBe(30);
});
test("both owner editors persist DOB; omission preserves it; no cross-owner writes", async () => {
  const { t, id, other, update } = await fixture();
  await t.mutation(api.applicantProfile.updateProfile, { ...update, sessionHash: "owner", dateOfBirth: "2000-01-01" });
  expect((await t.query(api.applicantProfile.getProfile, { sessionHash: "owner" })).registration.dateOfBirth).toBe("2000-01-01");
  await t.mutation(api.registrations.updateProfile, { ...update, token: "owner-token", dateOfBirth: "1999-12-31" });
  await t.mutation(api.applicantProfile.updateProfile, { ...update, sessionHash: "owner" });
  await t.mutation(api.registrations.updateProfile, { ...update, token: "owner-token" });
  expect((await t.query(api.registrations.getByProfileAccessToken, { token: "owner-token" }))?.dateOfBirth).toBe("1999-12-31");
  expect((await t.query(api.registrations.getByProfileAccessToken, { token: "other-token" }))?.dateOfBirth).toBeUndefined();
  expect((await t.run(ctx => ctx.db.get(other)))?.age).toBe(30);
  expect((await t.run(ctx => ctx.db.get(id)))?.age).toBe(26);
});
test("missing, revoked, expired and invalid capabilities cannot read or edit DOB", async () => {
  const { t, id, update } = await fixture();
  await t.run(async ctx => { await ctx.db.insert("applicantSessions", { registrationId: id, sessionHash: "expired", createdAt: 1, expiresAt: 2 }); await ctx.db.insert("applicantSessions", { registrationId: id, sessionHash: "revoked", createdAt: 1, expiresAt: Date.now() + 60000, revokedAt: 2 }); });
  for (const sessionHash of ["", "wrong", "expired", "revoked"]) {
    await expect(t.query(api.applicantProfile.getProfile, { sessionHash })).rejects.toThrow("Unauthorized");
    await expect(t.mutation(api.applicantProfile.updateProfile, { ...update, sessionHash, dateOfBirth: "2000-01-01" })).rejects.toThrow("Unauthorized");
  }
  expect(await t.query(api.registrations.getByProfileAccessToken, { token: "wrong" })).toBeNull();
  await expect(t.mutation(api.registrations.updateProfile, { ...update, token: "wrong", dateOfBirth: "2000-01-01" })).rejects.toThrow();
  await expect(t.mutation(api.registrations.create, { ...base, adminSecret: undefined, dateOfBirth: "2000-01-01" })).rejects.toThrow("Unauthorized");
});
test("admin age rolls over without profile writes; clock changes only on a new local day; private DOB deleted with profile", async () => {
  const { t, id, update } = await fixture();
  await t.mutation(api.applicantProfile.updateProfile, { ...update, sessionHash: "owner", dateOfBirth: "2000-11-11" });
  await t.mutation(internal.birthdays.tick, {});
  const admin = { adminSecret: base.adminSecret };
  expect((await t.query(api.registrations.getAll, admin)).find(r => r._id === id)?.age).toBe(25);
  vi.setSystemTime(new Date("2026-11-11T05:59:59Z"));
  expect(await t.run(async ctx => currentAge(ctx, (await ctx.db.get(id))!))).toBe(25);
  vi.setSystemTime(new Date("2026-11-11T06:00:00Z"));
  await t.mutation(internal.birthdays.tick, {});
  const all = await t.query(api.registrations.getAll, admin);
  expect(all.find(r => r._id === id)?.age).toBe(26);
  expect(JSON.stringify(all)).not.toContain("2000-11-11");
  expect(JSON.stringify(all)).not.toContain("dateOfBirth");
  expect((await t.query(api.registrations.getById, { ...admin, id }))?.age).toBe(26);
  expect((await t.query(api.registrations.getByEmail, { ...admin, email: base.email }))?.age).toBe(26);
  expect((await t.run(ctx => ctx.db.get(id)))?.age).toBe(25);
  expect(await t.run(ctx => ctx.db.query("settings").withIndex("by_key", q => q.eq("key", "birthdayCalendarDay")).unique())).toMatchObject({ value: "2026-11-11" });
  await t.mutation(api.registrations.deleteRegistration, { ...admin, id });
  expect(await t.run(ctx => ctx.db.query("registrationBirthdays").collect())).toEqual([]);
});

test("shared profiles and admin nested records expose current age but never DOB", async () => {
  const { t, id, other, update } = await fixture();
  await t.mutation(api.applicantProfile.updateProfile, { ...update, sessionHash: "owner", dateOfBirth: "2000-11-11" });
  await t.run(async ctx => {
    const matchId = await ctx.db.insert("matches", { maleRegistrationId: other, femaleRegistrationId: id, interestType: "admin_suggested", matchmakerPresentedAt: Date.now(), status: "new", createdAt: Date.now(), updatedAt: Date.now() });
    await ctx.db.insert("profileShares", { matchId, ownerRegistrationId: id, recipientRegistrationId: other, includeImages: false, status: "shared", shareToken: "share", createdAt: Date.now(), updatedAt: Date.now() });
  });
  vi.setSystemTime(new Date("2026-11-11T06:00:00Z"));
  const shared = await t.query(api.profileShares.getByShareToken, { shareToken: "share" });
  expect(shared?.owner?.age).toBe(26);
  const adminShares = await t.query(api.profileShares.getAll, { adminSecret: base.adminSecret });
  expect(adminShares[0].owner?.age).toBe(26);
  const matches = await t.query(api.matches.getAll, { adminSecret: base.adminSecret });
  expect(matches[0].femaleRegistration?.age).toBe(26);
  for (const response of [shared, adminShares, matches]) {
    expect(JSON.stringify(response)).not.toContain("dateOfBirth");
    expect(JSON.stringify(response)).not.toContain("2000-11-11");
  }
});

test("both owner mutations permit unchanged DOB after turning 100, but reject a changed age-100 DOB", async () => {
  const { t, id, update } = await fixture();
  await t.mutation(api.applicantProfile.updateProfile, { ...update, sessionHash: "owner", dateOfBirth: "1926-11-11" });
  vi.setSystemTime(new Date("2026-11-11T06:00:00Z"));
  for (const supplied of [undefined, "1926-11-11"]) {
    await t.mutation(api.applicantProfile.updateProfile, { ...update, sessionHash: "owner", dateOfBirth: supplied, education: "master" });
    expect((await t.run(ctx => ctx.db.get(id)))?.education).toBe("master");
    await t.mutation(api.registrations.updateProfile, { ...update, token: "owner-token", dateOfBirth: supplied, education: "phd" });
    expect((await t.run(ctx => ctx.db.get(id)))?.education).toBe("phd");
  }
  await expect(t.mutation(api.applicantProfile.updateProfile, { ...update, sessionHash: "owner", dateOfBirth: "1926-11-10" })).rejects.toThrow();
  await expect(t.mutation(api.registrations.updateProfile, { ...update, token: "owner-token", dateOfBirth: "1926-11-10" })).rejects.toThrow();
  expect((await t.query(api.applicantProfile.getProfile, { sessionHash: "owner" })).registration).toMatchObject({ age: 100, dateOfBirth: "1926-11-11" });
});

import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const adminSecret = "synthetic-birthday-release";
const dob = "2000-11-11";
beforeEach(() => {
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", adminSecret);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-11T05:59:59Z"));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

function privateDobAbsent(value: unknown) {
  const json = JSON.stringify(value);
  expect(json).not.toContain("dateOfBirth");
  expect(json).not.toContain(dob);
  expect(json).not.toContain("registrationBirthdays");
}
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const common = { age: 25, maritalStatus: "single", education: "College", job: "Synthetic", phone: "5550100", status: "approved" as const, profileCompletionStatus: "completed" as const, photoSharingPermission: "no" as const, createdAt: Date.now() };
    const male = await ctx.db.insert("registrations", { ...common, name: "Synthetic brother", gender: "male", email: "brother@example.invalid" });
    const female = await ctx.db.insert("registrations", { ...common, name: "Synthetic sister", gender: "female", email: "sister@example.invalid" });
    const legacy = await ctx.db.insert("registrations", { ...common, age: 44, name: "Synthetic legacy", gender: "female", email: "legacy@example.invalid" });
    for (const registrationId of [male, female]) await ctx.db.insert("registrationBirthdays", { registrationId, dateOfBirth: dob });
    for (const [registrationId, sessionHash] of [[male, "brother"], [female, "sister"]] as const) await ctx.db.insert("applicantSessions", { registrationId, sessionHash, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
    const eventId = await ctx.db.insert("events", { title: "Synthetic private venue", location: "Synthetic private location", eventCode: "birthday-private", eventMonth: "2026-11", series: "1plus1_match", startsAt: Date.now() + 86400000, endsAt: Date.now() + 90000000, status: "scheduled", maleCapacity: 10, femaleCapacity: 10, createdAt: Date.now(), updatedAt: Date.now() });
    const eventRegistrationId = await ctx.db.insert("eventRegistrations", { eventId, registrationId: male, gender: "male", registrationStatus: "approved", confirmationStatus: "confirmed", attendanceStatus: "not_checked_in", eligibilityStatus: "approved_member", createdAt: Date.now(), updatedAt: Date.now() });
    await ctx.db.insert("eventWaitlistEntries", { eventId, registrationId: female, gender: "female", status: "active", createdAt: Date.now(), updatedAt: Date.now() });
    await ctx.db.insert("eventWaitlistEntries", { eventId, registrationId: legacy, gender: "female", status: "active", createdAt: Date.now(), updatedAt: Date.now() });
    const interestId = await ctx.db.insert("interests", { eventId, fromRegistrationId: male, toRegistrationId: female, source: "admin_entered", status: "new", visibility: "admin_actionable", senderPhotoConsent: "no", createdAt: Date.now(), updatedAt: Date.now() });
    const shareId = await ctx.db.insert("profileShares", { ownerRegistrationId: male, recipientRegistrationId: female, interestId, includeImages: true, status: "shared", shareToken: "synthetic-share", createdAt: Date.now(), updatedAt: Date.now() });
    return { male, female, legacy, eventId, eventRegistrationId, interestId, shareId };
  });
  return { t, ...ids };
}
async function rollover(t: ReturnType<typeof convexTest>) {
  vi.setSystemTime(new Date("2026-11-11T06:00:00Z"));
  await t.mutation(internal.birthdays.tick, {});
}

test("applicant inbound/outbound counterparties roll over without DOB, photos or contact leakage", async () => {
  const { t, male, female } = await fixture();
  for (const age of [25, 26]) {
    if (age === 26) await rollover(t);
    for (const [sessionHash, direction] of [["brother", "outbound"], ["sister", "inbound"]] as const) {
      const dashboard = await t.query(api.applicantInterests.getDashboard, { sessionHash });
      expect(dashboard[direction]).toHaveLength(1);
      expect(dashboard[direction][0].counterparty).toMatchObject({ age, email: null, phone: null, imageUrls: [] });
      privateDobAbsent(dashboard);
    }
  }
  for (const id of [male, female]) expect((await t.run(ctx => ctx.db.get(id)))?.age).toBe(25);
  await expect(t.query(api.applicantInterests.getDashboard, { sessionHash: "invalid" })).rejects.toThrow("Unauthorized");
});

test("admin event rosters, legacy waitlists and all interest projections use current age without DOB", async () => {
  const { t, male, female, legacy, eventId } = await fixture();
  await rollover(t);
  const detail = await t.query(api.events.getDetail, { adminSecret, eventId });
  expect(detail.registrations[0].registration?.age).toBe(26);
  expect(detail.waitlistEntries.find(row => row.registrationId === female)?.registration?.age).toBe(26);
  expect(detail.waitlistEntries.find(row => row.registrationId === legacy)?.registration?.age).toBe(44);
  const bookings = await t.query(api.events.getByRegistration, { adminSecret, registrationId: male });
  expect(bookings[0].registration?.age).toBe(26);
  const all = await t.query(api.interests.getAll, { adminSecret });
  const byRegistration = await t.query(api.interests.getByRegistration, { adminSecret, registrationId: male });
  const page = await t.query(api.interests.workbenchPage, { adminSecret, paginationOpts: { numItems: 10, cursor: null } });
  for (const row of [all[0], byRegistration.outbound[0], page.page[0]]) {
    expect(row.fromRegistration?.age).toBe(26);
    expect(row.toRegistration?.age).toBe(26);
  }
  for (const result of [detail, bookings, all, byRegistration, page]) privateDobAbsent(result);
  await expect(t.query(api.events.getDetail, { eventId })).rejects.toThrow("Unauthorized");
  await expect(t.query(api.interests.getAll, {})).rejects.toThrow("Unauthorized");
});

test("shared bearer/admin profiles retain DOB isolation and photo/revocation gates after rollover", async () => {
  const { t, shareId } = await fixture();
  await rollover(t);
  const shared = await t.query(api.profileShares.getByShareToken, { shareToken: "synthetic-share" });
  expect(shared).toMatchObject({ owner: { age: 26, imageStorageIds: [] }, includeImages: false, images: [] });
  expect(shared?.owner).not.toHaveProperty("email");
  expect(shared?.owner).not.toHaveProperty("phone");
  const adminShares = await t.query(api.profileShares.getAll, { adminSecret });
  expect(adminShares[0].owner?.age).toBe(26);
  expect(adminShares[0].recipient?.age).toBe(26);
  privateDobAbsent(shared); privateDobAbsent(adminShares);
  expect(await t.query(api.profileShares.getByShareToken, { shareToken: "invalid" })).toBeNull();
  await t.run(ctx => ctx.db.patch(shareId, { revokedAt: Date.now() }));
  expect(await t.query(api.profileShares.getByShareToken, { shareToken: "synthetic-share" })).toBeNull();
  expect(await t.query(api.profileShares.getAll, { adminSecret })).toEqual([]);
});

test.each(["closed", "declined", "withdrawn"] as const)("DOB enrichment does not reopen %s interest or linked share", async status => {
  const { t, interestId } = await fixture();
  await rollover(t);
  await t.run(ctx => ctx.db.patch(interestId, { status }));
  expect((await t.query(api.applicantInterests.getDashboard, { sessionHash: "brother" })).outbound).toEqual([]);
  await expect(t.query(api.applicantInterests.getDashboard, { sessionHash: "brother", connectionId: interestId })).rejects.toThrow("Connection unavailable");
  expect(await t.query(api.profileShares.getByShareToken, { shareToken: "synthetic-share" })).toBeNull();
});

test.each(["rejected", "failed background check"])("birthday rollover preserves %s existing email/confirmation safeguards and history", async reason => {
  const { t, male, eventId, eventRegistrationId } = await fixture();
  await rollover(t);
  if (reason === "rejected") await t.mutation(api.registrations.updateStatus, { adminSecret, id: male, status: "rejected" });
  else await t.run(ctx => ctx.db.patch(male, { backgroundCheck: "failed" }));
  const before = await t.run(ctx => ctx.db.get(eventRegistrationId));
  const events = await t.query(api.events.getApplicantEvents, { sessionHash: "brother" });
  privateDobAbsent(events);
  for (const kind of ["approved", "waitlisted", "confirmation_request", "cancelled", "reminder"] as const) await expect(t.mutation(api.events.claimEventRegistrationEmail, { adminSecret, eventRegistrationId, kind, force: true })).rejects.toThrow("unavailable");
  await expect(t.mutation(api.events.confirmParticipation, { sessionHash: "brother", eventRegistrationId })).rejects.toThrow("unavailable");
  await expect(t.mutation(api.events.addRegistration, { adminSecret, eventId, registrationId: male })).rejects.toThrow("unavailable");
  const admin = await t.query(api.events.getDetail, { adminSecret, eventId });
  expect(admin.registrations[0].registration?.age).toBe(26);
  privateDobAbsent(admin);
  expect(await t.run(ctx => ctx.db.get(eventRegistrationId))).toEqual(before);
  expect(await t.run(ctx => ctx.db.query("eventRegistrationEmails").collect())).toEqual([]);
});


test("feature97 drafts stay private and presented/current/historical partners use current age", async () => {
  const { t, male, female, interestId, shareId } = await fixture();
  await t.run(async ctx => { await ctx.db.delete(interestId); await ctx.db.delete(shareId); });
  const matchId = await t.mutation(api.matches.create, { adminSecret, maleRegistrationId: male, femaleRegistrationId: female, adminNotes: "private draft note" });
  await rollover(t);
  for (const sessionHash of ["brother", "sister"]) {
    expect((await t.query(api.matchmakerMatching.getMine, { sessionHash })).matches).toEqual([]);
    const dashboard = await t.query(api.applicantInterests.getDashboard, { sessionHash });
    expect(dashboard.inbound).toEqual([]); expect(dashboard.outbound).toEqual([]); expect(dashboard.privateDocumented).toEqual([]);
    expect(await t.query(api.femaleInterestWorkflow.getDashboard, { sessionHash })).toEqual([]);
    privateDobAbsent(dashboard);
  }
  expect(await t.run(ctx => ctx.db.query("matchmakerNotifications").collect())).toEqual([]);
  await t.run(ctx => ctx.db.insert("profileShares", { ownerRegistrationId: male, recipientRegistrationId: female, matchId, includeImages: true, status: "shared", shareToken: "draft-token", createdAt: Date.now(), updatedAt: Date.now() }));
  expect(await t.query(api.profileShares.getByShareToken, { shareToken: "draft-token" })).toBeNull();
  for (const rows of [await t.query(api.matches.getAll, { adminSecret }), (await t.query(api.matches.workbenchPage, { adminSecret, paginationOpts: { numItems: 10, cursor: null } })).page]) {
    expect(rows[0].maleRegistration?.age).toBe(26); expect(rows[0].femaleRegistration?.age).toBe(26); privateDobAbsent(rows);
  }
  for (const sessionHash of ["brother", "sister"]) await t.mutation(api.matchmakerMatching.setConsent, { sessionHash, optedIn: true });
  await t.mutation(api.matchmakerMatching.present, { adminSecret, matchId });
  for (const sessionHash of ["brother", "sister"]) {
    const mine = await t.query(api.matchmakerMatching.getMine, { sessionHash });
    expect(mine.matches[0].partner?.age).toBe(26);
    expect(mine.matches[0].partner?.images).toEqual([]);
    expect(mine.matches[0].partner).not.toHaveProperty("email"); expect(mine.matches[0].partner).not.toHaveProperty("phone");
    privateDobAbsent(mine); expect(JSON.stringify(mine)).not.toContain("private draft note");
    await t.mutation(api.matchmakerMatching.approve, { sessionHash, matchId });
  }
  await t.mutation(api.matchmakerMatching.releaseContacts, { adminSecret, matchId });
  await t.mutation(api.matches.updateStatus, { adminSecret, id: matchId, status: "closed" });
  const historical = await t.query(api.matchmakerMatching.getMine, { sessionHash: "brother" });
  expect(historical.matches[0]).toMatchObject({ contactShared: true, partner: { age: 26, email: "sister@example.invalid" } });
  privateDobAbsent(historical);
});

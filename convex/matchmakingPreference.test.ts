import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { MATCHMAKING_PREFERENCE_COPY_VERSION } from "./matchmakingPreference";

const base = { name: "Applicant", age: 28, gender: "male" as const, maritalStatus: "single", education: "Degree", job: "Engineer", email: "a@example.com", phone: "5550100" };
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const a = await ctx.db.insert("registrations", { ...base, status: "approved", createdAt: 1, publicApplicantNumber: 1, profileAccessToken: "token-a", photoSharingPermission: "ask_me_first" });
    const b = await ctx.db.insert("registrations", { ...base, email: "b@example.com", status: "approved", createdAt: 1, profileAccessToken: "token-b" });
    await ctx.db.insert("applicantSessions", { registrationId: a, sessionHash: "session-a", createdAt: 1, expiresAt: Date.now() + 100000 });
    await ctx.db.insert("applicantSessions", { registrationId: b, sessionHash: "expired", createdAt: 1, expiresAt: 1 });
    await ctx.db.insert("applicantSessions", { registrationId: b, sessionHash: "revoked", createdAt: 1, expiresAt: Date.now() + 100000, revokedAt: 1 });
    return { a, b };
  });
  return { t, ...ids };
}

describe("explicit matchmaking preference", () => {
  test.each(["events_only", "beyond_events"] as const)("creation records %s and server evidence", async preference => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(api.registrations.create, { ...base, matchmakingPreference: preference });
    const row = await t.run(ctx => ctx.db.get(id));
    expect(row).toMatchObject({ matchmakingPreference: preference, matchmakingPreferenceCopyVersion: MATCHMAKING_PREFERENCE_COPY_VERSION });
    expect(row?.matchmakingPreferenceUpdatedAt).toBeGreaterThan(0);
    expect(await t.run(ctx => ctx.db.query("matchmakingPreferenceHistory").collect())).toMatchObject([{ registrationId: id, previousPreference: null, matchmakingPreference: preference, source: "registration" }]);
  });

  test.each([undefined, null, "", "yes", ["events_only", "beyond_events"]])("rejects missing/invalid/both selection %j on create and update", async invalid => {
    const { t } = await setup();
    // Exercise wire validation with intentionally invalid inputs.
    // @ts-expect-error invalid runtime input
    await expect(t.mutation(api.registrations.create, { ...base, matchmakingPreference: invalid })).rejects.toThrow();
    // @ts-expect-error invalid runtime input
    await expect(t.mutation(api.applicantProfile.updateMatchmakingPreference, { sessionHash: "session-a", matchmakingPreference: invalid, expectedUpdatedAt: null })).rejects.toThrow();
  });

  test("legacy stays unknown until explicit choice; withdrawal/reoptin append history and reject stale writes", async () => {
    const { t, a, b } = await setup();
    expect((await t.query(api.applicantProfile.getProfile, { sessionHash: "session-a" })).registration.matchmakingPreference).toBeNull();
    const opted = await t.mutation(api.applicantProfile.updateMatchmakingPreference, { sessionHash: "session-a", matchmakingPreference: "beyond_events", expectedUpdatedAt: null });
    const withdrawn = await t.mutation(api.applicantProfile.updateMatchmakingPreference, { sessionHash: "session-a", matchmakingPreference: "events_only", expectedUpdatedAt: opted.matchmakingPreferenceUpdatedAt });
    await expect(t.mutation(api.applicantProfile.updateMatchmakingPreference, { sessionHash: "session-a", matchmakingPreference: "beyond_events", expectedUpdatedAt: opted.matchmakingPreferenceUpdatedAt })).rejects.toThrow("Refresh");
    await expect(t.mutation(api.applicantProfile.updateMatchmakingPreference, { sessionHash: "session-a", matchmakingPreference: "beyond_events", expectedUpdatedAt: null })).rejects.toThrow("Refresh");
    const row = await t.run(ctx => ctx.db.get(a));
    expect(row).toMatchObject({ matchmakingPreference: "events_only", phone: base.phone, photoSharingPermission: "ask_me_first", status: "approved" });
    expect((await t.run(ctx => ctx.db.get(b)))?.matchmakingPreference).toBeUndefined();
    await t.mutation(api.applicantProfile.updateMatchmakingPreference, { sessionHash: "session-a", matchmakingPreference: "beyond_events", expectedUpdatedAt: withdrawn.matchmakingPreferenceUpdatedAt });
    expect(await t.run(ctx => ctx.db.query("matchmakingPreferenceHistory").collect())).toHaveLength(3);
  });

  test("credentials bind own profile; forged target and invalid/revoked/expired credentials fail", async () => {
    const { t, b } = await setup();
    for (const sessionHash of ["", "unknown"]) await expect(t.mutation(api.applicantProfile.updateMatchmakingPreference, { sessionHash, matchmakingPreference: "events_only", expectedUpdatedAt: null })).rejects.toThrow("Unauthorized");
    for (const sessionHash of ["unknown", "expired", "revoked"]) await expect(t.mutation(api.applicantProfile.updateMatchmakingPreference, { sessionHash, matchmakingPreference: "events_only", expectedUpdatedAt: null })).rejects.toThrow("Unauthorized");
    // @ts-expect-error callers cannot supply someone else's registration ID
    await expect(t.mutation(api.applicantProfile.updateMatchmakingPreference, { sessionHash: "session-a", registrationId: b, matchmakingPreference: "events_only", expectedUpdatedAt: null })).rejects.toThrow();
    await t.mutation(api.applicantProfile.updateMatchmakingPreference, { sessionHash: "session-a", matchmakingPreference: "events_only", expectedUpdatedAt: null });
    expect((await t.run(ctx => ctx.db.get(b)))?.matchmakingPreference).toBeUndefined();
  });

  test("generic profile saves preserve unknown and withdrawn consent and reject injected consent", async () => {
    const { t, a } = await setup();
    const image = await t.run(ctx => ctx.storage.store(new Blob(["image"], { type: "image/png" })));
    const fields = { ethnicity: "Arab", imageStorageIds: [image], prayerCommitment: "always_five" as const, hijabResponse: "open" as const, spouseRequirement1: "Kind", spouseRequirement2: "Patient", spouseRequirement3: "Honest", shareableBio: "Bio", photoSharingPermission: "ask_me_first" as const };
    await t.mutation(api.registrations.updateProfile, { token: "token-a", ...fields });
    expect((await t.run(ctx => ctx.db.get(a)))?.matchmakingPreference).toBeUndefined();
    await t.mutation(api.applicantProfile.updateMatchmakingPreference, { sessionHash: "session-a", matchmakingPreference: "events_only", expectedUpdatedAt: null });
    await t.mutation(api.applicantProfile.updateProfile, { sessionHash: "session-a", ...fields });
    await t.mutation(api.registrations.updateProfile, { token: "token-a", ...fields });
    // @ts-expect-error consent must not be accepted by generic save
    await expect(t.mutation(api.registrations.updateProfile, { token: "token-a", ...fields, matchmakingPreference: "beyond_events" })).rejects.toThrow();
    expect((await t.run(ctx => ctx.db.get(a)))?.matchmakingPreference).toBe("events_only");
  });

  test.each([undefined, "events_only"] as const)("returning event checkout never overwrites existing preference %s", async preference => {
    const { t, a } = await setup();
    await t.run(async ctx => {
      if (preference) await ctx.db.patch(a, { matchmakingPreference: preference, matchmakingPreferenceUpdatedAt: 10 });
      const now = Date.now();
      await ctx.db.insert("events", { title: "Event", eventCode: "test-event", eventMonth: "2026-12", series: "1plus1_match", location: "Venue", startsAt: now + 86400000, endsAt: now + 90000000, status: "scheduled", maleCapacity: 10, femaleCapacity: 10, createdAt: now, updatedAt: now });
    });
    const id = await t.mutation(api.registrations.create, { ...base, eventCode: "test-event", matchmakingPreference: "beyond_events" });
    expect(id).toBe(a);
    expect((await t.run(ctx => ctx.db.get(a)))?.matchmakingPreference).toBe(preference);
    expect(await t.run(ctx => ctx.db.query("matchmakingPreferenceHistory").collect())).toHaveLength(0);
    expect(await t.run(ctx => ctx.db.query("eventRegistrations").collect())).toHaveLength(1);
  });
});

 test("public login-token issuance cannot forge a victim session", async () => {
  const { t, a } = await setup();
  vi.stubEnv("ADMIN_PASSWORD", "synthetic-server-secret");
  try {
    await expect(t.mutation(api.applicantAuth.createLoginToken, { email: base.email, tokenHash: "attacker-token", adminSecret: "wrong" })).rejects.toThrow("Unauthorized");
    expect(await t.mutation(api.applicantAuth.claimLoginToken, { tokenHash: "attacker-token", sessionHash: "attacker-session" })).toBeNull();
    // Existing exposed profile tokens must not authorize the new session-only preference endpoint.
    await t.mutation(api.registrations.setProfileAccessToken, { id: a, token: "attacker-profile-token" });
    await expect(t.mutation(api.applicantProfile.updateMatchmakingPreference, { sessionHash: "attacker-profile-token", matchmakingPreference: "beyond_events", expectedUpdatedAt: null })).rejects.toThrow("Unauthorized");
    await t.mutation(api.applicantAuth.createLoginToken, { email: base.email, tokenHash: "valid-email-token", adminSecret: "synthetic-server-secret" });
    expect(await t.mutation(api.applicantAuth.claimLoginToken, { tokenHash: "valid-email-token", sessionHash: "valid-session" })).not.toBeNull();
    await t.mutation(api.applicantProfile.updateMatchmakingPreference, { sessionHash: "valid-session", matchmakingPreference: "events_only", expectedUpdatedAt: null });
  } finally { vi.unstubAllEnvs(); }
 });

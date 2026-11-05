import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { changeMatchmakingPreference } from "./matchmakingPreference";

afterEach(() => vi.unstubAllEnvs());

type Preference = "events_only" | "beyond_events" | undefined;
async function fixture(preference: Preference) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const now = Date.now();
    const base = { age: 30, maritalStatus: "single", education: "College", job: "Engineer", phone: "5550100", status: "approved" as const, profileCompletionStatus: "completed" as const, createdAt: now, matchmakingPreference: preference, photoSharingPermission: "ask_me_first" as const };
    const male = await ctx.db.insert("registrations", { ...base, name: "Man", gender: "male", email: "man@example.com" });
    const female = await ctx.db.insert("registrations", { ...base, name: "Woman", gender: "female", email: "woman@example.com" });
    const event = await ctx.db.insert("events", { title: "Synthetic event", eventCode: "scope-test", eventMonth: "2026-11", series: "test", location: "Test", startsAt: now, endsAt: now, status: "completed", maleCapacity: 1, femaleCapacity: 1, createdAt: now, updatedAt: now });
    const attendance = await ctx.db.insert("eventAttendees", { eventId: event, registrationId: male, addedAt: now });
    return { male, female, event, attendance };
  });
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "scope-test-secret");
  return { t, ...ids };
}

for (const preference of [undefined, "events_only", "beyond_events"] as const) {
  test("event-labelled interests and conversion remain available: " + String(preference), async () => {
    const { t, male, female, event } = await fixture(preference);
    const interestId = await t.mutation(api.interests.create, { adminSecret: "scope-test-secret", fromRegistrationId: male, toRegistrationId: female, eventId: event, source: "admin_entered" });
    const matchId = await t.mutation(api.interests.convertToMatch, { interestId });
    expect(await t.run(ctx => ctx.db.get(matchId))).toMatchObject({ interestId, initiatedBy: "interest_signal", status: "new" });
    await t.mutation(api.matches.updateStatus, { id: matchId, status: "reviewing" });
    expect((await t.run(ctx => ctx.db.get(matchId)))?.status).toBe("reviewing");
  });
}

test("preference revocation preserves existing match, attendance, photo consent and active pointer", async () => {
  const { t, male, female, attendance } = await fixture("beyond_events");
  const matchId = await t.run(async ctx => {
    const now = Date.now();
    const id = await ctx.db.insert("matches", { maleRegistrationId: male, femaleRegistrationId: female, interestType: "admin_suggested", initiatedBy: "admin_recommendation", status: "contact_shared", createdAt: now, updatedAt: now });
    await ctx.db.patch(male, { activeMatchId: id });
    return id;
  });
  const beforeMatch = await t.run(ctx => ctx.db.get(matchId));
  const beforeAttendance = await t.run(ctx => ctx.db.get(attendance));
  await t.run(async ctx => {
    const person = (await ctx.db.get(male))!;
    await changeMatchmakingPreference(ctx, person, "events_only", null);
  });
  expect(await t.run(ctx => ctx.db.get(matchId))).toEqual(beforeMatch);
  expect(await t.run(ctx => ctx.db.get(attendance))).toEqual(beforeAttendance);
  expect(await t.run(ctx => ctx.db.get(male))).toMatchObject({ matchmakingPreference: "events_only", photoSharingPermission: "ask_me_first", activeMatchId: matchId, status: "approved" });
});

// This is preservation coverage, NOT an authorization assertion for beyond-event use.
// See docs/matchmaking-scope-audit.md: these rows have no provable scope.
for (const initiatedBy of [undefined, "admin_recommendation"] as const) {
  test("ambiguous match is not silently reclassified: " + String(initiatedBy), async () => {
    const { t, male, female } = await fixture("events_only");
    const id = await t.run(ctx => ctx.db.insert("matches", { maleRegistrationId: male, femaleRegistrationId: female, interestType: "admin_suggested", initiatedBy, status: "new", createdAt: Date.now(), updatedAt: Date.now() }));
    await t.mutation(api.matches.updateStatus, { id, status: "reviewing" });
    expect((await t.run(ctx => ctx.db.get(id)))?.status).toBe("reviewing");
  });
}

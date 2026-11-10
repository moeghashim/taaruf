import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
async function fixture() {
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "synthetic-secret");
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const now = Date.now();
    const event = { title: "Older matching event", eventCode: "old", eventMonth: "2020-01", series: "1plus1_match", location: "Test", startsAt: 1000, endsAt: 2000, interestSubmissionClosesAt: 3000, status: "completed" as const, maleCapacity: 60, femaleCapacity: 60, createdAt: now, updatedAt: now };
    const older = await ctx.db.insert("events", event);
    const newer = await ctx.db.insert("events", { ...event, title: "Newer event", eventCode: "new", startsAt: now - 1000, endsAt: now });
    const people = [];
    for (let i = 0; i < 3; i++) {
      const gender = i === 0 ? "male" as const : "female" as const;
      const id = await ctx.db.insert("registrations", { name: "Person " + i, publicApplicantNumber: i + 1, age: 30, gender, maritalStatus: "single", education: "College", job: "Engineer", email: i + "@example.test", phone: "555", status: "approved", paymentStatus: "paid", profileCompletionStatus: "completed", createdAt: now });
      people.push(id);
      await ctx.db.insert("applicantSessions", { registrationId: id, sessionHash: "session" + i, createdAt: now, expiresAt: now + 20 * 365 * 86400000 });
      for (const eventId of [older, newer]) await ctx.db.insert("eventRegistrations", { eventId, registrationId: id, gender, registrationStatus: "approved", attendanceStatus: "attended", confirmationStatus: "confirmed", eligibilityStatus: "approved_member", createdAt: now, updatedAt: now });
    }
    return { older, newer, people };
  });
  const toggle = (eventId: typeof ids.older, enabled: boolean) => t.mutation(api.events.setInterestSubmissionsEnabled, { adminSecret: "synthetic-secret", eventId, enabled });
  const dashboard = () => t.query(api.applicantInterests.getDashboard, { sessionHash: "session0" });
  const submit = (applicantNumber = 2) => t.mutation(api.applicantInterests.submitInterestNumber, { sessionHash: "session0", applicantNumber, applicantName: "Person" });
  return { t, ...ids, toggle, dashboard, submit };
}

test("unset is off; selected older event persists beyond all dates and newer events", async () => {
  const { t, older, toggle, dashboard, submit } = await fixture();
  expect((await dashboard()).canSubmitInterest).toBe(false);
  await expect(submit()).rejects.toThrow("closed");
  await toggle(older, true);
  vi.useFakeTimers(); vi.setSystemTime(Date.now() + 365 * 86400000);
  expect((await t.query(api.events.getDetail, { eventId: older })).interestSubmissionsEnabled).toBe(true);
  expect((await dashboard()).interestSubmissionEventId).toBe(older);
  const interest = await submit();
  expect((await t.run(ctx => ctx.db.get(interest.interestId)))?.eventId).toBe(older);
  expect((await t.query(api.events.getApplicantEvents, { sessionHash: "session0" })).canSubmitInterest).toBe(true);
});

test("explicit off blocks new writes but preserves interests, flows and response history", async () => {
  const { t, older, toggle, dashboard, submit, people } = await fixture();
  await toggle(older, true);
  const first = await submit();
  const snapshot = await t.run(async ctx => ({ interest: await ctx.db.get(first.interestId), flows: await ctx.db.query("interestFlows").collect(), history: await ctx.db.query("interestFlowEvents").collect() }));
  await toggle(older, false);
  expect((await dashboard()).canSubmitInterest).toBe(false);
  expect((await dashboard()).outbound).toHaveLength(1);
  await expect(submit(3)).rejects.toThrow("closed");
  await expect(t.mutation(api.interests.create, { adminSecret: "synthetic-secret", fromRegistrationId: people[0], toRegistrationId: people[2], eventId: older, source: "admin_entered" })).rejects.toThrow("closed");
  expect(await t.run(async ctx => ({ interest: await ctx.db.get(first.interestId), flows: await ctx.db.query("interestFlows").collect(), history: await ctx.db.query("interestFlowEvents").collect() }))).toEqual(snapshot);
  await t.mutation(api.applicantInterests.withdrawOutbound, { sessionHash: "session0", interestId: first.interestId });
  await toggle(older, true);
  expect((await dashboard()).interestSubmissions).toHaveLength(1);
});

test("single active event requires explicit off; concurrent enables cannot both succeed", async () => {
  const { t, older, newer, toggle } = await fixture();
  const race = await Promise.allSettled([toggle(older, true), toggle(newer, true)]);
  expect(race.filter(r => r.status === "fulfilled")).toHaveLength(1);
  const active = await t.run(ctx => ctx.db.query("events").withIndex("by_interestSubmissionsEnabled", q => q.eq("interestSubmissionsEnabled", true)).unique());
  const other = active!._id === older ? newer : older;
  await expect(toggle(other, true)).rejects.toThrow("Turn off interest submissions");
  await expect(t.mutation(api.events.deleteEvent, { eventId: active!._id })).rejects.toThrow("Turn off");
  await toggle(active!._id, false);
  await toggle(other, true);
  expect((await t.query(api.events.getDetail, { eventId: other })).interestSubmissionsEnabled).toBe(true);
});

test("toggle rejects unauthorized callers and unsupported series without writes", async () => {
  const { t, older, toggle } = await fixture();
  for (const adminSecret of ["", "forged"]) await expect(t.mutation(api.events.setInterestSubmissionsEnabled, { eventId: older, enabled: true, adminSecret })).rejects.toThrow("Unauthorized");
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "");
  await expect(toggle(older, true)).rejects.toThrow("Unauthorized");
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "synthetic-secret");
  await t.run(ctx => ctx.db.patch(older, { series: "real_talk" }));
  await expect(toggle(older, true)).rejects.toThrow("Only matching events");
  expect((await t.run(ctx => ctx.db.get(older)))?.interestSubmissionsEnabled).toBeUndefined();
});

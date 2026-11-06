import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

afterEach(() => vi.unstubAllEnvs());
async function fixture() {
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "selection-secret");
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const now = Date.now();
    const fields = { title: "Selected", eventCode: "selected", eventMonth: "2026-11", series: "1plus1_match", location: "Test", startsAt: now - 2000, endsAt: now - 1000, status: "completed" as const, maleCapacity: 60, femaleCapacity: 60, createdAt: now, updatedAt: now };
    const event = await ctx.db.insert("events", fields);
    const other = await ctx.db.insert("events", { ...fields, eventCode: "other", title: "Other", startsAt: now + 10000, endsAt: now + 20000, status: "scheduled" });
    const person = { name: "Sender", age: 30, gender: "male" as const, maritalStatus: "single" as const, education: "College", job: "Engineer", email: "sender@test.com", phone: "555", status: "approved" as const, paymentStatus: "paid" as const, profileCompletionStatus: "completed" as const, createdAt: now };
    const sender = await ctx.db.insert("registrations", { ...person, publicApplicantNumber: 1 });
    const recipient = await ctx.db.insert("registrations", { ...person, name: "Recipient", gender: "female", publicApplicantNumber: 2 });
    await ctx.db.insert("applicantSessions", { registrationId: sender, sessionHash: "selection-session", expiresAt: now + 86400000, createdAt: now });
    const roster = { registrationId: sender, gender: "male" as const, registrationStatus: "approved" as const, confirmationStatus: "confirmed" as const, attendanceStatus: "attended" as const, eligibilityStatus: "approved_member" as const, createdAt: now, updatedAt: now };
    const row = await ctx.db.insert("eventRegistrations", { ...roster, eventId: event });
    const otherRow = await ctx.db.insert("eventRegistrations", { ...roster, eventId: other });
    return { event, other, sender, recipient, row, otherRow };
  });
  const toggle = (eventId = ids.event, enabled = true, actor = " Admin ") => t.mutation(api.events.setInterestSubmissionsEnabled, { eventId, enabled, actor, adminSecret: "selection-secret" });
  const dashboard = () => t.query(api.applicantInterests.getDashboard, { sessionHash: "selection-session" });
  const submit = (expectedEventId = ids.event) => t.mutation(api.applicantInterests.submitInterestNumber, { expectedEventId, sessionHash: "selection-session", applicantNumber: 2, applicantName: "Recipient" });
  const audit = () => t.run(ctx => ctx.db.query("interestSubmissionToggleAudit").collect());
  return { t, ...ids, toggle, dashboard, submit, audit };
}

test("legacy absent and explicit OFF never auto-select; no backfill on reads", async () => {
  const f = await fixture();
  for (const enabled of [undefined, false]) {
    await f.t.run(ctx => ctx.db.patch(f.event, { interestSubmissionsEnabled: enabled }));
    expect(await f.dashboard()).toMatchObject({ canSubmitInterest: false, interestSubmissionEventId: null });
    await expect(f.submit()).rejects.toThrow("unavailable");
    expect((await f.t.run(ctx => ctx.db.get(f.event)))?.interestSubmissionsEnabled).toBe(enabled);
  }
  expect(await f.audit()).toEqual([]);
});

test.each(["future", "expired", "current"])("explicit ON is date/window invariant: %s", async timing => {
  const f = await fixture();
  const offset = timing === "future" ? 365 * 86400000 : timing === "expired" ? -365 * 86400000 : -1000;
  const now = Date.now();
  await f.t.run(ctx => ctx.db.patch(f.event, { startsAt: now + offset, endsAt: now + offset + 500, interestSubmissionClosesAt: now - 100, registrationOpensAt: now + 100000, registrationClosesAt: now - 100000 }));
  await f.toggle();
  expect(await f.dashboard()).toMatchObject({ canSubmitInterest: true, interestSubmissionEventId: f.event });
  await expect(f.submit()).resolves.toHaveProperty("interestId");
});

test("changing dates and close windows cannot replace or close ON", async () => {
  const f = await fixture(); await f.toggle();
  await f.t.mutation(api.events.update, { adminSecret: "selection-secret", eventId: f.event, startsAt: 1000, endsAt: 2000, interestSubmissionClosesAt: 3000 });
  expect(await f.dashboard()).toMatchObject({ canSubmitInterest: true, interestSubmissionEventId: f.event });
  await expect(f.toggle(f.other)).rejects.toThrow("Only one event");
  expect(await f.audit()).toHaveLength(1);
});

const missingConditions: Partial<Doc<"eventRegistrations">>[] = [
  { registrationStatus: "pending" }, { registrationStatus: "rejected" }, { registrationStatus: "withdrawn" }, { registrationStatus: "waitlisted" },
  { confirmationStatus: "not_confirmed" }, { attendanceStatus: "not_checked_in" }, { attendanceStatus: "no_show" },
];
test.each(missingConditions)("each same-event condition is required: %j", async patch => {
  const f = await fixture(); await f.toggle();
  await f.t.run(ctx => ctx.db.patch(f.row, patch));
  expect(await f.dashboard()).toMatchObject({ canSubmitInterest: false, interestSubmissionEventId: null });
  await expect(f.submit()).rejects.toThrow("approved, confirmed, and checked in");
  expect(await f.t.run(ctx => ctx.db.query("interests").collect())).toEqual([]);
});

test("other-event eligibility and legacy attendance cannot substitute for missing selected roster", async () => {
  const f = await fixture(); await f.toggle();
  await f.t.run(async ctx => { await ctx.db.delete(f.row); await ctx.db.insert("eventAttendees", { eventId: f.event, registrationId: f.sender, addedAt: Date.now() }); });
  expect((await f.dashboard()).canSubmitInterest).toBe(false);
  await expect(f.submit()).rejects.toThrow("unavailable");
});

test.each(["pending", "approved"] as const)("global %s sender allowed, recipient needs no roster", async status => {
  const f = await fixture(); await f.toggle();
  await f.t.run(ctx => ctx.db.patch(f.sender, { status }));
  expect((await f.dashboard()).canSubmitInterest).toBe(true);
  const result = await f.submit();
  expect(await f.t.run(ctx => ctx.db.get(result.interestId))).toMatchObject({ eventId: f.event, toRegistrationId: f.recipient });
});

test("global rejected and incomplete profile remain blocked", async () => {
  const f = await fixture(); await f.toggle();
  await f.t.run(ctx => ctx.db.patch(f.sender, { status: "rejected" }));
  expect((await f.dashboard()).canSubmitInterest).toBe(false);
  await expect(f.submit()).rejects.toThrow("pending or approved");
  await f.t.run(ctx => ctx.db.patch(f.sender, { status: "approved", profileCompletionStatus: "not_started" }));
  expect((await f.dashboard()).canSubmitInterest).toBe(false);
  await expect(f.submit()).rejects.toThrow("complete");
});

test("toggle authorization, actor validation, idempotency and exact audit", async () => {
  const f = await fixture();
  await expect(f.t.mutation(api.events.setInterestSubmissionsEnabled, { adminSecret: "wrong", eventId: f.event, enabled: true, actor: "Admin" })).rejects.toThrow("Unauthorized");
  await expect(f.toggle(f.event, true, " ")).rejects.toThrow("actor");
  await f.toggle(f.event, false);
  expect(await f.audit()).toEqual([]);
  await f.toggle(); await f.toggle();
  expect(await f.audit()).toHaveLength(1);
  await f.toggle(f.event, false, "Second"); await f.toggle(f.event, false);
  const audit = await f.audit();
  expect(audit).toHaveLength(2);
  expect(audit[0]).toMatchObject({ eventId: f.event, enabled: true, actor: "Admin", createdAt: expect.any(Number) });
  expect(audit[1]).toMatchObject({ eventId: f.event, enabled: false, actor: "Second" });
  expect(await f.t.run(ctx => ctx.db.get(f.event))).toMatchObject({ interestSubmissionsEnabled: false, interestSubmissionsChangedBy: "Second", interestSubmissionsChangedAt: audit[1].createdAt });
});

test.each(["draft", "cancelled"] as const)("%s requires OFF before lifecycle change and cannot enable", async status => {
  const f = await fixture(); await f.toggle();
  await expect(f.t.mutation(api.events.update, { adminSecret: "selection-secret", eventId: f.event, status })).rejects.toThrow("Turn off");
  expect((await f.dashboard()).canSubmitInterest).toBe(true);
  await f.toggle(f.event, false);
  await f.t.mutation(api.events.update, { adminSecret: "selection-secret", eventId: f.event, status });
  await expect(f.toggle()).rejects.toThrow("scheduled or completed");
  expect(await f.audit()).toHaveLength(2);
});

test.each([{ series: "real_talk" }, { eventCode: "manual-admin" }])("nonmatching event cannot enable: %j", async patch => {
  const f = await fixture(); await f.t.run(ctx => ctx.db.patch(f.event, patch));
  await expect(f.toggle()).rejects.toThrow("matching events");
  expect(await f.audit()).toEqual([]);
});

test("competing ON mutations admit exactly one and audit only the winner", async () => {
  const f = await fixture();
  const results = await Promise.allSettled([f.toggle(), f.toggle(f.other)]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
  const enabled = await f.t.run(ctx => ctx.db.query("events").withIndex("by_interestSubmissionsEnabled", q => q.eq("interestSubmissionsEnabled", true)).collect());
  expect(enabled).toHaveLength(1);
  expect(await f.audit()).toMatchObject([{ eventId: enabled[0]._id, enabled: true }]);
});

test("OFF preserves interest/flow history and stale forms cannot write after switching", async () => {
  const f = await fixture(); await f.toggle();
  const result = await f.submit();
  const before = await f.t.run(async ctx => ({ interests: await ctx.db.query("interests").collect(), flows: await ctx.db.query("interestFlows").collect() }));
  await f.toggle(f.event, false);
  expect(await f.dashboard()).toMatchObject({ canSubmitInterest: false, interestSubmissionEventId: null });
  expect((await f.dashboard()).outbound[0].interestId).toBe(result.interestId);
  await expect(f.submit()).rejects.toThrow("unavailable");
  await f.toggle(f.other);
  expect((await f.dashboard()).interestSubmissionEventId).toBe(f.other);
  await expect(f.submit()).rejects.toThrow("selected event changed");
  expect(await f.t.run(async ctx => ({ interests: await ctx.db.query("interests").collect(), flows: await ctx.db.query("interestFlows").collect() }))).toEqual(before);
  const next = await f.submit(f.other);
  expect(await f.t.run(ctx => ctx.db.get(next.interestId))).toMatchObject({ eventId: f.other });
});

test("wrong expected event and missing expected event fail without writes", async () => {
  const f = await fixture(); await f.toggle();
  await expect(f.submit(f.other)).rejects.toThrow("selected event changed");
  // Runtime validator must reject old clients, not silently infer a newly selected event.
  // @ts-expect-error deliberately omit the required event binding
  await expect(f.t.mutation(api.applicantInterests.submitInterestNumber, {
    sessionHash: "selection-session", applicantNumber: 2, applicantName: "Recipient",
  })).rejects.toThrow();
  expect(await f.t.run(ctx => ctx.db.query("interests").collect())).toEqual([]);
});

test("invalid multiple ON data fails closed", async () => {
  const f = await fixture(); await f.toggle();
  await f.t.run(ctx => ctx.db.patch(f.other, { interestSubmissionsEnabled: true }));
  expect((await f.dashboard()).canSubmitInterest).toBe(false);
  await expect(f.submit()).rejects.toThrow("unavailable");
});


test("narrow eligibility query matches dashboard and never changes session on attendance/OFF refresh", async () => {
  const f = await fixture();
  const sessionBefore = await f.t.run(ctx => ctx.db.query("applicantSessions").collect());
  const refresh = () => f.t.query(api.applicantInterests.getInterestEligibility, { sessionHash: "selection-session" });
  await expect(f.t.query(api.applicantInterests.getInterestEligibility, { sessionHash: "forged" })).rejects.toThrow("Unauthorized");
  expect((await refresh()).canSubmitInterest).toBe(false);
  await f.toggle();
  for (const attendanceStatus of ["not_checked_in", "attended", "no_show", "attended"] as const) {
    await f.t.mutation(api.events.updateAttendanceStatus, { adminSecret: "selection-secret", eventRegistrationId: f.row, attendanceStatus });
    const eligibility = await refresh();
    const dashboard = await f.dashboard();
    expect(eligibility).toEqual({ canSubmitInterest: dashboard.canSubmitInterest, interestSubmissionEventId: dashboard.interestSubmissionEventId, interestSubmissions: dashboard.interestSubmissions, interestSubmissionLimit: 3 });
    expect(eligibility.canSubmitInterest).toBe(attendanceStatus === "attended");
  }
  await f.submit();
  expect((await refresh()).interestSubmissions).toHaveLength(1);
  await f.toggle(f.event, false);
  expect((await refresh()).canSubmitInterest).toBe(false);
  expect(await f.t.run(ctx => ctx.db.query("applicantSessions").collect())).toEqual(sessionBefore);
});

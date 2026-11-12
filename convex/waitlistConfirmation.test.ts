import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { countCapacityUsed } from "./eventCapacity";
import schema from "./schema";
import { modules } from "./test.setup";
const now = 1800000000000;
const adminSecret = "synthetic-confirmation-admin";
beforeEach(() => { vi.stubEnv("ATTENDANCE_ADMIN_SECRET", adminSecret); vi.spyOn(Date, "now").mockReturnValue(now); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
async function fixture(gender: "male" | "female") {
  const t = convexTest(schema, modules);
  const data = await t.run(async ctx => {
    const eventId = await ctx.db.insert("events", { title: "Synthetic", eventCode: "synthetic", eventMonth: "2027-01", series: "test", location: "Test", startsAt: now + 1000000000, endsAt: now + 1000001000, status: "scheduled", maleCapacity: 1, femaleCapacity: 1, createdAt: now, updatedAt: now });
    const rows = [];
    for (const index of [0, 1, 2]) {
      const registrationId = await ctx.db.insert("registrations", { name: `Synthetic ${index}`, email: `${index}@example.invalid`, gender, age: 30, maritalStatus: "single", education: "College", job: "Test", phone: "test", status: "approved", profileCompletionStatus: "completed", createdAt: now });
      rows.push(await ctx.db.insert("eventRegistrations", { registrationId, eventId, gender, registrationStatus: index === 0 ? "pending" : "waitlisted", confirmationStatus: "confirmed", confirmedAt: now, waitlistedAt: now + index, attendanceStatus: "not_checked_in", eligibilityStatus: "approved_member", createdAt: now, updatedAt: now }));
      await ctx.db.insert("applicantSessions", { registrationId, sessionHash: `synthetic-${index}`, createdAt: now, expiresAt: now + 10 * 86400000 });
    }
    return { eventId, rows };
  });
  return { t, ...data };
}
for (const gender of ["male", "female"] as const) {
  test(`${gender} timely requested confirmation preserves queue position and capacity through expiry and promotion`, async () => {
    const { t, eventId, rows } = await fixture(gender);
    await t.mutation(api.events.requestConfirmation, { adminSecret, eventRegistrationId: rows[1] });
    const before = await t.run(ctx => ctx.db.get(rows[1]));
    await expect(t.mutation(api.events.confirmParticipation, { sessionHash: "synthetic-2", eventRegistrationId: rows[1] })).rejects.toThrow("not found");
    vi.spyOn(Date, "now").mockReturnValue(now + 100);
    expect(await t.mutation(api.events.confirmParticipation, { sessionHash: "synthetic-1", eventRegistrationId: rows[1] })).toBe(rows[1]);
    const confirmed = await t.run(ctx => ctx.db.get(rows[1]));
    expect(confirmed).toEqual({ ...before, confirmationStatus: "confirmed", confirmedAt: now + 100, updatedAt: now + 100 });
    expect(await t.run(ctx => countCapacityUsed(ctx, eventId, gender))).toBe(1);
    vi.spyOn(Date, "now").mockReturnValue(now + 86400001);
    expect(await t.mutation(api.events.confirmParticipation, { sessionHash: "synthetic-1", eventRegistrationId: rows[1] })).toBe(rows[1]);
    expect(await t.mutation(internal.events.expireUnconfirmed, {})).toEqual({ cancelled: 0 });
    await t.mutation(api.events.update, { adminSecret, eventId, title: "Still full" });
    expect(await t.run(ctx => ctx.db.get(rows[1]))).toEqual(confirmed);
    await t.mutation(api.events.updateRegistrationStatus, { adminSecret, eventRegistrationId: rows[0], registrationStatus: "withdrawn" });
    expect(await t.run(ctx => ctx.db.get(rows[1]))).toMatchObject({ registrationStatus: "pending", confirmationStatus: "confirmed", confirmedAt: now + 100, waitlistedAt: before!.waitlistedAt });
    expect(await t.run(ctx => ctx.db.get(rows[2]))).toMatchObject({ registrationStatus: "waitlisted" });
  });
  test(`${gender} waitlist confirmation needs a timely request and preserves expired state for cancellation`, async () => {
    const { t, rows } = await fixture(gender);
    await t.run(ctx => ctx.db.patch(rows[1], { confirmationStatus: "not_confirmed", confirmedAt: undefined }));
    const args = { sessionHash: "synthetic-1", eventRegistrationId: rows[1] };
    await expect(t.mutation(api.events.confirmParticipation, args)).rejects.toThrow("cannot be confirmed");
    await t.mutation(api.events.requestConfirmation, { adminSecret, eventRegistrationId: rows[1] });
    vi.spyOn(Date, "now").mockReturnValue(now + 86400001);
    const expired = await t.run(ctx => ctx.db.get(rows[1]));
    await expect(t.mutation(api.events.confirmParticipation, args)).rejects.toThrow("expired");
    expect(await t.run(ctx => ctx.db.get(rows[1]))).toEqual(expired);
    expect(await t.mutation(internal.events.expireUnconfirmed, {})).toEqual({ cancelled: 1 });
    expect(await t.run(ctx => ctx.db.get(rows[1]))).toMatchObject({ registrationStatus: "withdrawn", confirmationStatus: "cancelled" });
  });
}

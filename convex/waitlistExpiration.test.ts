import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
const now = 1800000000000;
const adminSecret = "synthetic-expiry-admin";
beforeEach(() => { vi.stubEnv("ATTENDANCE_ADMIN_SECRET", adminSecret); vi.spyOn(Date, "now").mockReturnValue(now); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
for (const gender of ["male", "female"] as const) {
  for (const trigger of ["release", "scheduled", "full"] as const) test(`${gender} ${trigger} expires unconfirmed queue entries before promotion`, async () => {
    const t = convexTest(schema, modules);
    const fixture = await t.run(async ctx => {
      const eventId = await ctx.db.insert("events", { title: "Synthetic", eventCode: "synthetic", eventMonth: "2027-01", series: "test", location: "Test", startsAt: now + 1000000000, endsAt: now + 1000001000, status: "scheduled", maleCapacity: 1, femaleCapacity: 1, createdAt: now, updatedAt: now });
      const rows = [];
      for (const index of [0, 1, 2]) {
        const registrationId = await ctx.db.insert("registrations", { name: `Synthetic ${index}`, email: `${index}@example.invalid`, gender, age: 30, maritalStatus: "single", education: "College", job: "Test", phone: "test", status: "approved", profileCompletionStatus: "completed", createdAt: now });
        rows.push(await ctx.db.insert("eventRegistrations", { registrationId, eventId, gender, registrationStatus: index === 0 ? "pending" : "waitlisted", confirmationStatus: "confirmed", confirmedAt: now, waitlistedAt: now + index, attendanceStatus: "not_checked_in", eligibilityStatus: "approved_member", createdAt: now, updatedAt: now }));
      }
      return { eventId, rows };
    });
    const profiles = await t.run(ctx => ctx.db.query("registrations").collect());
    await t.mutation(api.events.requestConfirmation, { adminSecret, eventRegistrationId: fixture.rows[1] });
    if (trigger === "scheduled") await t.mutation(api.events.requestConfirmation, { adminSecret, eventRegistrationId: fixture.rows[0] });
    vi.spyOn(Date, "now").mockReturnValue(now + 86400001);
    if (trigger === "release") await t.mutation(api.events.updateRegistrationStatus, { adminSecret, eventRegistrationId: fixture.rows[0], registrationStatus: "withdrawn" });
    else if (trigger === "scheduled") expect(await t.mutation(internal.events.expireUnconfirmed, {})).toEqual({ cancelled: 2 });
    else await t.mutation(api.events.update, { adminSecret, eventId: fixture.eventId, title: "Still full" });
    const [expired, valid] = await t.run(async ctx => Promise.all([ctx.db.get(fixture.rows[1]), ctx.db.get(fixture.rows[2])]));
    expect(expired).toMatchObject({ registrationStatus: "withdrawn", confirmationStatus: "cancelled", cancelledAt: now + 86400001 });
    expect(valid).toMatchObject({ registrationStatus: trigger === "full" ? "waitlisted" : "pending", confirmationStatus: "confirmed", confirmedAt: now });
    expect(await t.run(ctx => ctx.db.query("registrations").collect())).toEqual(profiles);
  });
}

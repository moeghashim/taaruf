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

for (const gender of ["male", "female"] as const) {
  for (const trigger of ["scheduled", "promotion"] as const) test(`${gender} ${trigger} expires reservations beyond 500 historical rows and fills only valid queue entries`, async () => {
    const t = convexTest(schema, modules);
    vi.spyOn(Date, "now").mockReturnValue(now - 10000);
    const history = await t.run(async ctx => {
      const eventId = await ctx.db.insert("events", { title: "Synthetic expiry", eventCode: "synthetic-expiry", eventMonth: "2027-01", series: "test", location: "Test", startsAt: now + 1000000000, endsAt: now + 1000001000, status: "scheduled", maleCapacity: 3, femaleCapacity: 3, createdAt: now - 10000, updatedAt: now - 10000 });
      const historical = [];
      for (let index = 0; index < 501; index++) {
        const registrationId = await ctx.db.insert("registrations", { name: `Historical ${index}`, email: `historical-${index}@example.invalid`, gender, age: 30, maritalStatus: "single", education: "College", job: "Test", phone: "test", status: "approved", createdAt: now - 10000 });
        const rowId = await ctx.db.insert("eventRegistrations", { registrationId, eventId, gender, registrationStatus: "withdrawn", confirmationStatus: "cancelled", attendanceStatus: "not_checked_in", eligibilityStatus: "approved_member", createdAt: now - 10000, updatedAt: now - 10000 });
        historical.push(await ctx.db.get(rowId));
      }
      return { eventId, historical };
    });
    vi.spyOn(Date, "now").mockReturnValue(now);
    const fixture = await t.run(async ctx => {
      const rows = [];
      for (const [index, status] of (["pending", "approved", "waitlisted", "pending", "waitlisted", "waitlisted", "waitlisted"] as const).entries()) {
        const registrationId = await ctx.db.insert("registrations", { name: `Current ${index}`, email: `current-${index}@example.invalid`, gender, age: 30, maritalStatus: "single", education: "College", job: "Test", phone: "test", status: "approved", profileCompletionStatus: "completed", createdAt: now });
        const expired = index < 3;
        rows.push(await ctx.db.insert("eventRegistrations", { registrationId, eventId: history.eventId, gender, registrationStatus: status, confirmationStatus: expired || index === 5 ? "not_confirmed" : "confirmed", confirmedAt: expired || index === 5 ? undefined : now - 1, confirmationRequestedAt: now - 1000, confirmationExpiresAt: index === 5 ? now + 1000 : now - 1, waitlistedAt: now + index, attendanceStatus: "not_checked_in", eligibilityStatus: "approved_member", createdAt: now, updatedAt: now }));
      }
      return rows;
    });
    const profiles = await t.run(ctx => ctx.db.query("registrations").collect());
    const before = await t.run(async ctx => Promise.all(fixture.map(id => ctx.db.get(id))));
    const publicEvent = await t.query(api.events.getPublicByCode, { eventCode: "synthetic-expiry" });
    expect(publicEvent?.[gender === "male" ? "maleAvailable" : "femaleAvailable"]).toBe(2);
    expect(publicEvent?.[gender === "male" ? "maleWaitlisted" : "femaleWaitlisted"]).toBe(false);
    if (trigger === "scheduled") expect(await t.mutation(internal.events.expireUnconfirmed, {})).toEqual({ cancelled: 3 });
    else await t.mutation(api.events.update, { adminSecret, eventId: history.eventId, title: "Promotion check" });
    const after = await t.run(async ctx => Promise.all(fixture.map(id => ctx.db.get(id))));
    for (const index of [0, 1, 2]) expect(after[index]).toEqual({ ...before[index], registrationStatus: "withdrawn", confirmationStatus: "cancelled", cancelledAt: now });
    expect(after[3]).toEqual(before[3]);
    for (const index of [4, 5]) expect(after[index]).toEqual({ ...before[index], registrationStatus: "pending" });
    expect(after[6]).toEqual(before[6]);
    expect(await t.run(async ctx => Promise.all(history.historical.map(row => ctx.db.get(row!._id))))).toEqual(history.historical);
    expect(await t.run(ctx => ctx.db.query("registrations").collect())).toEqual(profiles);
    expect(await t.mutation(internal.events.expireUnconfirmed, {})).toEqual({ cancelled: 0 });
  });
}

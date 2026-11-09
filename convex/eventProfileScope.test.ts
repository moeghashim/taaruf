import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

afterEach(() => vi.unstubAllEnvs());

test("profile notes and approval target the member without accepting an event or bypassing capacity", async () => {
 vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "synthetic-test-secret");
 const t = convexTest(schema, modules);
 const { first, second, roster, eventId } = await t.run(async ctx => {
  const base = { phone: "555-0100", age: 30, gender: "male" as const, maritalStatus: "single", education: "College", job: "Engineer", status: "pending" as const, createdAt: Date.now() };
  const first = await ctx.db.insert("registrations", { ...base, name: "Synthetic One", email: "one@example.invalid" });
  const second = await ctx.db.insert("registrations", { ...base, name: "Synthetic Two", email: "two@example.invalid" });
  const eventId = await ctx.db.insert("events", { title: "Synthetic event", eventCode: "test", eventMonth: "2026-11", series: "1plus1_match", location: "Test", startsAt: Date.now(), endsAt: Date.now()+1000, status: "scheduled", maleCapacity: 1, femaleCapacity: 1, createdAt: Date.now(), updatedAt: Date.now() });
  const row = { eventId, gender: "male" as const, attendanceStatus: "not_checked_in" as const, eligibilityStatus: "approved_member" as const, confirmationStatus: "not_confirmed" as const, createdAt: Date.now(), updatedAt: Date.now() };
  await ctx.db.insert("eventRegistrations", { ...row, registrationId: first, registrationStatus: "approved" });
  const roster = await ctx.db.insert("eventRegistrations", { ...row, registrationId: second, registrationStatus: "waitlisted" });
  return { first, second, roster, eventId };
 });
 await t.mutation(api.registrations.updateAdminNotes, { id: second, adminNotes: "Synthetic private note" });
 await t.mutation(api.registrations.updateStatus, { id: second, status: "approved" });
 expect(await t.query(api.registrations.getById, { id: second })).toMatchObject({ adminNotes: "Synthetic private note", status: "approved" });
 expect(await t.query(api.registrations.getById, { id: first })).toMatchObject({ status: "pending" });
 await expect(t.mutation(api.events.updateRegistrationStatus, { adminSecret: "synthetic-test-secret", eventRegistrationId: roster, registrationStatus: "approved" })).rejects.toThrow("Only Pending registrations may be approved");
 await t.mutation(api.events.updateRegistrationStatus, { adminSecret: "synthetic-test-secret", eventRegistrationId: roster, registrationStatus: "pending" });
 await t.mutation(api.registrations.updateStatus, { id: second, status: "rejected" });
 await t.run(async ctx => {
  expect(await ctx.db.get(roster)).toMatchObject({ eventId, registrationId: second, registrationStatus: "waitlisted", confirmationStatus: "not_confirmed", attendanceStatus: "not_checked_in" });
  expect((await ctx.db.get(first))?.adminNotes).toBeUndefined();
 });
});

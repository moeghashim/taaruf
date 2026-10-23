import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
const input = { title: "Test", eventCode: "test", eventMonth: "2026-11", location: "Test", startsAt: 100, endsAt: 200 };
beforeEach(() => vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "test-admin"));
afterEach(() => vi.unstubAllEnvs());
test("event lifecycle denies anonymous and forged credentials, permits the admin", async () => {
  const t = convexTest(schema, modules);
  // @ts-expect-error Deliberately exercise missing credentials.
  await expect(t.mutation(api.events.create, input)).rejects.toThrow();
  await expect(t.mutation(api.events.create, { ...input, adminSecret: "forged" })).rejects.toThrow("Unauthorized");
  const { eventId } = await t.mutation(api.events.create, { ...input, adminSecret: "test-admin" });
  // @ts-expect-error Deliberately exercise missing credentials.
  await expect(t.mutation(api.events.deleteEvent, { eventId })).rejects.toThrow();
  await expect(t.mutation(api.events.deleteEvent, { eventId, adminSecret: "forged" })).rejects.toThrow("Unauthorized");
  expect(await t.run(ctx => ctx.db.get(eventId))).not.toBeNull();
  await expect(t.mutation(api.events.deleteEvent, { eventId, adminSecret: "test-admin" })).resolves.toBe(eventId);
});
async function seeded(history: number) {
  const t = convexTest(schema, modules);
  const { eventId } = await t.mutation(api.events.create, { ...input, adminSecret: "test-admin" });
  await t.run(async ctx => {
    const registrationId = await ctx.db.insert("registrations", {
      name: "Synthetic", age: 30, gender: "male", maritalStatus: "single", education: "College", job: "Engineer",
      email: "synthetic@example.com", phone: "555", paymentStatus: "paid", status: "approved", createdAt: 1,
    });
    for (let i = 0; i < history; i++) await ctx.db.insert("eventRegistrations", {
      eventId, registrationId, gender: "male", registrationStatus: "withdrawn", confirmationStatus: "cancelled",
      attendanceStatus: "not_checked_in", eligibilityStatus: "approved_member", createdAt: i, updatedAt: i,
    });
    for (const registrationStatus of ["pending", "approved", "waitlisted"] as const) await ctx.db.insert("eventRegistrations", {
      eventId, registrationId, gender: "male", registrationStatus, confirmationStatus: "confirmed",
      attendanceStatus: "not_checked_in", eligibilityStatus: "approved_member", createdAt: 2000, updatedAt: 2000,
    });
  });
  return { t, eventId };
}
test("new queue and exact status counts survive more than 500 historic registrations", async () => {
  const { t, eventId } = await seeded(600);
  const detail = await t.query(api.events.getDetail, { eventId });
  expect(detail.registrations).toHaveLength(603);
  for (const status of ["pending", "approved", "waitlisted"]) expect(detail.registrations.filter(r => r.registrationStatus === status)).toHaveLength(1);
  const [event] = await t.query(api.events.getAll, {});
  expect(event.counts).toMatchObject({ malePending: 1, maleApproved: 1, maleWaitlisted: 1 });
});
test("overflow explicitly refuses incomplete roster and false exact counts", async () => {
  const { t, eventId } = await seeded(1001);
  await expect(t.query(api.events.getDetail, { eventId })).rejects.toThrow("exceeds 1000 rows");
  await expect(t.query(api.events.getAll, {})).rejects.toThrow("exceeds 1000 rows");
});

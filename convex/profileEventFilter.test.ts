import { convexTest } from "convex-test";
import type { FunctionReturnType } from "convex/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { eventMembershipStatuses, filterEventMembers, profilePage } from "../src/lib/profile-event-filter";
const adminSecret = "synthetic-issue67";
beforeEach(() => vi.stubEnv("ATTENDANCE_ADMIN_SECRET", adminSecret));
afterEach(() => vi.unstubAllEnvs());
test("real event query retains every membership status, independent of attendance, and deduplicates before pagination", async () => {
 const t = convexTest(schema, modules);
 const { first, second, people } = await t.run(async ctx => {
  const event = { title: "Synthetic November gathering", eventCode: "first", eventMonth: "2026-11", series: "synthetic", location: "Test", startsAt: 1794686400000, endsAt: 1794690000000, status: "scheduled" as const, maleCapacity: 100, femaleCapacity: 100, createdAt: 1, updatedAt: 1 };
  const first = await ctx.db.insert("events", event);
  const second = await ctx.db.insert("events", { ...event, title: "Synthetic December gathering", eventCode: "second" });
  const people = [];
  const statuses = ["pending", "approved", "waitlisted", "rejected", "withdrawn"] as const;
  for (let i = 0; i < 32; i++) {
   const registrationId = await ctx.db.insert("registrations", { name: "Synthetic " + i, age: 30, maritalStatus: "single", education: "College", job: "Test", phone: "555", status: "approved", gender: i % 2 ? "female" : "male", email: i + "@example.invalid", createdAt: 1 });
   people.push(registrationId);
   const row = { registrationId, gender: "male" as const, registrationStatus: statuses[i % 5], confirmationStatus: "not_confirmed" as const, attendanceStatus: "not_checked_in" as const, eligibilityStatus: "awaiting_background_check" as const, createdAt: 1, updatedAt: 1 };
   if (i < 30) await ctx.db.insert("eventRegistrations", { ...row, eventId: first });
   if (i === 0 || i === 30) await ctx.db.insert("eventRegistrations", { ...row, eventId: second });
   if (i === 0) await ctx.db.insert("eventRegistrations", { ...row, eventId: first });
  }
  return { first, second, people };
 });
 for (const secret of [undefined, "wrong"]) {
  await expect(t.query(api.events.getAll, { adminSecret: secret })).rejects.toThrow("Unauthorized");
  await expect(t.query(api.events.getDetail, { eventId: first, adminSecret: secret })).rejects.toThrow("Unauthorized");
 }
 const profiles = await t.query(api.registrations.getAll, { adminSecret });
 const event = await t.query(api.events.getDetail, { eventId: first, adminSecret });
 const memberships = eventMembershipStatuses(event.registrations);
 const members = filterEventMembers(profiles, memberships);
 expect(members).toHaveLength(30);
 expect(new Set(event.registrations.map(r => r.registrationStatus)).size).toBe(5);
 expect(profilePage(members, 1).rows).toHaveLength(25);
 expect(profilePage(members, 2).rows).toHaveLength(5);
 expect(profilePage(members.slice(0, 1), 2).page).toBe(1);
 expect(filterEventMembers(profiles, eventMembershipStatuses((await t.query(api.events.getDetail, { eventId: second, adminSecret })).registrations)).map(p => p._id)).toEqual([people[0], people[30]]);
 expect(filterEventMembers([...profiles, profiles[0]], null)).toHaveLength(32);
 expect(filterEventMembers(profiles.filter(p => p.gender === "female" && p.name === "Synthetic 1" && p.status === "approved"), memberships)).toHaveLength(1);
 expect(members.some(p => p._id === people[31])).toBe(false);
});

test("101-event catalog includes oldest; 1001 unrelated memberships cannot poison discovery or truncate selection", async () => {
 const t = convexTest(schema, modules);
 const { oldest, overflow } = await t.run(async ctx => {
  const event = { title: "Oldest", eventCode: "oldest", eventMonth: "2026-11", series: "synthetic", location: "Test", startsAt: 1, endsAt: 2, status: "completed" as const, maleCapacity: 100, femaleCapacity: 100, createdAt: 1, updatedAt: 1 };
  const oldest = await ctx.db.insert("events", event);
  let overflow = oldest;
  for (let i = 1; i <= 100; i++) overflow = await ctx.db.insert("events", { ...event, title: "Event " + i, eventCode: String(i), startsAt: i + 1, endsAt: i + 2 });
  const registrationId = await ctx.db.insert("registrations", { name: "Synthetic", age: 30, maritalStatus: "single", education: "College", job: "Test", phone: "555", status: "approved", gender: "male", email: "test@example.invalid", createdAt: 1 });
  const row = { registrationId, gender: "male" as const, registrationStatus: "withdrawn" as const, confirmationStatus: "not_confirmed" as const, attendanceStatus: "not_checked_in" as const, eligibilityStatus: "awaiting_background_check" as const, createdAt: 1, updatedAt: 1 };
  await ctx.db.insert("eventRegistrations", { ...row, eventId: oldest });
  for (let i = 0; i < 1001; i++) await ctx.db.insert("eventRegistrations", { ...row, eventId: overflow });
  return { oldest, overflow };
 });
 const paginationOpts = { numItems: 100, cursor: null };
 for (const secret of [undefined, "wrong"]) {
  await expect(t.query(api.events.profileFilterCatalog, { adminSecret: secret, paginationOpts })).rejects.toThrow("Unauthorized");
  await expect(t.query(api.events.profileFilterMembership, { adminSecret: secret, eventId: oldest, paginationOpts })).rejects.toThrow("Unauthorized");
 }
 const first = await t.query(api.events.profileFilterCatalog, { adminSecret, paginationOpts });
 expect(first.page).toHaveLength(100);
 expect(first.isDone).toBe(false);
 const last = await t.query(api.events.profileFilterCatalog, { adminSecret, paginationOpts: { numItems: 100, cursor: first.continueCursor } });
 expect(last.page).toEqual([{ _id: oldest, title: "Oldest", startsAt: 1 }]);
 expect(last.isDone).toBe(true);
 expect((await t.query(api.events.profileFilterMembership, { adminSecret, eventId: oldest, paginationOpts })).page).toHaveLength(1);
 let cursor: string | null = null;
 const rows = [];
 do {
  const result: FunctionReturnType<typeof api.events.profileFilterMembership> = await t.query(api.events.profileFilterMembership, { adminSecret, eventId: overflow, paginationOpts: { numItems: 100, cursor } });
  rows.push(...result.page);
  if (result.isDone) break;
  cursor = result.continueCursor;
 } while (true);
 expect(rows).toHaveLength(1001);
 expect(Object.keys(rows[0]).sort()).toEqual(["registrationId", "registrationStatus"]);
 expect(eventMembershipStatuses(rows).size).toBe(1);
 expect(await t.query(api.registrations.getAll, { adminSecret })).toHaveLength(1);
});

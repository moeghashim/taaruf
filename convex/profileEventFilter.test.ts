import { convexTest } from "convex-test";
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

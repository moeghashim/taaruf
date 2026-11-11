import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

test("workbench scans every page beyond 1000 and enforces admin auth", async () => {
 vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "workbench-test");
 const t = convexTest(schema, modules);
 try {
 await t.run(async ctx => {
 const base = { age: 30, maritalStatus: "single", education: "College", job: "Engineer", phone: "5550100", status: "approved" as const, createdAt: 1 };
 const male = await ctx.db.insert("registrations", { ...base, name: "M", gender: "male", email: "m@example.com" });
 const female = await ctx.db.insert("registrations", { ...base, name: "F", gender: "female", email: "f@example.com" });
 const event = await ctx.db.insert("events", { title: "Empty then populated", eventCode: "test", eventMonth: "2026-11", series: "test", location: "Test", startsAt: 1, endsAt: 2, status: "completed", maleCapacity: 1, femaleCapacity: 1, createdAt: 1, updatedAt: 1 });
 for (let n = 0; n < 1005; n++) {
 const interest = await ctx.db.insert("interests", { fromRegistrationId: male, toRegistrationId: female, eventId: event, source: "admin_entered", visibility: "admin_actionable", status: "converted_to_match", createdAt: n, updatedAt: n });
 const match = await ctx.db.insert("matches", { maleRegistrationId: male, femaleRegistrationId: female, interestId: interest, interestType: "man_interested", status: "closed", createdAt: n, updatedAt: n });
 await ctx.db.patch(interest, { matchId: match });
 }
 });
 for (const query of [api.matches.workbenchPage, api.interests.workbenchPage]) {
 await expect(t.query(query, { paginationOpts: { cursor: null, numItems: 100 } })).rejects.toThrow("Unauthorized");
 let cursor: string | null = null; const ids = new Set<string>(); let pages = 0;
 for (;;) {
 const result: { page: { _id: string }[]; isDone: boolean; continueCursor: string } = await t.query(query, { adminSecret: "workbench-test", paginationOpts: { cursor, numItems: 500 } });
 expect(result.page.length).toBeLessThanOrEqual(100);
 result.page.forEach(row => ids.add(row._id)); pages++;
 if (result.isDone) break;
 cursor = result.continueCursor;
 }
 expect(ids.size).toBe(1005); expect(pages).toBeGreaterThan(10);
 }
 } finally { vi.unstubAllEnvs(); }
});

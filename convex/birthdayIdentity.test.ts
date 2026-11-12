import { convexTest } from "convex-test";
import { test, expect, vi } from "vitest";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
test("event name fallback uses current age and never overwrites an existing private birthday", async () => {
 vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "fixture"); vi.useFakeTimers();
 try {
  vi.setSystemTime(new Date("2026-11-10T18:00:00Z"));
  const t = convexTest(schema, modules);
  const base = {adminSecret:"fixture", name:"Unique Synthetic", gender:"female" as const, maritalStatus:"single", education:"College",job:"Engineer",email:"first@example.invalid",phone:"5550100",dateOfBirth:"2000-11-11"};
  const id = await t.mutation(api.registrations.create, base);
  await t.run(ctx => ctx.db.insert("events", {title:"Synthetic",eventCode:"synthetic",eventMonth:"2026-11",series:"test",location:"Fixture",startsAt:Date.now()+86400000,endsAt:Date.now()+172800000,status:"scheduled",maleCapacity:10,femaleCapacity:10,createdAt:Date.now(),updatedAt:Date.now()}));
  vi.setSystemTime(new Date("2026-11-11T18:00:00Z"));
  const reused = await t.mutation(api.registrations.create, {...base,email:"different@example.invalid",phone:"5550999",dateOfBirth:"2000-01-01",eventCode:"synthetic"});
  expect(reused).toBe(id);
  const birthdays = await t.run(ctx => ctx.db.query("registrationBirthdays").collect());
  expect(birthdays).toHaveLength(1); expect(birthdays[0].dateOfBirth).toBe("2000-11-11");
 } finally { vi.useRealTimers(); vi.unstubAllEnvs(); }
});

import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

afterEach(() => vi.unstubAllEnvs());
test("existing admin list retains archived profiles and their historical approval decisions", async () => {
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "secret");
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const ids = [];
    for (const status of ["approved", "pending", "rejected"] as const) {
      for (const archivedAt of [undefined, 0, 123]) {
        ids.push(await ctx.db.insert("registrations", {
          name: "Synthetic", gender: "female", age: 30, maritalStatus: "single", education: "College", job: "Engineer",
          email: "synthetic@example.invalid", phone: "123", status, archivedAt, createdAt: 1,
        }));
      }
    }
    return ids;
  });
  const before = await t.run(async ctx => Promise.all(ids.map(id => ctx.db.get(id))));
  const listed = await t.query(api.registrations.getAll, {adminSecret: "secret"});
  expect(listed).toHaveLength(9);
  expect(listed.filter(p => p.archivedAt !== undefined)).toHaveLength(6);
  for (const status of ["approved", "pending", "rejected"]) expect(listed.filter(p => p.status === status)).toHaveLength(3);
  expect(await t.run(async ctx => Promise.all(ids.map(id => ctx.db.get(id))))).toEqual(before);
});

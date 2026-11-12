import { convexTest } from "convex-test";
import { expect, test, vi, afterEach } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { TEST_PAIR } from "./adminPairTestReset";
afterEach(() => vi.unstubAllEnvs());
test("fixed allowlist is exact and immutable by caller input", () => {
  expect(TEST_PAIR).toEqual(["j57fqgmbmh3am42geabkq852zx8g5wxy", "j572w0f7mwazj4ke8snn0k99hn8g508t"]);
});
test("unauthorized preview and reset fail before reading scope", async () => {
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "test-only");
  const t = convexTest(schema, modules);
  await expect(t.query(api.adminPairTestReset.preview, {adminSecret:"wrong"})).rejects.toThrow("Unauthorized");
  await expect(t.mutation(api.adminPairTestReset.reset, {adminSecret:"wrong",expectedFingerprint:"a".repeat(64),operationKey:"synthetic-operation",reason:"Synthetic reset reason",confirmPair:"219-220"})).rejects.toThrow("Unauthorized");
});
test("public numbers alone cannot authorize a different stable pair", async () => {
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "test-only");
  const t = convexTest(schema, modules);
  await t.run(async ctx => {for (const [i,gender] of (["female","male"] as const).entries()) await ctx.db.insert("registrations",{name:"Synthetic",gender,age:30,maritalStatus:"single",education:"College",job:"Test",email:i+"@example.invalid",phone:"555",paymentStatus:"paid",status:"approved",publicApplicantNumber:219+i,createdAt:1});});
  await expect(t.query(api.adminPairTestReset.preview, {adminSecret:"test-only"})).rejects.toThrow("Configured test pair unavailable");
  expect(await t.run(ctx=>ctx.db.query("pairTestResetAudits").collect())).toEqual([]);
});

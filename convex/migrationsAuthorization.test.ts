import { getFunctionName } from "convex/server";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
const adminSecret = "synthetic-migration-service";
beforeEach(() => vi.stubEnv("ATTENDANCE_ADMIN_SECRET", adminSecret));
afterEach(() => vi.unstubAllEnvs());
for (const action of [api.migrations.profileCompletion.backfillProfileCompletionStatuses, api.migrations.profileCompletion.backfillLegacyProfileContent, api.migrations.publicApplicantNumbers.backfillCreationOrderPublicApplicantNumbers]) {
  for (const dryRun of [true, false]) test(`migration ${getFunctionName(action)} requires service authorization, dryRun=${dryRun}`, async () => {
    const t = convexTest(schema, modules);
    for (const secret of [undefined, "wrong"]) await expect(t.action(action, { dryRun, ...(secret ? { adminSecret: secret } : {}) })).rejects.toThrow("Unauthorized");
    expect(await t.run(ctx => ctx.db.query("settings").collect())).toEqual([]);
    expect(await t.action(action, { adminSecret, dryRun: true })).toMatchObject({ dryRun: true });
  });
}
test("number verification requires authorization even for reads", async () => {
  const t = convexTest(schema, modules);
  for (const secret of [undefined, "wrong"]) await expect(t.query(api.migrations.publicApplicantNumbers.verifyPublicApplicantNumbers, { adminSecret: secret })).rejects.toThrow("Unauthorized");
  expect(await t.query(api.migrations.publicApplicantNumbers.verifyPublicApplicantNumbers, { adminSecret })).toMatchObject({ total: 0 });
});

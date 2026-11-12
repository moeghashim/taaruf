// @vitest-environment node
import crypto from "crypto";
import { convexTest } from "convex-test";
import { NextRequest } from "next/server";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import schema from "../../../../../convex/schema";
import { modules } from "../../../../../convex/test.setup";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/convex", () => ({ getConvexClient: () => ({ query }) }));
import { GET } from "./route";
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
test("admin route and actual query preserve explicit consent, missing values, eligibility and IDs without writes", async () => {
  vi.stubEnv("ADMIN_PASSWORD", "synthetic");
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "synthetic-service");
  vi.stubEnv("ADMIN_TOKEN_SALT", "synthetic-salt");
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const ids: Id<"registrations">[] = [];
    for (const gender of ["male", "female"] as const) for (const consent of [true, false, undefined]) {
      const id = await ctx.db.insert("registrations", { name: gender + String(consent), gender, age: 30, maritalStatus: "single", education: "College", job: "Engineer", phone: "555", email: gender + consent + "@example.invalid", status: "approved", profileCompletionStatus: "completed", createdAt: 1, publicApplicantNumber: 901 + ids.length, ...(consent === undefined ? {} : { backgroundMatchmakingOptIn: consent }) });
      ids.push(id);
    }
    return ids;
  });
  const before = await t.run(ctx => ctx.db.query("registrations").collect());
  query.mockImplementation((ref, args) => t.query(ref, args));
  const token = crypto.createHash("sha256").update("syntheticsynthetic-salt").digest("hex");
  const req = (cookie: string) => new NextRequest("https://synthetic.invalid/api/admin/match-candidates", { headers: { cookie: "admin_token=" + cookie } });
  expect((await GET(req("forged"))).status).toBe(401);
  expect(query).not.toHaveBeenCalled();
  await expect(t.query(api.matches.getCandidates, { adminSecret: "forged" })).rejects.toThrow();
  await t.query(api.matches.getCandidates, { adminSecret: "synthetic-service" });
  const response = await GET(req(token));
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  const rows = await response.json();
  expect(rows.map((r: { _id: string }) => r._id)).toEqual(ids);
  expect(rows).toEqual(before.map(({ _id, name, gender, publicApplicantNumber, backgroundMatchmakingOptIn }) => ({ _id, name, gender, publicApplicantNumber, ...(backgroundMatchmakingOptIn === undefined ? {} : { backgroundMatchmakingOptIn }) })));
  expect(await t.run(ctx => ctx.db.query("registrations").collect())).toEqual(before);
  for (const [index, patch] of [{ archivedAt: 1 }, { profileCompletionStatus: "in_progress" as const }, { searchStatus: "paused" as const }, { status: "rejected" as const }].entries()) await t.run(ctx => ctx.db.patch(ids[index], patch));
  expect((await t.query(api.matches.getCandidates, { adminSecret: "synthetic-service" })).map(r => r._id)).toEqual(ids.slice(4));
});

import crypto from "crypto";
import { NextRequest } from "next/server";
import { beforeEach, afterEach, test, expect, vi } from "vitest";
const { mutation } = vi.hoisted(() => ({ mutation: vi.fn() }));
vi.mock("../../../../lib/convex", () => ({ getConvexClient: () => ({ mutation }) }));
import { POST } from "./route";
const token = crypto.createHash("sha256").update("synthetic-password" + "synthetic-salt").digest("hex");
beforeEach(() => { vi.stubEnv("ADMIN_PASSWORD", "synthetic-password"); vi.stubEnv("ADMIN_TOKEN_SALT", "synthetic-salt"); vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "server-only-synthetic"); mutation.mockReset(); mutation.mockResolvedValue({ alreadyReset: false }); });
afterEach(() => vi.unstubAllEnvs());
const valid = { id: "synthetic-id", confirmTest: true, reason: "Synthetic test submission" };
function request(body: unknown = valid, cookie = token, origin = "https://local.invalid") { return new NextRequest("https://local.invalid/api/admin/interest-test-reset", { method: "POST", headers: { cookie: "admin_token=" + cookie, origin }, body: JSON.stringify(body) }); }
test("fails closed without valid admin or same origin", async () => {
 for (const cookie of ["", "bad"]) expect((await POST(request(valid, cookie))).status).toBe(401);
 for (const origin of ["", "https://evil.invalid", "http://local.invalid", "null"]) expect((await POST(request(valid, token, origin))).status).toBe(403);
 expect(mutation).not.toHaveBeenCalled();
});
test.each([null, {}, { ...valid, confirmTest: false }, { ...valid, reason: "short" }, { ...valid, reason: "x".repeat(501) }])("rejects invalid explicit confirmation/reason %#", async body => { expect((await POST(request(body))).status).toBe(400); expect(mutation).not.toHaveBeenCalled(); });
test("uses server credential, not caller credential", async () => { expect((await POST(request({ ...valid, adminSecret: "forged" }))).status).toBe(200); expect(mutation.mock.calls[0][1]).toEqual({ ...valid, adminSecret: "server-only-synthetic" }); });
test("safe conflict feedback and no sensitive backend details", async () => { mutation.mockRejectedValue(new Error("wrapper: Reciprocal interest history requires manual review")); expect(await (await POST(request())).json()).toEqual({ error: "Reciprocal interest history requires manual review" }); mutation.mockRejectedValue(new Error("private-internal-details")); expect(JSON.stringify(await (await POST(request())).json())).not.toContain("private-internal-details"); });

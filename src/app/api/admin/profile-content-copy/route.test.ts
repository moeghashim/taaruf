// @vitest-environment node
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
const client = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), action: vi.fn() }));
vi.mock("@/lib/convex", () => ({ getConvexClient: () => client }));
import { POST } from "./route";
const pair = { sourceId: "syntheticsource123", targetId: "synthetictarget456", sourceNumber: 163, targetNumber: 144 };
function request(payload: unknown, origin: string | null = "https://app.invalid", auth = true) {
 const headers: Record<string, string> = {};
 if (origin) headers.origin = origin;
 if (auth) headers.cookie = "admin_token=" + crypto.createHash("sha256").update("syntheticsalt").digest("hex");
 return new NextRequest("https://app.invalid/api/admin/profile-content-copy", { method: "POST", headers, body: JSON.stringify(payload) });
}
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("ADMIN_PASSWORD", "synthetic"); vi.stubEnv("ADMIN_TOKEN_SALT", "salt"); vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "synthetic-service"); client.query.mockResolvedValue({ fingerprint: "a".repeat(64), changedFields: ["job"] }); client.action.mockResolvedValue({ auditId: "syntheticaudit123", changedFields: ["job"] }); client.mutation.mockResolvedValue({ alreadyRolledBack: false }); });
afterEach(() => vi.unstubAllEnvs());
test("admin session and same origin required for every operation", async () => {
 for (const operation of ["preview", "apply", "rollback"]) {
  expect((await POST(request({ operation, ...pair }, undefined, false))).status).toBe(401);
  for (const origin of [null, "https://evil.invalid", "http://app.invalid"]) expect((await POST(request({ operation, ...pair }, origin))).status).toBe(403);
 }
 for (const f of Object.values(client)) expect(f).not.toHaveBeenCalled();
});
test("dry run uses server credential and never invokes apply", async () => {
 const r = await POST(request({ operation: "preview", ...pair }));
 expect(r.status).toBe(200); expect(r.headers.get("cache-control")).toContain("no-store");
 expect(client.query).toHaveBeenCalledWith(expect.anything(), { ...pair, adminSecret: "synthetic-service" }); expect(client.action).not.toHaveBeenCalled();
});
test("apply binds fingerprint and idempotency key, rollback binds audit", async () => {
 const args = { ...pair, operationKey: "synthetic-copy-1", expectedFingerprint: "a".repeat(64) };
 expect((await POST(request({ operation: "apply", ...args }))).status).toBe(200);
 expect(client.action).toHaveBeenCalledWith(expect.anything(), { ...args, adminSecret: "synthetic-service" });
 expect((await POST(request({ operation: "rollback", auditId: "syntheticaudit123" }))).status).toBe(200);
 expect(client.mutation).toHaveBeenCalledWith(expect.anything(), { auditId: "syntheticaudit123", adminSecret: "synthetic-service" });
});
test("rejects client credentials, content injection and malformed requests", async () => {
 const body = { operation: "preview", ...pair };
 for (const payload of [null, [], {}, { ...body, adminSecret: "injected" }, { ...body, imageStorageIds: [] }, { ...body, email: "synthetic@example.invalid" }, { ...body, sourceNumber: "163" }, { ...body, sourceId: pair.targetId }, { ...body, targetNumber: -1 }, { ...body, sourceId: "x".repeat(5000) }, { operation: "apply", ...pair, operationKey: "bad", expectedFingerprint: "bad" }]) expect((await POST(request(payload))).status).toBe(400);
 for (const f of Object.values(client)) expect(f).not.toHaveBeenCalled();
});
test("backend errors do not expose credentials or profile content", async () => {
 client.query.mockRejectedValueOnce(new Error("private profile and secret contents"));
 const r = await POST(request({ operation: "preview", ...pair })); expect(r.status).toBe(409); expect(await r.text()).not.toContain("private profile");
});

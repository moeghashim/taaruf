import crypto from "crypto";
import { afterEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
const { mutation } = vi.hoisted(() => ({ mutation: vi.fn().mockResolvedValue(null) }));
vi.mock("../src/lib/convex", () => ({ getConvexClient: () => ({ mutation }) }));
import { POST } from "../src/app/api/admin/event-registration/route";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
function request(cookie = "", action = "updateRegistrationStatus") {
  return new NextRequest("http://localhost/api/admin/event-check-in", { method: "POST", headers: { cookie, origin: "http://localhost" }, body: JSON.stringify({ eventRegistrationId: "synthetic", registrationStatus: "approved", action }) });
}
test("cookie bridge fails closed and keeps the secret server-side", async () => {
  vi.stubEnv("ADMIN_PASSWORD", "synthetic-password");
  vi.stubEnv("ADMIN_TOKEN_SALT", "synthetic-salt");
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "synthetic-secret");
  expect((await POST(request())).status).toBe(401);
  expect((await POST(request("admin_token=forged"))).status).toBe(401);
  expect(mutation).not.toHaveBeenCalled();
  const cookie = "admin_token=" + crypto.createHash("sha256").update("synthetic-passwordsynthetic-salt").digest("hex");
  expect((await POST(request(cookie, "invalid"))).status).toBe(400);
  const response = await POST(request(cookie));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ success: true, result: null });
  expect(mutation).toHaveBeenCalledWith(expect.anything(), { adminSecret: "synthetic-secret", eventRegistrationId: "synthetic", registrationStatus: "approved" });
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "");
  expect((await POST(request(cookie))).status).toBe(503);
});
test("force registration bridge rejects unauthenticated and cross-origin requests and forwards explicit confirmation", async () => {
  vi.stubEnv("ADMIN_PASSWORD", "synthetic-password");
  vi.stubEnv("ADMIN_TOKEN_SALT", "synthetic-salt");
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "synthetic-secret");
  const cookie = "admin_token=" + crypto.createHash("sha256").update("synthetic-passwordsynthetic-salt").digest("hex");
  const req = (cookie: string, origin = "http://localhost", extra = {}) => new NextRequest("http://localhost/api/admin/event-registration", {
    method: "POST", headers: { cookie, origin }, body: JSON.stringify({ action: "forceRegisterWaitlisted", eventRegistrationId: "synthetic", confirmCapacityOverride: true, ...extra }),
  });
  expect((await POST(req(""))).status).toBe(401);
  expect((await POST(req("admin_token=forged"))).status).toBe(401);
  expect((await POST(req(cookie, "https://evil.example"))).status).toBe(403);
  expect((await POST(req(cookie, "http://localhost", { adminSecret: "forged" }))).status).toBe(400);
  expect(mutation).not.toHaveBeenCalled();
  expect((await POST(req(cookie))).status).toBe(200);
  expect(mutation).toHaveBeenCalledWith(expect.anything(), { adminSecret: "synthetic-secret", eventRegistrationId: "synthetic", confirmCapacityOverride: true });
});

import crypto from "crypto";
import { afterEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
const { mutation } = vi.hoisted(() => ({ mutation: vi.fn().mockResolvedValue({ enabled: true }) }));
vi.mock("../src/lib/convex", () => ({ getConvexClient: () => ({ mutation }) }));
import { POST } from "../src/app/api/admin/event-interests/route";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
function request(cookie = "", enabled: unknown = true) {
  return new NextRequest("http://localhost/api/admin/event-interests", { method: "POST", headers: { cookie }, body: JSON.stringify({ eventId: "synthetic", enabled }) });
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
  expect(await response.json()).toEqual({ enabled: true });
  expect(mutation).toHaveBeenCalledWith(expect.anything(), { adminSecret: "synthetic-secret", eventId: "synthetic", enabled: true });
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "");
  expect((await POST(request(cookie))).status).toBe(503);
});

test("active-event conflict is actionable and does not leak backend internals", async () => {
  vi.stubEnv("ADMIN_PASSWORD", "synthetic-password"); vi.stubEnv("ADMIN_TOKEN_SALT", "synthetic-salt"); vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "synthetic-secret");
  const cookie = "admin_token=" + crypto.createHash("sha256").update("synthetic-passwordsynthetic-salt").digest("hex");
  mutation.mockRejectedValueOnce(new Error('backend trace: Turn off interest submissions for "Older event" before enabling this event. stack'));
  const response = await POST(request(cookie));
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: 'Turn off interest submissions for "Older event" before enabling this event.' });
});

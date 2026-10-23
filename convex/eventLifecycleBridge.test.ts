import crypto from "crypto";
import { afterEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
const { mutation } = vi.hoisted(() => ({ mutation: vi.fn().mockResolvedValue("synthetic") }));
vi.mock("../src/lib/convex", () => ({ getConvexClient: () => ({ mutation }) }));
import { POST } from "../src/app/api/admin/event-registration/route";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
test.each(["create", "deleteEvent"])("%s requires the admin cookie and injects only the server secret", async action => {
  vi.stubEnv("ADMIN_PASSWORD", "password");
  vi.stubEnv("ADMIN_TOKEN_SALT", "salt");
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "server-secret");
  const request = (cookie: string) => new NextRequest("http://localhost/api/admin/event-registration", {
    method: "POST", headers: { cookie }, body: JSON.stringify({ action, adminSecret: "forged", eventId: "synthetic" }),
  });
  expect((await POST(request(""))).status).toBe(401);
  expect(mutation).not.toHaveBeenCalled();
  const cookie = "admin_token=" + crypto.createHash("sha256").update("passwordsalt").digest("hex");
  const response = await POST(request(cookie));
  expect(response.status).toBe(200);
  expect(mutation).toHaveBeenCalledWith(expect.anything(), { adminSecret: "server-secret", eventId: "synthetic" });
  expect(JSON.stringify(await response.json())).not.toContain("server-secret");
});

test("validator errors cannot echo server credentials", async () => {
  vi.stubEnv("ADMIN_PASSWORD", "password"); vi.stubEnv("ADMIN_TOKEN_SALT", "salt"); vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "server-secret");
  mutation.mockRejectedValueOnce(new Error('ArgumentValidationError Object: {adminSecret: "server-secret"}'));
  const cookie = "admin_token=" + crypto.createHash("sha256").update("passwordsalt").digest("hex");
  const response = await POST(new NextRequest("http://localhost/api/admin/event-registration", {method:"POST",headers:{cookie},body:JSON.stringify({action:"addRegistration"})}));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({error:"Invalid event request"});
});

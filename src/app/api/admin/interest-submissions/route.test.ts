import crypto from "crypto";
import { NextRequest } from "next/server";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "../../../../../convex/_generated/api";
const { mutation } = vi.hoisted(() => ({ mutation: vi.fn() }));
vi.mock("@/lib/convex", () => ({ getConvexClient: () => ({ mutation }) }));
import { POST } from "./route";
const token = crypto.createHash("sha256").update("passwordsalt").digest("hex");
beforeEach(() => { vi.stubEnv("ADMIN_PASSWORD", "password"); vi.stubEnv("ADMIN_TOKEN_SALT", "salt"); vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "service-secret"); mutation.mockReset().mockResolvedValue("event"); });
afterEach(() => vi.unstubAllEnvs());
function request(body: unknown = { eventId: "event", enabled: true }, cookie = token, origin = "https://test.invalid") {
  return new NextRequest("https://test.invalid/api/admin/interest-submissions", { method: "POST", headers: { cookie: "admin_token=" + cookie, origin }, body: JSON.stringify(body) });
}
test("requires shared admin authentication", async () => { expect((await POST(request({}, "forged"))).status).toBe(401); expect(mutation).not.toHaveBeenCalled(); });
test("blocks cross-origin writes", async () => { expect((await POST(request({}, token, "https://evil.invalid"))).status).toBe(403); expect(mutation).not.toHaveBeenCalled(); });
test.each([null, {}, { eventId: "event", enabled: "true" }])("validates input %#", async body => { expect((await POST(request(body))).status).toBe(400); expect(mutation).not.toHaveBeenCalled(); });
test("derives actor and secret server-side", async () => {
  expect((await POST(request({ eventId: "event", enabled: false, actor: "Named admin", adminSecret: "forged" }))).status).toBe(200);
  expect(mutation).toHaveBeenCalledWith(api.events.setInterestSubmissionsEnabled, { eventId: "event", enabled: false, actor: "shared admin", adminSecret: "service-secret" });
});
test("propagates conflict clearly", async () => {
  mutation.mockRejectedValue(new ConvexError('Turn off interest submissions for "Other event" first. Only one event can be ON.'));
  const response = await POST(request()); expect(response.status).toBe(409); expect((await response.json()).error).toContain('"Other event"');
});
test("hides transport errors and secrets", async () => { mutation.mockRejectedValue(new Error("service-secret stack trace")); const response = await POST(request()); expect(await response.text()).not.toContain("service-secret"); });

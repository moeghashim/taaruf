// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), session: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/convex", () => ({ getConvexClient: () => mocks }));
vi.mock("@/lib/applicant-session", () => ({ createToken: () => "A".repeat(43), hashToken: (s: string) => "hash:" + s, getApplicantSessionHash: mocks.session }));
import { POST } from "./route";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "synthetic");
  mocks.query.mockResolvedValue(true);
  mocks.mutation.mockResolvedValueOnce("https://storage.invalid/upload").mockResolvedValue(null);
  mocks.session.mockResolvedValue("session-hash");
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ storageId: "synthetic-storage" }), { status: 200 }));
  vi.stubGlobal("fetch", mocks.fetch);
});
function request(context = "signup", extra: Record<string, string> = {}, bytes = new Uint8Array([255,216,255,1])) {
  return new NextRequest("https://app.invalid/api/photos/upload", { method: "POST", headers: { origin: "https://app.invalid", "content-type": "image/jpeg", "x-upload-context": context, ...extra }, body: bytes });
}
test("signup uploads actual bytes, binds returned ID, and sets httpOnly capability", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ storageId: "synthetic-storage" });
  expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/i);
  expect(response.headers.get("set-cookie")).toMatch(/SameSite=strict/i);
  expect(mocks.fetch.mock.calls[0][1].body).toEqual(Buffer.from([255,216,255,1]));
  expect(mocks.mutation.mock.calls[1][1]).toMatchObject({ storageId: "synthetic-storage", signupCapabilityHash: "hash:" + "A".repeat(43), adminSecret: "synthetic" });
});
test("session and legacy credentials are resolved before any bytes reach storage", async () => {
  await POST(request("profile", { "x-profile-token": "legacy" }));
  expect(mocks.query.mock.calls[0][1]).toMatchObject({ profileToken: "legacy" });
  mocks.query.mockRejectedValueOnce(new Error("Unauthorized"));
  mocks.fetch.mockClear();
  expect((await POST(request("session"))).status).toBe(400);
  expect(mocks.fetch).not.toHaveBeenCalled();
});
test("origin, size, MIME and signature checks prevent storage writes", async () => {
  expect((await POST(request("signup", { origin: "http://app.invalid" }))).status).toBe(403);
  expect((await POST(request("signup", { "content-length": "6000000" }))).status).toBe(413);
  expect((await POST(request("signup", { "content-type": "image/svg+xml" }))).status).toBe(415);
  expect((await POST(request("signup", {}, new Uint8Array([1,2,3])))).status).toBe(415);
  expect(mocks.fetch).not.toHaveBeenCalled();
});

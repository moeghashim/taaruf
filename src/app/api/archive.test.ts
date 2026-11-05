// @vitest-environment node
import crypto from "crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as own } from "./applicant/archive/route";
import { POST as admin } from "./admin/archive/route";
const mocks = vi.hoisted(() => ({ session: vi.fn(), mutation: vi.fn() }));
vi.mock("@/lib/applicant-session", () => ({ getApplicantSessionHash: mocks.session }));
vi.mock("@/lib/convex", () => ({ getConvexClient: () => ({ mutation: mocks.mutation }) }));
const body = { confirm: true, expectedArchivedAt: null };
const token = crypto.createHash("sha256").update("synthetic-passwordtaaruf-admin-salt").digest("hex");
function request(value: unknown = body, headers: Record<string, string> = {}) {
  return new NextRequest("https://example.invalid/api/archive", { method: "POST", headers: { origin: "https://example.invalid", ...headers }, body: JSON.stringify(value) });
}
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("ADMIN_PASSWORD", "synthetic-password"); vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "synthetic-bridge"); vi.stubEnv("ADMIN_TOKEN_SALT", "taaruf-admin-salt"); mocks.session.mockResolvedValue("owner-cookie"); mocks.mutation.mockResolvedValue({ archivedAt: 100 }); });
it("requires the owner cookie and admin cookie respectively", async () => {
  mocks.session.mockResolvedValue(null);
  expect((await own(request())).status).toBe(401);
  expect((await admin(request({ ...body, registrationId: "target", adminSecret: "synthetic-password" }))).status).toBe(401);
  expect(mocks.mutation).not.toHaveBeenCalled();
});
it.each(["https://evil.invalid", "null", ""])('rejects origin %s for both routes', async origin => {
  expect((await own(request(body, { origin }))).status).toBe(403);
  expect((await admin(request({ ...body, registrationId: "target" }, { origin, cookie: "admin_token=" + token }))).status).toBe(403);
  expect(mocks.mutation).not.toHaveBeenCalled();
});
it("ignores forged owner target and session", async () => {
  expect((await own(request({ ...body, registrationId: "victim", sessionHash: "forged", adminSecret: "forged" }))).status).toBe(200);
  expect(mocks.mutation).toHaveBeenCalledWith(expect.anything(), { ...body, sessionHash: "owner-cookie" });
});
it("admin forwards only authorized target, revision and server secret", async () => {
  expect((await admin(request({ ...body, registrationId: "target", adminSecret: "forged" }, { cookie: "admin_token=" + token }))).status).toBe(200);
  expect(mocks.mutation).toHaveBeenCalledWith(expect.anything(), { ...body, registrationId: "target", adminSecret: "synthetic-bridge" });
});
it.each([{}, { confirm: false, expectedArchivedAt: null }, { confirm: true }, { confirm: true, expectedArchivedAt: -1 }, { confirm: true, expectedArchivedAt: "100" }])("rejects missing confirmation/revision %j", async value => {
  expect((await own(request(value))).status).toBe(400); expect(mocks.mutation).not.toHaveBeenCalled();
});
it("passes repeated requests through without inventing a new revision (backend owns idempotency)", async () => {
  expect(await (await own(request())).json()).toEqual({ archivedAt: 100 });
  expect(await (await own(request())).json()).toEqual({ archivedAt: 100 });
  expect(mocks.mutation.mock.calls[0][1]).toEqual(mocks.mutation.mock.calls[1][1]);
});
it("returns conflicts without retrying", async () => {
  mocks.mutation.mockRejectedValue(new Error("Archive revision changed"));
  expect((await own(request())).status).toBe(409); expect(mocks.mutation).toHaveBeenCalledTimes(1);
});

// @vitest-environment node
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";
const { mutation } = vi.hoisted(() => ({ mutation: vi.fn() }));
vi.mock("@/lib/convex", () => ({ getConvexClient: () => ({ mutation }) }));
import { POST } from "./route";
const post = (body: unknown, origin = "https://test.invalid", token = createHash("sha256").update("passwordtaaruf-admin-salt").digest("hex")) => new NextRequest("https://test.invalid/api/admin/matchmaker", { method: "POST", headers: { origin, cookie: "admin_token=" + token }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("ADMIN_PASSWORD", "password"); vi.stubEnv("ADMIN_TOKEN_SALT", "taaruf-admin-salt"); vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "server-secret"); mutation.mockResolvedValue({ alreadyPresented: false }); });
test("rejects missing admin and cross-origin", async () => { expect((await POST(post({ action: "present", matchId: "a" }, "https://test.invalid", "bad"))).status).toBe(401); expect((await POST(post({ action: "present", matchId: "a" }, "https://evil.invalid"))).status).toBe(403); expect(mutation).not.toHaveBeenCalled(); });
for (const body of [null, [], {}, { action: "present", matchId: "a", adminSecret: "forged" }, { action: "notify", matchId: "a" }, { action: "present", matchId: "" }]) test("rejects invalid payload " + JSON.stringify(body), async () => { expect((await POST(post(body))).status).toBe(400); expect(mutation).not.toHaveBeenCalled(); });
for (const action of ["present", "release"]) test("explicit " + action + " uses server authority", async () => { const response = await POST(post({ action, matchId: "a" })); expect(response.status).toBe(200); expect(mutation.mock.calls[0][1]).toEqual({ adminSecret: "server-secret", matchId: "a" }); expect(response.headers.get("cache-control")).toContain("no-store"); });
test("repeat presentation reports duplicate-safe result", async () => { mutation.mockResolvedValue({ alreadyPresented: true }); expect((await (await POST(post({ action: "present", matchId: "a" }))).json()).message).toContain("No duplicate"); });
test("safe errors do not reveal backend profiles", async () => { mutation.mockRejectedValue(new Error("private profile secret")); const response = await POST(post({ action: "present", matchId: "a" })); expect(response.status).toBe(409); expect(JSON.stringify(await response.json())).not.toContain("secret"); });

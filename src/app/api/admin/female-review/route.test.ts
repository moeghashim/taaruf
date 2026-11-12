// @vitest-environment node
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
const { query, mutation } = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn() }));
vi.mock("@/lib/convex", () => ({ getConvexClient: () => ({ query, mutation }) }));
import { POST } from "./route";
const cookie = createHash("sha256").update("passwordsalt").digest("hex");
function request(body: unknown, token = cookie, origin = "https://test.invalid") { return new NextRequest("https://test.invalid/api/admin/female-review", { method: "POST", headers: { origin, cookie: "admin_token=" + token }, body: JSON.stringify(body) }); }
beforeEach(() => { vi.stubEnv("ADMIN_PASSWORD", "password"); vi.stubEnv("ADMIN_TOKEN_SALT", "salt"); vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "server-secret"); query.mockReset().mockResolvedValue([]); mutation.mockReset().mockResolvedValue({}); });
afterEach(() => vi.unstubAllEnvs());
test("rejects unauthenticated and cross-origin requests", async () => { expect((await POST(request({ action: "create", interestId: "id" }, "bad"))).status).toBe(401); expect((await POST(request({ action: "create", interestId: "id" }, cookie, "https://evil.invalid"))).status).toBe(403); expect(mutation).not.toHaveBeenCalled(); });
test("create stores only hash and returns recipient-bound portal URL", async () => { const response = await POST(request({ action: "create", interestId: "id" })); expect(response.status).toBe(200); const { reviewUrl } = await response.json(); const token = new URL(reviewUrl, "https://test.invalid").searchParams.get("reviewToken")!; expect(token).toMatch(/^[a-f0-9]{64}$/); expect(mutation.mock.calls[0][1]).toEqual({ adminSecret: "server-secret", interestId: "id", reviewTokenHash: createHash("sha256").update(token).digest("hex") }); expect(response.headers.get("cache-control")).toContain("no-store"); });
for (const body of [null, [], { action: "create" }, { action: "retry", deliveryId: {} }, { action: "release", interestId: "id", adminSecret: "forged" }]) test("reject malformed " + JSON.stringify(body), async () => { expect((await POST(request(body))).status).toBe(400); expect(mutation).not.toHaveBeenCalled(); });
test("delivery listing is query-only", async () => { expect((await POST(request({ action: "deliveries" }))).status).toBe(200); expect(query).toHaveBeenCalledOnce(); expect(mutation).not.toHaveBeenCalled(); });
test("retry forwards delivery identity, not a new email", async () => { expect((await POST(request({ action: "retry", deliveryId: "delivery" }))).status).toBe(200); expect(mutation.mock.calls[0][1]).toEqual({ adminSecret: "server-secret", deliveryId: "delivery" }); });

test("delivery paging preserves failed/history cursor and server authorization", async () => {
  query.mockResolvedValue({ page: [], isDone: false, continueCursor: "next" });
  const response = await POST(request({ action: "deliveries", view: "history", cursor: "previous" }));
  expect(await response.json()).toEqual({ page: [], isDone: false, continueCursor: "next" });
  expect(query.mock.calls[0][1]).toEqual({ adminSecret: "server-secret", view: "history", paginationOpts: { cursor: "previous", numItems: 50 } });
  expect(mutation).not.toHaveBeenCalled();
});
for (const body of [{ action: "deliveries", cursor: {} }, { action: "deliveries", view: "unknown" }]) test("reject malformed paging " + JSON.stringify(body), async () => {
  expect((await POST(request(body))).status).toBe(400); expect(query).not.toHaveBeenCalled();
});

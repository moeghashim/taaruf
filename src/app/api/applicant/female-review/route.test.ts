import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";
const { mutation, query, session } = vi.hoisted(() => ({ mutation: vi.fn(), query: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/convex", () => ({ getConvexClient: () => ({ mutation, query }) }));
vi.mock("@/lib/applicant-session", () => ({ getApplicantSessionHash: session }));
import { GET, POST } from "./route";
function post(body: unknown, origin = "https://test.invalid") { return new NextRequest("https://test.invalid/api/applicant/female-review", { method: "POST", headers: { origin }, body: JSON.stringify(body) }); }
beforeEach(() => { vi.clearAllMocks(); session.mockResolvedValue("cookie-hash"); mutation.mockResolvedValue({}); query.mockResolvedValue([]); });
test("unauthenticated requests fail before backend access", async () => {
  session.mockResolvedValue(null);
  expect((await GET(new NextRequest("https://test.invalid/api/applicant/female-review"))).status).toBe(401);
  expect((await POST(post({ action: "respond", interestId: "id", decision: "accept" }))).status).toBe(401);
  expect(query).not.toHaveBeenCalled(); expect(mutation).not.toHaveBeenCalled();
});
test("GET is read-only and hashes the token", async () => {
  const token = "a".repeat(64);
  expect((await GET(new NextRequest("https://test.invalid/api/applicant/female-review?interestId=id&reviewToken=" + token))).status).toBe(200);
  expect(query.mock.calls[0][1]).toEqual({ sessionHash: "cookie-hash", interestId: "id", reviewTokenHash: createHash("sha256").update(token).digest("hex") });
  expect(mutation).not.toHaveBeenCalled();
});
test("cross-origin mutation is rejected", async () => { expect((await POST(post({ action: "confirm", interestId: "id", confirmed: true }, "https://evil.invalid"))).status).toBe(403); expect(mutation).not.toHaveBeenCalled(); });
for (const body of [null, [], {}, { action: "respond", interestId: "id", decision: "keep_open" }, { action: "confirm", interestId: "id", confirmed: "true" }, { action: "respond", interestId: "id", decision: "accept", sessionHash: "forged" }, { action: "respond", interestId: "id", decision: "accept", reviewToken: "bad" }]) test("reject invalid payload " + JSON.stringify(body), async () => { expect((await POST(post(body))).status).toBe(400); expect(mutation).not.toHaveBeenCalled(); });
test("explicit sister confirmation uses session cookie", async () => { expect((await POST(post({ action: "confirm", interestId: "id", confirmed: true }))).status).toBe(200); expect(mutation.mock.calls[0][1]).toEqual({ sessionHash: "cookie-hash", interestId: "id", confirmed: true }); });
test("backend errors do not leak private data", async () => { mutation.mockRejectedValue(new Error("secret profile data")); const response = await POST(post({ action: "respond", interestId: "id", decision: "decline" })); expect(response.status).toBe(409); expect(JSON.stringify(await response.json())).not.toContain("secret profile"); });

test("dashboard forwards bounded cursor under cookie identity and remains inert", async () => {
  query.mockResolvedValue({ page: [], isDone: false, continueCursor: "next" });
  const response = await GET(new NextRequest("https://test.invalid/api/applicant/female-review?cursor=previous"));
  expect(await response.json()).toEqual({ page: [], isDone: false, continueCursor: "next" });
  expect(query.mock.calls[0][1]).toEqual({ sessionHash: "cookie-hash", paginationOpts: { cursor: "previous", numItems: 50 } });
  expect(mutation).not.toHaveBeenCalled();
});
test("dashboard rejects empty cursor before backend access", async () => {
  expect((await GET(new NextRequest("https://test.invalid/api/applicant/female-review?cursor="))).status).toBe(400);
  expect(query).not.toHaveBeenCalled();
});

test("origin uses incoming host while preserving protocol and host checks", async () => {
 const body = JSON.stringify({ action: "respond", interestId: "id", decision: "accept" });
 const make = (origin: string) => new NextRequest("http://localhost:3491/api/applicant/female-review", { method: "POST", headers: { host: "127.0.0.1:3491", origin }, body });
 expect((await POST(make("http://127.0.0.1:3491"))).status).toBe(200);
 for (const origin of ["https://127.0.0.1:3491", "ftp://127.0.0.1:3491", "http://evil.invalid", "null"]) expect((await POST(make(origin))).status).toBe(403);
 expect(mutation).toHaveBeenCalledOnce();
});

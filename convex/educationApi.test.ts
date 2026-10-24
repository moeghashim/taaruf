import { beforeEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ session: vi.fn(), query: vi.fn(), mutation: vi.fn() }));
vi.mock("@/lib/applicant-session", () => ({ getApplicantSessionHash: mocks.session }));
vi.mock("@/lib/convex", () => ({ getConvexClient: () => mocks }));
import { GET, POST } from "../src/app/api/applicant/profile/route";
beforeEach(() => { vi.resetAllMocks(); mocks.session.mockResolvedValue("cookie-owner"); mocks.mutation.mockResolvedValue(null); });
function request(body: object) { return new NextRequest("https://synthetic.invalid/api/applicant/profile", { method: "POST", body: JSON.stringify(body) }); }
test("GET returns persisted education and cannot be cached", async () => {
  mocks.query.mockResolvedValue({ registration: { education: "associate" } });
  const response = await GET();
  expect((await response.json()).registration.education).toBe("associate");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(mocks.query.mock.calls[0][1]).toEqual({ sessionHash: "cookie-owner" });
});
test("POST forwards education but uses cookie ownership, never body identity", async () => {
  const response = await POST(request({ education: "trade_school", sessionHash: "attacker", registrationId: "victim" }));
  expect(response.status).toBe(200);
  expect(mocks.mutation.mock.calls[0][1]).toMatchObject({ education: "trade_school", sessionHash: "cookie-owner" });
  expect(mocks.mutation.mock.calls[0][1]).not.toHaveProperty("registrationId");
});
test("omitted education stays omitted for old clients", async () => {
  await POST(request({ ethnicity: "Arab" }));
  expect(mocks.mutation.mock.calls[0][1].education).toBeUndefined();
});
test("GET and POST reject missing authentication before backend access", async () => {
  mocks.session.mockResolvedValue(null);
  expect((await GET()).status).toBe(401);
  expect((await POST(request({ education: "other" }))).status).toBe(401);
  expect(mocks.query).not.toHaveBeenCalled();
  expect(mocks.mutation).not.toHaveBeenCalled();
});

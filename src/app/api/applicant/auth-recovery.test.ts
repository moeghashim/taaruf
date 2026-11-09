// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/convex", () => ({ getConvexClient: () => mocks }));
vi.mock("@/lib/applicant-session", () => ({ getApplicantSessionHash: mocks.session }));
vi.mock("@/lib/event-registration-receipt", () => ({ sendEventReceipt: vi.fn() }));
import { GET as me } from "./me/route";
import { GET as profile, POST as saveProfile } from "./profile/route";
import { GET as events, POST as register } from "./events/route";
import { GET as eligibility } from "./interest-eligibility/route";
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "synthetic"); mocks.session.mockResolvedValue("old-session"); });
afterEach(() => vi.unstubAllEnvs());
for (const [name, handler] of [["me", me], ["profile", profile], ["save profile", saveProfile], ["events", events], ["register", register], ["eligibility", eligibility]] as const) {
  for (const message of ["Unauthorized", "[Request ID: synthetic] Server Error\nUncaught Error: Unauthorized\n    at handler (private backend)", "Uncaught Error: Unauthorized backup unavailable", "private network failure mentioning Unauthorized"]) {
    test(`${name} classifies ${message}`, async () => {
      mocks.query.mockRejectedValue(new Error(message)); mocks.mutation.mockRejectedValue(new Error(message));
      const response = await handler(new NextRequest("https://synthetic.invalid", { method: "POST", body: JSON.stringify({ action: "register", eventId: "event" }) }));
      expect(response.status).toBe(message === "Unauthorized" || message.includes("Error: Unauthorized\n") ? 401 : name === "eligibility" ? 503 : 500);
      expect(await response.text()).not.toMatch(/private|Request ID|handler/);
    });
  }
}
test("ordinary dashboard returns data and touches the authenticated session", async () => {
  const dashboard = { applicant: { name: "Synthetic", status: "approved" }, inbound: [], outbound: [], privateDocumented: [] };
  mocks.query.mockResolvedValueOnce(dashboard).mockResolvedValueOnce([]); mocks.mutation.mockResolvedValue(true);
  const response = await me();
  expect(response.status).toBe(200); expect(await response.json()).toEqual(dashboard);
  expect(mocks.mutation).toHaveBeenCalledWith(expect.anything(), { adminSecret: "synthetic", sessionHash: "old-session" });
});

test("pending dashboard skips protected female review queries", async () => {
  const dashboard = { applicant: { name: "Pending Applicant", status: "pending" }, inbound: [], outbound: [], privateDocumented: [] };
  mocks.query.mockResolvedValueOnce(dashboard).mockRejectedValue(new Error("Unauthorized"));
  mocks.mutation.mockResolvedValue(true);
  const response = await me();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(dashboard);
  expect(mocks.query).toHaveBeenCalledTimes(1);
});

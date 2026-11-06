import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";
const { mutation } = vi.hoisted(() => ({ mutation: vi.fn() }));
vi.mock("@/lib/convex", () => ({ getConvexClient: () => ({ mutation }) }));
vi.mock("@/lib/applicant-session", () => ({ getApplicantSessionHash: async () => "private-hash" }));
vi.mock("@/lib/email", () => ({ sendContactSharedEmail: vi.fn(), sendFinalApprovalRequestedEmail: vi.fn(), sendInboundInterestReceivedEmail: vi.fn() }));
import { POST } from "./route";
beforeEach(() => { mutation.mockReset().mockResolvedValue({ interestId: "interest", private: true }); });
function request(expectedEventId?: string) { return new NextRequest("https://test.invalid/api/applicant/interests", { method: "POST", body: JSON.stringify({ action: "submit_number", applicantNumber: 42, applicantName: "First", expectedEventId }) }); }
test("rejects submissions without the dashboard event", async () => { expect((await POST(request())).status).toBe(400); expect(mutation).not.toHaveBeenCalled(); });
test("forwards the exact displayed event for atomic backend verification", async () => { expect((await POST(request("displayed-event"))).status).toBe(200); expect(mutation.mock.calls[0][1]).toMatchObject({ expectedEventId: "displayed-event", sessionHash: "private-hash" }); });
test("stale event or OFF returns actionable conflict", async () => { mutation.mockRejectedValue(new Error("Interest submissions are unavailable or the selected event changed.")); const response = await POST(request("stale-event")); expect(response.status).toBe(409); expect((await response.json()).error).toContain("availability has changed"); });

import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";
const { mutation } = vi.hoisted(() => ({ mutation: vi.fn() }));
vi.mock("@/lib/convex", () => ({ getConvexClient: () => ({ mutation }) }));
vi.mock("@/lib/applicant-session", () => ({ getApplicantSessionHash: async () => "private-hash" }));
vi.mock("@/lib/email", () => ({ sendContactSharedEmail: vi.fn(), sendFinalApprovalRequestedEmail: vi.fn(), sendInboundInterestReceivedEmail: vi.fn() }));
import { POST } from "./route";
beforeEach(() => { mutation.mockReset().mockResolvedValue({ interestId: "interest", private: true }); });
function request(expectedEventId?: string, photoConsent: unknown = "no") { return new NextRequest("https://test.invalid/api/applicant/interests", { method: "POST", body: JSON.stringify({ action: "submit_number", photoConsent, applicantNumber: 42, applicantName: "First", expectedEventId }) }); }
test("rejects submissions without the dashboard event", async () => { expect((await POST(request())).status).toBe(400); expect(mutation).not.toHaveBeenCalled(); });
test("forwards the exact displayed event for atomic backend verification", async () => { expect((await POST(request("displayed-event"))).status).toBe(200); expect(mutation.mock.calls[0][1]).toMatchObject({ expectedEventId: "displayed-event", sessionHash: "private-hash" }); });
test("stale event or OFF returns actionable conflict", async () => { mutation.mockRejectedValue(new Error("Interest submissions are unavailable or the selected event changed.")); const response = await POST(request("stale-event")); expect(response.status).toBe(409); expect((await response.json()).error).toContain("availability has changed"); });

for (const photoConsent of ["yes", "no"]) test("forwards explicit choice " + photoConsent, async () => {
  expect((await POST(request("displayed-event", photoConsent))).status).toBe(200);
  expect(mutation.mock.calls[0][1]).toMatchObject({ photoConsent, sessionHash: "private-hash" });
});
for (const photoConsent of [null, true, "", "ask_me_first", "YES", 1]) test("rejects malformed photo choice " + JSON.stringify(photoConsent), async () => {
  expect((await POST(request("displayed-event", photoConsent))).status).toBe(400);
  expect(mutation).not.toHaveBeenCalled();
});
test("accepts submission without a new photo choice", async () => {
  const request = new NextRequest("https://test.invalid/api/applicant/interests", { method: "POST", body: JSON.stringify({ action: "submit_number", expectedEventId: "event", applicantNumber: 42, applicantName: "First" }) });
  expect((await POST(request)).status).toBe(200);
  expect(mutation.mock.calls[0][1]).not.toHaveProperty("photoConsent");
});
test("revocation forwards only session-bound owner authorization", async () => {
  const request = new NextRequest("https://test.invalid/api/applicant/interests", { method: "POST", body: JSON.stringify({ action: "revoke_photos", interestId: "interest", sessionHash: "forged", ownerRegistrationId: "forged" }) });
  expect((await POST(request)).status).toBe(200);
  expect(mutation.mock.calls[0][1]).toEqual({ interestId: "interest", sessionHash: "private-hash" });
});

test("authorized interception returns before email and follow-up mutations", async () => {
 mutation.mockResolvedValue({interestId:"existing", private:false, inboundInterestNotification:null, existingInbound:{interestId:"existing",route:"connection"}});
 const response=await POST(request("event"));const body=await response.json();
 expect(body.existingInbound).toEqual({interestId:"existing",route:"connection"});expect(body).not.toHaveProperty("notification");expect(body).not.toHaveProperty("result");expect(mutation).toHaveBeenCalledTimes(1);
 const email=await import("@/lib/email");expect(email.sendInboundInterestReceivedEmail).not.toHaveBeenCalled();
});

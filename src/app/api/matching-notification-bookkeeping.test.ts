// @vitest-environment node
import crypto from "crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getFunctionName } from "convex/server";
import { POST as decline } from "./admin/notify-decline/route";
import { POST as applicant } from "./applicant/interests/route";
const m = vi.hoisted(() => ({ mutation: vi.fn(), query: vi.fn(), send: vi.fn() }));
vi.mock("convex/browser", () => ({ ConvexHttpClient: class { mutation = m.mutation; } }));
vi.mock("@/lib/convex", () => ({ getConvexClient: () => ({ mutation: m.mutation, query: m.query }) }));
vi.mock("@/lib/applicant-session", () => ({ getApplicantSessionHash: async () => "session" }));
vi.mock("@/lib/email", () => ({ sendInterestClosedEmail: m.send, sendInboundInterestReceivedEmail: m.send, sendFinalApprovalRequestedEmail: m.send, sendContactSharedEmail: m.send }));
const cookie = "admin_token=" + crypto.createHash("sha256").update("synthetictaaruf-admin-salt").digest("hex");
const request = (body: object) => new NextRequest("https://example.invalid/api", { method: "POST", headers: { cookie, origin: "https://example.invalid" }, body: JSON.stringify(body) });
const calls = () => m.mutation.mock.calls.map(([ref, args]) => [getFunctionName(ref), args]);
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ADMIN_PASSWORD", "synthetic");vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "bridge");
  vi.stubEnv("ADMIN_TOKEN_SALT", "taaruf-admin-salt");
  vi.stubEnv("CONVEX_URL", "https://example.invalid");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.invalid");
  m.query.mockResolvedValue({ name: "Test", email: "test@example.invalid" });
  m.send.mockResolvedValue({ success: true, id: "provider" });
});
afterEach(() => vi.unstubAllEnvs());
it("releases a suppressed decline claim so retries cannot report false already_sent", async () => {
  let sent = false;
  let archived = true;
  m.mutation.mockImplementation(async (ref) => {
    switch (getFunctionName(ref)) {
      case "interests:claimDeclineNotification": {
        if (sent) return { claimed: false };
        sent = true;
        return { claimed: true, requesterName: "Test", requesterEmail: "test@example.invalid" };
      }
      case "interests:assertNotificationEligible":
        if (archived) throw new Error("Participant is archived");
        return true;
      case "interests:recordDeclineNotificationFailure": sent = false; return;
    }
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await decline(request({ interestId: "interest" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ skipped: "ineligible" });
    expect(sent).toBe(false);
  }
  expect(m.send).not.toHaveBeenCalled();
  expect(calls()).toContainEqual(["interests:recordDeclineNotificationFailure", { adminSecret: "bridge", id: "interest", error: "Participant is archived" }]);
  archived = false;
  expect((await decline(request({ interestId: "interest" }))).status).toBe(200);
  expect(m.send).toHaveBeenCalledTimes(1);
  expect(await (await decline(request({ interestId: "interest" }))).json()).toMatchObject({ skipped: "already_sent" });
});
it.each([
  { action: "submit_number", mutation: "applicantInterests:submitInterestNumber", notification: "inboundInterestNotification", recorder: "applicantInterests:recordInboundInterestNotificationFailure" },
  { action: "final_approval", mutation: "applicantInterests:giveFinalApproval", notification: "finalApprovalNotification", recorder: "applicantInterests:recordFinalApprovalNotificationFailure" },
])("records suppressed $notification before returning ineligible", async ({ action, mutation, notification, recorder }) => {
  m.mutation.mockImplementation(async (ref) => {
    const name = getFunctionName(ref);
    if (name === mutation) return { interestId: "interest", [notification]: { interestId: "interest", name: "Test", email: "test@example.invalid" } };
    if (name === "interests:assertNotificationEligible") throw new Error("Participant is archived");
  });
  const response = await applicant(request({ action, photoConsent: "yes", expectedEventId: "event", applicantNumber: 123, applicantName: "Test", interestId: "interest", approved: true }));
  expect(response.status).toBe(409);
  expect(m.send).not.toHaveBeenCalled();
  expect(calls().at(-1)).toEqual([recorder, { adminSecret: "bridge", interestId: "interest", error: "Participant is archived" }]);
});
it("never revives obsolete contact-email delivery from final approval", async () => {
 m.mutation.mockResolvedValue({ contactSharedNotification: { matchId: "old", recipients: [{ name: "Test", email: "test@example.invalid" }] } });
 expect((await applicant(request({ action: "final_approval", interestId: "interest", approved: true }))).status).toBe(200);
 expect(m.send).not.toHaveBeenCalled();
});
it("releases the claim when recipient revalidation rejects an archived owner", async () => {
 m.mutation.mockResolvedValue({ interestId: "interest", inboundInterestNotification: { interestId: "interest" } });
 m.query.mockRejectedValue(new Error("Participant is archived"));
 expect((await applicant(request({ action: "submit_number", expectedEventId: "event", applicantNumber: 123, applicantName: "Test" }))).status).toBe(409);
 expect(m.send).not.toHaveBeenCalled();
 expect(calls().at(-1)?.[0]).toBe("applicantInterests:recordInboundInterestNotificationFailure");
});

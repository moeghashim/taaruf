// @vitest-environment node
import crypto from "crypto";
import { NextRequest } from "next/server";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
const { mutation, send } = vi.hoisted(() => ({ mutation: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/convex", () => ({ getConvexClient: () => ({mutation}) }));
vi.mock("@/lib/email", () => ({ sendEventRegistrationStatusEmail: send }));
import { POST } from "./route";
beforeEach(() => { vi.stubEnv("ADMIN_PASSWORD", "synthetic");vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "bridge"); vi.stubEnv("ADMIN_TOKEN_SALT", "salt"); mutation.mockReset(); send.mockReset().mockResolvedValue({success: true}); });
afterEach(() => vi.unstubAllEnvs());
function request() {
 const token = crypto.createHash("sha256").update("syntheticsalt").digest("hex");
 return new NextRequest("https://example.invalid/api/admin/event-registration-email", {method: "POST", headers: {origin: "https://example.invalid", cookie: "admin_token=" + token}, body: JSON.stringify({eventRegistrationId: "row", kind: "reminder"})});
}
const claim = {claimed: true, emailId: "email", name: "A", email: "a@example.invalid", eventTitle: "Event", eventStartsAt: 1, eventLocation: "Here", kind: "reminder"};
it("revalidates after token issuance and records archive suppression without sending", async () => {
 mutation.mockResolvedValueOnce(claim).mockResolvedValueOnce("registration").mockRejectedValueOnce(new Error("Participant is archived")).mockResolvedValueOnce(null);
 const response = await POST(request());
 expect(response.status).toBe(409);
 expect(await response.json()).toEqual({success: false, error: "Participant is archived"});
 expect(mutation.mock.calls.map(c => getFunctionName(c[0]))).toEqual(["events:claimEventRegistrationEmail", "applicantAuth:createLoginToken", "events:validateEventRegistrationEmail", "events:recordEventRegistrationEmailFailure"]);
 expect(send).not.toHaveBeenCalled();
 expect(mutation.mock.calls[3][1]).toEqual({adminSecret: "bridge", emailId: "email", error: "Participant is archived"});
});
it("records token issuance failure rather than leaving a stale claim", async () => {
 mutation.mockResolvedValueOnce(claim).mockRejectedValueOnce(new Error("Participant is archived")).mockResolvedValueOnce(null);
 expect((await POST(request())).status).toBe(409);
 expect(getFunctionName(mutation.mock.calls[2][0])).toBe("events:recordEventRegistrationEmailFailure");
 expect(send).not.toHaveBeenCalled();
});
it("still sends active reminders after validation", async () => {
 mutation.mockResolvedValueOnce(claim).mockResolvedValueOnce("registration").mockResolvedValue(null);
 expect((await POST(request())).status).toBe(200);
 expect(send).toHaveBeenCalledOnce();
 expect(getFunctionName(mutation.mock.calls[3][0])).toBe("events:recordEventRegistrationEmailSuccess");
});

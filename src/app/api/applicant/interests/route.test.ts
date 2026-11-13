// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
const { mutation, query } = vi.hoisted(() => ({ mutation: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/convex", () => ({ getConvexClient: () => ({ mutation, query }) }));
vi.mock("@/lib/applicant-session", () => ({ getApplicantSessionHash: async () => "private-hash" }));
vi.mock("@/lib/email", () => ({ sendContactSharedEmail: vi.fn(), sendFinalApprovalRequestedEmail: vi.fn(), sendInboundInterestReceivedEmail: vi.fn() }));
import { POST } from "./route";
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => { vi.clearAllMocks(); query.mockReset(); mutation.mockReset().mockResolvedValue({ interestId: "interest", private: true }); });
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

test("4397 repeated name checks are session-bound, uncached and never hourly limited", async () => {
 mutation.mockResolvedValue({ firstName: "Synthetic" });
 for (let i = 0; i < 30; i++) {
  const response = await POST(new NextRequest("https://test.invalid/api/applicant/interests", { method: "POST", body: JSON.stringify({ action: "lookup_name", expectedEventId: "event", applicantNumber: 42, sessionHash: "forged" }) }));
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ firstName: "Synthetic" });
 }
 expect(mutation).toHaveBeenCalledTimes(30);
 expect(mutation.mock.calls[29][1]).toEqual({ sessionHash: "private-hash", expectedEventId: "event", applicantNumber: 42 });
});

import { sendInboundInterestReceivedEmail } from "@/lib/email";
const saved = {interestId:"saved-own-id", private:false, inboundInterestNotification:{interestId:"saved-own-id"}};
function notificationSetup() {
 vi.stubEnv("ATTENDANCE_ADMIN_SECRET","synthetic-secret");
 vi.stubEnv("NEXT_PUBLIC_APP_URL","https://test.invalid");
 mutation.mockResolvedValue(null).mockResolvedValueOnce(saved);
 query.mockResolvedValue({name:"Synthetic",email:"synthetic@reserved.invalid"});
 vi.mocked(sendInboundInterestReceivedEmail).mockResolvedValue({success:true,id:"provider"});
}
test.each(["recipient", "eligibility"])("share retires saved alias before %s check: receipt succeeds, no mail, immutable audit",async stage=>{
 notificationSetup();
 if(stage==="recipient") query.mockRejectedValue(new Error("Connection unavailable"));
 mutation.mockRejectedValue(new Error("Connection unavailable"));
 const response=await POST(request("event"));
 expect(response.status).toBe(200);
 expect(await response.json()).toMatchObject({success:true,result:{interestId:"saved-own-id",private:false},notification:{sent:false}});
 expect(sendInboundInterestReceivedEmail).not.toHaveBeenCalled();
 expect(mutation).toHaveBeenCalledTimes(stage==="recipient"?2:3);
});
test.each(["provider-return", "provider-throw", "missing-url"])("postcommit %s failure preserves saved receipt",async stage=>{
 notificationSetup();
 if(stage==="provider-return") vi.mocked(sendInboundInterestReceivedEmail).mockResolvedValue({success:false,error:"private provider error"});
 if(stage==="provider-throw") vi.mocked(sendInboundInterestReceivedEmail).mockRejectedValue(new Error("private provider error"));
 if(stage==="missing-url") {vi.stubEnv("NEXT_PUBLIC_APP_URL","");vi.stubEnv("VERCEL_URL","");}
 const response=await POST(request("event"));expect(response.status).toBe(200);
 const body=await response.json();expect(body).toMatchObject({success:true,result:{interestId:"saved-own-id"},notification:{sent:false}});
 expect(JSON.stringify(body)).not.toContain("private provider error");
 if(stage==="missing-url") expect(sendInboundInterestReceivedEmail).not.toHaveBeenCalled();
});
test("authorized ordinary saved submission still notifies exactly once",async()=>{
 notificationSetup();const response=await POST(request("event"));expect(response.status).toBe(200);
 expect(await response.json()).toMatchObject({success:true,notification:{sent:true,providerId:"provider"}});
 expect(sendInboundInterestReceivedEmail).toHaveBeenCalledTimes(1);expect(mutation).toHaveBeenCalledTimes(2);
});
test("genuinely failed submission remains HTTP500 with no notification follow-up",async()=>{
 notificationSetup();mutation.mockReset().mockRejectedValue(new Error("database failure"));
 const response=await POST(request("event"));expect(response.status).toBe(500);
 expect(await response.json()).not.toHaveProperty("result");expect(mutation).toHaveBeenCalledTimes(1);
 expect(query).not.toHaveBeenCalled();expect(sendInboundInterestReceivedEmail).not.toHaveBeenCalled();
});

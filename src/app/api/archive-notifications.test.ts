// @vitest-environment node
import crypto from "crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getFunctionName } from "convex/server";
import { POST } from "./admin/notify-match/route";
import { GET } from "./admin/match-candidates/route";
const m=vi.hoisted(()=>({query:vi.fn(),mutation:vi.fn(),send:vi.fn()}));
vi.mock("convex/browser",()=>({ConvexHttpClient:class{query=m.query;mutation=m.mutation;}}));
vi.mock("@/lib/convex",()=>({getConvexClient:()=>({query:m.query,mutation:m.mutation})}));
vi.mock("@/lib/email",()=>({sendMatchNotificationEmail:m.send}));
const cookie="admin_token="+crypto.createHash("sha256").update("synthetictaaruf-admin-salt").digest("hex");
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("ADMIN_PASSWORD", "synthetic");vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "bridge");vi.stubEnv("ADMIN_TOKEN_SALT","taaruf-admin-salt");vi.stubEnv("CONVEX_URL","https://example.invalid");m.send.mockResolvedValue({success:true});});
it("stops a queued match notification before email delivery when archive won",async()=>{
 m.query.mockImplementation(async ref=>getFunctionName(ref)==="matches:getById"?{_id:"match",maleRegistrationId:"m",femaleRegistrationId:"f"}:{_id:"m",name:"Synthetic",email:"test@example.invalid"});
 m.mutation.mockRejectedValue(new Error("Participant is archived"));
 const r=await POST(new NextRequest("https://example.invalid/api/admin/notify-match",{method:"POST",headers:{cookie, origin:"https://example.invalid"},body:JSON.stringify({matchId:"match"})}));
 expect(r.status).toBe(409);expect(m.send).not.toHaveBeenCalled();expect(m.mutation).toHaveBeenCalledTimes(1);
});
it("candidate endpoint authenticates and returns only minimal selector fields",async()=>{
 expect((await GET(new NextRequest("https://example.invalid/api/admin/match-candidates"))).status).toBe(401);
 m.query.mockResolvedValue([{_id:"m",name:"Synthetic",gender:"male",publicApplicantNumber:1,profileAccessToken:"secret-not-returned",email:"private@example.invalid"}]);
 const r=await GET(new NextRequest("https://example.invalid/api/admin/match-candidates",{headers:{cookie, origin:"https://example.invalid"}}));expect(r.status).toBe(200);expect(await r.json()).toEqual([{_id:"m",name:"Synthetic",gender:"male",publicApplicantNumber:1}]);
});

// @vitest-environment node
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
const mock = vi.hoisted(()=>({mutation:vi.fn()}));
vi.mock("@/lib/convex",()=>({getConvexClient:()=>mock}));
import { POST } from "./route";
const body={registrationId:"synthetic",expectedOldEmail:"old@example.invalid",newEmail:"new@example.invalid",reason:"Member consent verified"};
function request(origin: string | null="https://app.invalid",auth=true,payload:unknown=body){
 const headers:Record<string,string>={}; if(origin!==null) headers.origin=origin;
 if(auth) headers.cookie="admin_token="+crypto.createHash("sha256").update("syntheticsalt").digest("hex");
 return new NextRequest("https://app.invalid/api/admin/change-email",{method:"POST",headers,body:JSON.stringify(payload)});
}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("ADMIN_PASSWORD","synthetic");vi.stubEnv("ADMIN_TOKEN_SALT","salt");vi.stubEnv("ATTENDANCE_ADMIN_SECRET","synthetic-service");mock.mutation.mockResolvedValue({email:body.newEmail});});
afterEach(()=>vi.unstubAllEnvs());
test("requires authenticated admin and same-origin even with valid cookie",async()=>{
 expect((await POST(request(undefined,false))).status).toBe(401);
 for(const origin of [null,"https://evil.invalid","http://app.invalid"]) expect((await POST(request(origin))).status).toBe(403);
 expect(mock.mutation).not.toHaveBeenCalled();
});
test("valid request uses server credential and private response",async()=>{
 const r=await POST(request());expect(r.status).toBe(200);expect(r.headers.get("cache-control")).toContain("no-store");expect(mock.mutation).toHaveBeenCalledWith(expect.anything(),{...body,adminSecret:"synthetic-service"});
});
test("rejects injected fields and malformed body",async()=>{
 for(const payload of [null,{}, {...body,adminSecret:"injected"},{...body,reason:2}]) expect((await POST(request(undefined,true,payload))).status).toBe(400);
 expect(mock.mutation).not.toHaveBeenCalled();
});
test("conflicts are actionable, internal errors remain private",async()=>{
 mock.mutation.mockRejectedValueOnce(new Error("Email changed; refresh the profile"));expect((await POST(request())).status).toBe(409);
 mock.mutation.mockRejectedValueOnce(new Error("private backend payload"));const r=await POST(request());expect(await r.text()).not.toContain("private backend");
});

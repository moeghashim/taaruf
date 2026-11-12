// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import crypto from "node:crypto";
import { NextRequest } from "next/server";
const calls=vi.hoisted(()=>({query:vi.fn(async()=>({fingerprint:"a".repeat(64)})),mutation:vi.fn(async()=>({auditId:"synthetic"}))}));
vi.mock("../src/lib/convex",()=>({getConvexClient:()=>calls}));
import { POST } from "../src/app/api/admin/reopen-test-interest/route";
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
function request(body:unknown,auth=true,origin="https://example.test"){
 vi.stubEnv("ADMIN_PASSWORD","synthetic");vi.stubEnv("ADMIN_TOKEN_SALT","salt");vi.stubEnv("ATTENDANCE_ADMIN_SECRET","synthetic-secret");
 const cookie=crypto.createHash("sha256").update("syntheticsalt").digest("hex");
 return new NextRequest("https://example.test/api/admin/reopen-test-interest",{method:"POST",headers:{origin,host:"example.test","content-type":"application/json",...(auth?{cookie:"admin_token="+cookie}:{})},body:JSON.stringify(body)});
}
test("preview deployment API always disabled even when isolation flag set",async()=>{vi.stubEnv("VERCEL_ENV","preview");vi.stubEnv("PREVIEW_BACKEND_ISOLATED","true");expect((await POST(request({action:"reopen"}))).status).toBe(503);expect(calls.mutation).not.toHaveBeenCalled();});
test("unauthenticated and cross-origin denied",async()=>{expect((await POST(request({action:"preview"},false))).status).toBe(401);expect((await POST(request({action:"preview"},true,"https://evil.test"))).status).toBe(403);expect(calls.query).not.toHaveBeenCalled();});
test("authenticated preview query and confirmed mutation only",async()=>{expect((await POST(request({action:"preview"}))).status).toBe(200);expect(calls.query).toHaveBeenCalledOnce();expect((await POST(request({action:"reopen",confirm:"315-to-217-nov14",expectedFingerprint:"a".repeat(64)}))).status).toBe(200);expect(calls.mutation).toHaveBeenCalledOnce();});
for(const body of [null,[],{action:"reset"},{action:"reopen",confirm:"219-220",expectedFingerprint:"a".repeat(64)},{action:"preview",adminSecret:"forged"},{action:"reopen",confirm:"315-to-217-nov14",expectedFingerprint:"bad"}])test("invalid request rejected "+JSON.stringify(body),async()=>{expect((await POST(request(body))).status).toBe(400);expect(calls.query).not.toHaveBeenCalled();expect(calls.mutation).not.toHaveBeenCalled();});

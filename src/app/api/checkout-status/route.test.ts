import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";
const {query}=vi.hoisted(()=>({query:vi.fn()}));
vi.mock("@/lib/convex",()=>({getConvexClient:()=>({query})}));
vi.mock("@/lib/admin-server",async importOriginal=>({...await importOriginal<typeof import("@/lib/admin-server")>(),getAdminSecret:()=>"synthetic-secret"}));
import {GET} from "./route";
beforeEach(()=>{ query.mockReset(); });
test("checkout capability receives state only, never profile or service credential",async()=>{
 query.mockResolvedValue({paymentStatus:"paid",name:"Private",email:"private@example.invalid",profileAccessToken:"private-token"});
 const response=await GET(new NextRequest("https://test.invalid/api/checkout-status?session_id=cs_test_abcdefghijklmnop"));
 expect(await response.json()).toEqual({paymentStatus:"paid"});
 expect(response.headers.get("cache-control")).toContain("no-store");
 expect(query.mock.calls[0][1]).toMatchObject({adminSecret:"synthetic-secret"});
});
test("invalid checkout and backend errors fail safely",async()=>{
 expect((await GET(new NextRequest("https://test.invalid/api/checkout-status?session_id=bad"))).status).toBe(400);
 expect(query).not.toHaveBeenCalled(); query.mockRejectedValue(new Error("synthetic-secret"));
 const response=await GET(new NextRequest("https://test.invalid/api/checkout-status?session_id=cs_live_abcdefghijklmnop"));
 expect(response.status).toBe(503); expect(await response.text()).not.toContain("synthetic-secret");
});

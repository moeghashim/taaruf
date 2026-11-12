import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";
const {query,mutation}=vi.hoisted(()=>({query:vi.fn(),mutation:vi.fn()}));
vi.mock("convex/browser",()=>({ConvexHttpClient:class {query=query;mutation=mutation;}}));
import {GET} from "./route";
beforeEach(()=>{vi.stubEnv("CONVEX_URL","https://synthetic.invalid");query.mockReset();mutation.mockReset();});
test("share uses only atomically authorized URLs, no second storage lookup after revocation",async()=>{
 query.mockResolvedValueOnce({includeImages:true,status:"shared",owner:{age:30,imageStorageIds:["synthetic-id"]},recipient:{name:"Synthetic"},images:[{storageId:"synthetic-id",url:"https://synthetic.invalid/photo"}]});
 // Simulate revocation committed after the authorized query. The route may finish
 // its in-flight authorized response, but must not mint URLs in another snapshot.
 mutation.mockRejectedValue(new Error("revoked"));
 const response=await GET(new NextRequest("https://app.invalid/api/share/test"),{params:Promise.resolve({token:"test"})});
 expect(response.status).toBe(200);expect(query).toHaveBeenCalledTimes(1);
 expect((await response.json()).share.owner.imageUrls).toEqual(["https://synthetic.invalid/photo"]);
});
test("revoked share returns no profile or photo",async()=>{
 query.mockResolvedValue(null);
 const response=await GET(new NextRequest("https://app.invalid/api/share/test"),{params:Promise.resolve({token:"test"})});
 expect(response.status).toBe(404);expect(mutation).not.toHaveBeenCalled();expect(query).toHaveBeenCalledTimes(1);
});

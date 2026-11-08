import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";
const {query}=vi.hoisted(()=>({query:vi.fn()}));
vi.mock("convex/browser",()=>({ConvexHttpClient:class {query=query;}}));
import {GET} from "./route";
beforeEach(()=>{vi.stubEnv("CONVEX_URL","https://synthetic.invalid");query.mockReset();});
test("legacy profile fallback and atomic image result remain usable",async()=>{
 query.mockResolvedValue({name:"Synthetic",interestSubmission:"42, 51, 63",images:[{storageId:"synthetic",url:"https://synthetic.invalid/photo"}]});
 const response=await GET(new NextRequest("https://app.invalid/api/profile/test"),{params:Promise.resolve({token:"test"})});
 expect(response.status).toBe(200);expect(query).toHaveBeenCalledTimes(1);
 const body=await response.json();expect(body.registration.interestSubmissionNumbers).toEqual([42,51,63]);expect(body.registration.imageUrls).toEqual(["https://synthetic.invalid/photo"]);
});

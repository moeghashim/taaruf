import crypto from "crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
const mocks = vi.hoisted(()=>({mutation:vi.fn(),send:vi.fn()}));
vi.mock("../src/lib/convex",()=>({getConvexClient:()=>({mutation:mocks.mutation})}));
vi.mock("../src/lib/email",()=>({sendEventRegistrationStatusEmail:mocks.send}));
import { POST } from "../src/app/api/admin/event-registration-email/route";
beforeEach(()=>{vi.stubGlobal("window",undefined);vi.stubEnv("ADMIN_PASSWORD","synthetic");vi.stubEnv("ADMIN_TOKEN_SALT","salt");vi.stubEnv("ATTENDANCE_ADMIN_SECRET","synthetic");});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks();});
test("direct API and repeated bulk calls cannot reach email provider or login-token creation for rejected profile",async()=>{
 const t=convexTest(schema,modules);
 const id=await t.run(async ctx=>{
 const registrationId=await ctx.db.insert("registrations",{name:"Synthetic",age:30,gender:"male",maritalStatus:"single",education:"College",job:"Engineer",email:"synthetic@example.invalid",phone:"555",paymentStatus:"paid",status:"rejected",createdAt:1});
 const eventId=await ctx.db.insert("events",{title:"Synthetic",eventCode:"synthetic",eventMonth:"2026-11",series:"1plus1_match",location:"Test",startsAt:100,endsAt:200,status:"scheduled",maleCapacity:60,femaleCapacity:60,createdAt:1,updatedAt:1});
 return ctx.db.insert("eventRegistrations",{registrationId,eventId,gender:"male",registrationStatus:"withdrawn",confirmationStatus:"cancelled",attendanceStatus:"not_checked_in",eligibilityStatus:"approved_member",createdAt:1,updatedAt:1});
 });
 mocks.mutation.mockImplementation((ref,args)=>t.mutation(ref,args));
 const cookie="admin_token="+crypto.createHash("sha256").update("syntheticsalt").digest("hex");
 for(const kind of ["approved","waitlisted","confirmation_request","cancelled","reminder"]) {
 const response=await POST(new NextRequest("http://localhost/api/admin/event-registration-email",{method:"POST",headers:{cookie,origin:"http://localhost"},body:JSON.stringify({eventRegistrationId:id,kind,force:true})}));
 expect(response.status).toBe(500);
 expect(await response.json()).toEqual({error:"Unable to complete admin request"});
 }
 expect(mocks.send).not.toHaveBeenCalled();
 expect(mocks.mutation).toHaveBeenCalledTimes(5);
 expect(await t.run(ctx=>ctx.db.query("eventRegistrationEmails").collect())).toEqual([]);
});

// @vitest-environment node
import { convexTest } from "convex-test";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
const mocks = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/convex", () => ({ getConvexClient: () => mocks }));
vi.mock("@/lib/applicant-session", () => ({ getApplicantSessionHash: mocks.session }));
import { GET as eventsGET } from "../src/app/api/applicant/events/route";
import { GET as eligibilityGET } from "../src/app/api/applicant/interest-eligibility/route";
import { GET as meGET } from "../src/app/api/applicant/me/route";
const adminSecret = "synthetic-logistics";
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("ATTENDANCE_ADMIN_SECRET", adminSecret); });
afterEach(() => vi.unstubAllEnvs());
async function fixture(registrationStatus: "approved" | "pending" | "waitlisted" | "rejected" | "withdrawn") {
 const t = convexTest(schema, modules);
 const ids = await t.run(async ctx => {
  const registrationId = await ctx.db.insert("registrations", {name:"Synthetic",age:30,gender:"male",maritalStatus:"single",education:"College",job:"Engineer",email:"synthetic@example.invalid",phone:"555",status:"approved",profileCompletionStatus:"completed",createdAt:1, applicantNotesToAdmin:"Secret venue on November 14"});
  const eventId = await ctx.db.insert("events", {title:"Secret venue November 14",description:"Arrive at Secret venue at 5pm",eventCode:"nov14",eventMonth:"2026-11",series:"1plus1_match",location:"Secret venue",startsAt:1794697200000,endsAt:1794704400000,status:"scheduled",maleCapacity:60,femaleCapacity:60,createdAt:1,updatedAt:1});
  const eventRegistrationId = await ctx.db.insert("eventRegistrations", {eventId,registrationId,gender:"male",registrationStatus,confirmationStatus:"confirmed",attendanceStatus:"attended",eligibilityStatus:"approved_member",checkedInAt:1794697200000,createdAt:1,updatedAt:1});
  await ctx.db.insert("applicantSessions", {registrationId,sessionHash:"synthetic",expiresAt:Date.now()+100000,createdAt:1});
  return {registrationId,eventId,eventRegistrationId};
 });
 mocks.query.mockImplementation((fn,args)=>t.query(fn,args)); mocks.mutation.mockResolvedValue(true); mocks.session.mockResolvedValue("synthetic");
 return {t,...ids};
}
for (const state of ["approved","pending","waitlisted","rejected","withdrawn"] as const) test("current profile overrides event state " + state, async()=>{
 const {t,registrationId,eventId,eventRegistrationId}=await fixture(state);
 const before=await t.run(ctx=>ctx.db.get(eventRegistrationId));
 expect(JSON.stringify(await t.query(api.events.getApplicantEvents,{sessionHash:"synthetic"}))).toContain("Secret venue");
 await t.run(ctx=>ctx.db.patch(registrationId,{status:"rejected"}));
 const result=await t.query(api.events.getApplicantEvents,{sessionHash:"synthetic"});
 expect(result).toEqual({logisticsRestricted:true,upcoming:[],canSubmitInterest:false,history:[{_id:eventRegistrationId,registrationStatus:state,confirmationStatus:"confirmed",attendanceStatus:"attended",event:null,canWithdraw:false}]});
 const response=await eventsGET(); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store"); expect(await response.json()).toEqual(result);
 const dashboard=await meGET(new NextRequest("https://synthetic.invalid/api/applicant/me"));
 expect(dashboard.status).toBe(200); const body=await dashboard.json(); expect(body.eventLogisticsRestricted).toBe(true);
 for (const payload of [result,body]) for (const forbidden of ["Secret venue","nov14","2026-11","1794697200000","1794704400000","description","location","startsAt","checkedInAt"]) expect(JSON.stringify(payload)).not.toContain(forbidden);
 expect((await t.query(api.applicantInterests.getInterestEligibility,{sessionHash:"synthetic"})).eventLogisticsRestricted).toBe(true);
 expect(await (await eligibilityGET()).json()).toMatchObject({eventLogisticsRestricted:true});
 await expect(t.query(api.events.getDetail,{eventId})).rejects.toThrow();
 await expect(t.query(api.events.getByRegistration,{registrationId})).rejects.toThrow();
 expect((await t.query(api.events.getDetail,{eventId,adminSecret})).location).toBe("Secret venue");
 expect(await t.run(ctx=>ctx.db.get(eventRegistrationId))).toEqual(before);
 // Public publication is deliberately not revoked by portal restrictions.
 expect((await t.query(api.events.getPublicByCode,{eventCode:"nov14"}))?.location).toBe("Secret venue");
 await t.run(ctx=>ctx.db.patch(registrationId,{status:"approved"}));
 expect((await t.query(api.events.getApplicantEvents,{sessionHash:"synthetic"})).logisticsRestricted).toBe(false);
});
test("explicit failed background check shares safeguard; anonymous denied",async()=>{
 const {t,registrationId}=await fixture("approved");
 await t.run(ctx=>ctx.db.patch(registrationId,{backgroundCheck:"failed"}));
 expect((await t.query(api.events.getApplicantEvents,{sessionHash:"synthetic"})).upcoming).toEqual([]);
 await expect(t.query(api.events.getApplicantEvents,{sessionHash:"missing"})).rejects.toThrow("Unauthorized");
 mocks.session.mockResolvedValue(null); expect((await eventsGET()).status).toBe(401);
});

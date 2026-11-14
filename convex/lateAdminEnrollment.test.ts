import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { beforeEach, afterEach, test, expect, vi } from "vitest";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
const force = makeFunctionReference<"mutation">("lateAdminEnrollment:forceNovember342");
const now=1794631000000, secret="synthetic-force342";
beforeEach(()=>{vi.stubEnv("ATTENDANCE_ADMIN_SECRET",secret);vi.spyOn(Date,"now").mockReturnValue(now);});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
async function fixture(){
 const t=convexTest(schema,modules);
 const ids=await t.run(async ctx=>{
  const eventId=await ctx.db.insert("events",{title:"Synthetic",eventCode:"nov26",eventMonth:"2026-11",series:"1plus1_match",location:"Test",startsAt:1794681900000,endsAt:1794692700000,status:"scheduled",maleCapacity:50,femaleCapacity:50,registrationClosesAt:now-1000,createdAt:1,updatedAt:1});
  const registrationId=await ctx.db.insert("registrations",{name:"Synthetic342",publicApplicantNumber:342,age:30,gender:"female",maritalStatus:"single",education:"College",job:"Engineer",email:"fixture@example.invalid",phone:"555",paymentStatus:"paid",status:"approved",profileCompletionStatus:"completed",createdAt:1});
  for(let i=0;i<62;i++)await ctx.db.insert("eventRegistrations",{eventId,registrationId,gender:"female",registrationStatus:"approved",confirmationStatus:"confirmed",attendanceStatus:"not_checked_in",eligibilityStatus:"approved_member",supersededBy:undefined,createdAt:1,updatedAt:1});
  // Distinct existing owners: avoid counting fixture rows as342 enrollments.
  const other=await ctx.db.insert("registrations",{name:"Synthetic other",publicApplicantNumber:343,age:30,gender:"female",maritalStatus:"single",education:"College",job:"Engineer",email:"other@example.invalid",phone:"555",paymentStatus:"paid",status:"approved",profileCompletionStatus:"completed",createdAt:1});
  for(const r of await ctx.db.query("eventRegistrations").collect())await ctx.db.patch(r._id,{registrationId:other});
  await ctx.db.insert("eventRegistrations",{eventId,registrationId:other,gender:"female",registrationStatus:"waitlisted",confirmationStatus:"not_confirmed",confirmationExpiresAt:now-1,attendanceStatus:"not_checked_in",eligibilityStatus:"approved_member",createdAt:1,updatedAt:1});
  await ctx.db.insert("applicantSessions",{registrationId,sessionHash:"synthetic342-session",expiresAt:now+999999,createdAt:1});
  return {eventId,registrationId};
 });
 const snapshot=()=>t.run(async ctx=>({event:await ctx.db.get(ids.eventId),profiles:await ctx.db.query("registrations").collect(),rows:await ctx.db.query("eventRegistrations").collect(),waitlist:await ctx.db.query("eventWaitlistEntries").collect(),emails:await ctx.db.query("eventRegistrationEmails").collect()}));
 return {t,...ids,snapshot,args:{adminSecret:secret,...ids,confirmClosedRegistrationOverride:true,confirmCapacityOverride:true}};
}
test("force inserts exactly one pending/unconfirmed row despite62/50; everything else preserved; retry no-op",async()=>{
 const f=await fixture(),before=await f.snapshot();const result=await f.t.mutation(force,f.args);expect(result.changed).toBe(true);const after=await f.snapshot();const row=after.rows.find(r=>r._id===result.eventRegistrationId)!;expect(row).toMatchObject({registrationId:f.registrationId,registrationStatus:"pending",confirmationStatus:"not_confirmed",attendanceStatus:"not_checked_in"});expect(row.confirmedAt).toBeUndefined();expect(row.adminNotes).toContain("5268");expect({...after,rows:after.rows.filter(r=>r._id!==row._id)}).toEqual(before);expect(await f.t.mutation(force,f.args)).toEqual({changed:false,eventRegistrationId:row._id});expect(await f.snapshot()).toEqual(after);
});
for(const override of ["confirmClosedRegistrationOverride","confirmCapacityOverride"])test("explicit override required: "+override,async()=>{const f=await fixture(),before=await f.snapshot();await expect(f.t.mutation(force,{...f.args,[override]:false})).rejects.toThrow();expect(await f.snapshot()).toEqual(before);});
test("auth denial and unconfigured auth fail without writes",async()=>{const f=await fixture(),before=await f.snapshot();await expect(f.t.mutation(force,{...f.args,adminSecret:"wrong"})).rejects.toThrow("Unauthorized");vi.stubEnv("ATTENDANCE_ADMIN_SECRET","");await expect(f.t.mutation(force,f.args)).rejects.toThrow("Unauthorized");expect(await f.snapshot()).toEqual(before);});
for(const patch of [{publicApplicantNumber:343},{status:"rejected" as const},{profileCompletionStatus:"not_started" as const},{archivedAt:1},{securityRetiredAt:1}])test("profile guard "+JSON.stringify(patch),async()=>{const f=await fixture();await f.t.run(ctx=>ctx.db.patch(f.registrationId,patch));const before=await f.snapshot();await expect(f.t.mutation(force,f.args)).rejects.toThrow();expect(await f.snapshot()).toEqual(before);});
for(const patch of [{status:"completed" as const},{registrationClosesAt:now+1},{eventCode:"wrong"}])test("event guard "+JSON.stringify(patch),async()=>{const f=await fixture();await f.t.run(ctx=>ctx.db.patch(f.eventId,patch));const before=await f.snapshot();await expect(f.t.mutation(force,f.args)).rejects.toThrow();expect(await f.snapshot()).toEqual(before);});
test("ordinary public/admin closed paths remain rejected",async()=>{const f=await fixture(),before=await f.snapshot();await expect(f.t.mutation(api.events.addRegistration,{adminSecret:secret,eventId:f.eventId,registrationId:f.registrationId})).rejects.toThrow("Event registration is closed");await expect(f.t.mutation(api.events.registerForEvent,{eventId:f.eventId,sessionHash:"synthetic342-session"})).rejects.toThrow("Event registration is closed");expect(await f.t.query(api.events.getPublicByCode,{eventCode:"nov26"})).toBeNull();expect(await f.snapshot()).toEqual(before);});
test("concurrent duplicate requests produce one enrollment",async()=>{const f=await fixture();const outcomes=await Promise.all([f.t.mutation(force,f.args),f.t.mutation(force,f.args)]);expect(new Set(outcomes.map(r=>r.eventRegistrationId)).size).toBe(1);expect((await f.snapshot()).rows.filter(r=>r.registrationId===f.registrationId)).toHaveLength(1);});

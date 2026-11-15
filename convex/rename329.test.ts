import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { beforeEach, afterEach, test, expect, vi } from "vitest";
import schema from "./schema";
import { modules } from "./test.setup";

const force = makeFunctionReference<"mutation">("rename329:rename");
const now=1794631000000, secret="synthetic-force337";
beforeEach(()=>{vi.stubEnv("ATTENDANCE_ADMIN_SECRET",secret);vi.spyOn(Date,"now").mockReturnValue(now);});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
async function fixture(){
 const t=convexTest(schema,modules);
 const ids=await t.run(async ctx=>{
  const eventId=await ctx.db.insert("events",{title:"Synthetic",eventCode:"nov26",eventMonth:"2026-11",series:"1plus1_match",location:"Test",startsAt:1794681900000,endsAt:1794692700000,status:"scheduled",maleCapacity:50,femaleCapacity:50,registrationClosesAt:now-1000,createdAt:1,updatedAt:1});
  const registrationId=await ctx.db.insert("registrations",{name:"Zain Ahmad Abbasi (I go by Ahmad)",publicApplicantNumber:329,age:30,gender:"female",maritalStatus:"single",education:"College",job:"Engineer",email:"fixture@example.invalid",phone:"555",paymentStatus:"paid",status:"approved",profileCompletionStatus:"completed",createdAt:1});
  for(let i=0;i<62;i++)await ctx.db.insert("eventRegistrations",{eventId,registrationId,gender:"female",registrationStatus:"approved",confirmationStatus:"confirmed",attendanceStatus:"not_checked_in",eligibilityStatus:"approved_member",supersededBy:undefined,createdAt:1,updatedAt:1});
  // Distinct existing owners: avoid counting fixture rows as337 enrollments.
  const other=await ctx.db.insert("registrations",{name:"Synthetic other",publicApplicantNumber:343,age:30,gender:"female",maritalStatus:"single",education:"College",job:"Engineer",email:"other@example.invalid",phone:"555",paymentStatus:"paid",status:"approved",profileCompletionStatus:"completed",createdAt:1});
  for(const r of await ctx.db.query("eventRegistrations").collect())await ctx.db.patch(r._id,{registrationId:other});
  await ctx.db.insert("eventRegistrations",{eventId,registrationId:other,gender:"female",registrationStatus:"waitlisted",confirmationStatus:"not_confirmed",confirmationExpiresAt:now-1,attendanceStatus:"not_checked_in",eligibilityStatus:"approved_member",createdAt:1,updatedAt:1});
  await ctx.db.insert("applicantSessions",{registrationId,sessionHash:"synthetic337-session",expiresAt:now+999999,createdAt:1});
  return {eventId,registrationId};
 });
 const snapshot=()=>t.run(async ctx=>({event:await ctx.db.get(ids.eventId),profiles:await ctx.db.query("registrations").collect(),rows:await ctx.db.query("eventRegistrations").collect(),waitlist:await ctx.db.query("eventWaitlistEntries").collect(),emails:await ctx.db.query("eventRegistrationEmails").collect()}));
 return {t,...ids,snapshot,args:{adminSecret:secret,...ids,confirmClosedRegistrationOverride:true,confirmCapacityOverride:true}};
}
test("only name changes; audit and idempotency",async()=>{const f=await fixture(),before=await f.snapshot();const args={adminSecret:secret,registrationId:f.registrationId,confirmNameCorrection:true};expect(await f.t.mutation(force,args)).toEqual({changed:true,name:"Ahmad Abbasi"});const after=await f.snapshot();expect(after).toEqual({...before,profiles:before.profiles.map(p=>p._id===f.registrationId?{...p,name:"Ahmad Abbasi"}:p)});const audit=await f.t.run(ctx=>ctx.db.query("adminNameChangeAudits").collect());expect(audit).toHaveLength(1);expect(await f.t.mutation(force,args)).toEqual({changed:false,name:"Ahmad Abbasi"});expect(await f.snapshot()).toEqual(after);expect(await f.t.run(ctx=>ctx.db.query("adminNameChangeAudits").collect())).toEqual(audit);});
test.each(["unauthorized","otherID","changedName","archived","retired"])("reject %s without writes",async condition=>{const f=await fixture();await f.t.run(async ctx=>{if(condition==="otherID")await ctx.db.patch(f.registrationId,{publicApplicantNumber:330});if(condition==="changedName")await ctx.db.patch(f.registrationId,{name:"Different person"});if(condition==="archived")await ctx.db.patch(f.registrationId,{archivedAt:now});if(condition==="retired")await ctx.db.patch(f.registrationId,{securityRetiredAt:now});});const before=await f.snapshot();await expect(f.t.mutation(force,{adminSecret:condition==="unauthorized"?"wrong":secret,registrationId:f.registrationId,confirmNameCorrection:true})).rejects.toThrow();expect(await f.snapshot()).toEqual(before);expect(await f.t.run(ctx=>ctx.db.query("adminNameChangeAudits").collect())).toHaveLength(0);});

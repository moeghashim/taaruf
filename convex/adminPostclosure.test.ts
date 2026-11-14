import { convexTest } from "convex-test";

import { beforeEach, afterEach, test, expect, vi } from "vitest";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";

const now=1794685500000, secret="synthetic-force337";
beforeEach(()=>{vi.stubEnv("ATTENDANCE_ADMIN_SECRET",secret);vi.spyOn(Date,"now").mockReturnValue(now);});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
async function fixture(){
 const t=convexTest(schema,modules);
 const ids=await t.run(async ctx=>{
  const eventId=await ctx.db.insert("events",{title:"Synthetic",eventCode:"nov26",eventMonth:"2026-11",series:"1plus1_match",location:"Test",startsAt:1794681900000,endsAt:1794692700000,status:"scheduled",maleCapacity:50,femaleCapacity:50,registrationClosesAt:now-1000,createdAt:1,updatedAt:1});
  const registrationId=await ctx.db.insert("registrations",{name:"Synthetic337",publicApplicantNumber:337,age:30,gender:"female",maritalStatus:"single",education:"College",job:"Engineer",email:"fixture@example.invalid",phone:"555",paymentStatus:"paid",status:"approved",profileCompletionStatus:"completed",createdAt:1});
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

for(const clock of [1794681800000,1794685500000])test("admin allowed public closed at "+clock,async()=>{vi.spyOn(Date,"now").mockReturnValue(clock);const f=await fixture();await f.t.run(ctx=>ctx.db.patch(f.eventId,{registrationClosesAt:1794630000000}));const before=await f.snapshot();const r=await f.t.mutation(api.events.addRegistration,{adminSecret:secret,eventId:f.eventId,registrationId:f.registrationId});const after=await f.snapshot();const row=after.rows.find(x=>x._id===r.eventRegistrationId)!;expect(row).toMatchObject({registrationStatus:"waitlisted",confirmationStatus:"not_confirmed"});expect({...after,rows:after.rows.filter(x=>x._id!==row._id)}).toEqual(before);await expect(f.t.mutation(api.events.registerForEvent,{sessionHash:"synthetic337-session",eventId:f.eventId})).rejects.toThrow("closed");expect(await f.t.query(api.events.getPublicByCode,{eventCode:"nov26"})).toBeNull();const forceArgs={adminSecret:secret,eventRegistrationId:row._id,confirmCapacityOverride:true as const};await f.t.mutation(api.events.forceRegisterWaitlisted,forceArgs);const forced=await f.snapshot();expect(forced.rows.find(x=>x._id===row._id)).toMatchObject({registrationStatus:"pending",confirmationStatus:"not_confirmed"});expect({...forced,rows:forced.rows.filter(x=>x._id!==row._id)}).toEqual(before);await f.t.mutation(api.events.forceRegisterWaitlisted,forceArgs);expect(await f.snapshot()).toEqual(forced);await f.t.mutation(api.events.updateRegistrationStatus,{adminSecret:secret,eventRegistrationId:row._id,registrationStatus:"approved"});const approved=await f.snapshot();expect(approved.rows.find(x=>x._id===row._id)?.confirmationStatus).toBe("not_confirmed");expect({...approved,rows:approved.rows.filter(x=>x._id!==row._id)}).toEqual(before);});
test("available capacity new add pending unconfirmed and duplicate no-op",async()=>{const f=await fixture();await f.t.run(async ctx=>{for(const row of await ctx.db.query("eventRegistrations").collect())await ctx.db.delete(row._id);});const args={adminSecret:secret,eventId:f.eventId,registrationId:f.registrationId};const r=await f.t.mutation(api.events.addRegistration,args);const after=await f.snapshot();expect(after.rows.find(x=>x._id===r.eventRegistrationId)).toMatchObject({registrationStatus:"pending",confirmationStatus:"not_confirmed"});await f.t.mutation(api.events.addRegistration,args);expect(await f.snapshot()).toEqual(after);});
test("unauthorized and unrelated closed event remain denied",async()=>{const f=await fixture(),before=await f.snapshot();await expect(f.t.mutation(api.events.addRegistration,{adminSecret:"wrong",eventId:f.eventId,registrationId:f.registrationId})).rejects.toThrow("Unauthorized");expect(await f.snapshot()).toEqual(before);await f.t.run(ctx=>ctx.db.patch(f.eventId,{eventCode:"other"}));await expect(f.t.mutation(api.events.addRegistration,{adminSecret:secret,eventId:f.eventId,registrationId:f.registrationId})).rejects.toThrow("closed");});

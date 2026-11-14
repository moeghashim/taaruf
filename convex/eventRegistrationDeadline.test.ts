import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
const close = makeFunctionReference<"mutation">("eventRegistrationDeadline:closeNovember14");
const secret = "synthetic-deadline-test", now = Date.parse("2026-11-14T04:00:00Z");
beforeEach(() => { vi.stubEnv("ATTENDANCE_ADMIN_SECRET", secret); vi.spyOn(Date, "now").mockReturnValue(now); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
async function fixture() {
 const t = convexTest(schema, modules);
 const ids = await t.run(async ctx => {
  const eventId = await ctx.db.insert("events", {title:"Synthetic November event",eventCode:"nov26",eventMonth:"2026-11",series:"1plus1_match",location:"Test",startsAt:1794681900000,endsAt:1794692700000,status:"scheduled",maleCapacity:60,femaleCapacity:60,createdAt:1,updatedAt:2});
  for (const status of ["approved","pending","waitlisted"] as const) {
   const registrationId = await ctx.db.insert("registrations", {name:"Synthetic",age:30,gender:"female",maritalStatus:"single",education:"College",job:"Engineer",email:status+"@example.invalid",phone:"555",paymentStatus:"paid",status:"approved",profileCompletionStatus:"completed",createdAt:1});
   await ctx.db.insert("eventRegistrations", {eventId,registrationId,gender:"female",registrationStatus:status,confirmationStatus:status==="pending"?"not_confirmed":"confirmed",attendanceStatus:"not_checked_in",eligibilityStatus:"approved_member",confirmationExpiresAt:now-1000,createdAt:1,updatedAt:1});
   await ctx.db.insert("eventWaitlistEntries", {eventId,registrationId,gender:"female",status:"active",createdAt:1,updatedAt:1});
  }
  const registrationId = await ctx.db.insert("registrations", {name:"Synthetic new",age:30,gender:"male",maritalStatus:"single",education:"College",job:"Engineer",email:"new@example.invalid",phone:"555",paymentStatus:"paid",status:"approved",profileCompletionStatus:"completed",createdAt:1});
  await ctx.db.insert("applicantSessions", {registrationId,sessionHash:"synthetic-new-session",expiresAt:now+100000,createdAt:1});
  return {eventId,registrationId};
 });
 const snapshot = () => t.run(async ctx => ({events:await ctx.db.query("events").collect(),profiles:await ctx.db.query("registrations").collect(),roster:await ctx.db.query("eventRegistrations").collect(),waitlist:await ctx.db.query("eventWaitlistEntries").collect(),emails:await ctx.db.query("eventRegistrationEmails").collect()}));
 return {t,...ids,snapshot,args:{adminSecret:secret,eventId:ids.eventId,expectedUpdatedAt:2}};
}
test("deadline-only closure preserves every roster/profile/waitlist/email field, idempotently",async()=>{
 const f=await fixture(),before=await f.snapshot();
 expect(await f.t.mutation(close,f.args)).toEqual({changed:true,registrationClosesAt:now-1});
 const after=await f.snapshot(); expect(after).toEqual({...before,events:[{...before.events[0],registrationClosesAt:now-1,updatedAt:now}]});
 expect(await f.t.mutation(close,f.args)).toEqual({changed:false,registrationClosesAt:now-1});expect(await f.snapshot()).toEqual(after);
});
test("wrong and unconfigured credentials fail closed with zero changes",async()=>{
 const f=await fixture(),before=await f.snapshot();await expect(f.t.mutation(close,{...f.args,adminSecret:"wrong"})).rejects.toThrow("Unauthorized");vi.stubEnv("ATTENDANCE_ADMIN_SECRET","");await expect(f.t.mutation(close,f.args)).rejects.toThrow("Unauthorized");expect(await f.snapshot()).toEqual(before);
});
for(const patch of [{eventCode:"another"},{startsAt:1794681900001},{status:"completed" as const},{updatedAt:3}])test("target/state/concurrency validation "+JSON.stringify(patch),async()=>{
 const f=await fixture();await f.t.run(ctx=>ctx.db.patch(f.eventId,patch));const before=await f.snapshot();await expect(f.t.mutation(close,f.args)).rejects.toThrow();expect(await f.snapshot()).toEqual(before);
});
test("started event rejected without changes",async()=>{const f=await fixture();vi.mocked(Date.now).mockReturnValue(1794681900000);const before=await f.snapshot();await expect(f.t.mutation(close,f.args)).rejects.toThrow("already started");expect(await f.snapshot()).toEqual(before);});
test("existing actual public and admin registration paths reject; no signup created",async()=>{
 const f=await fixture();expect(await f.t.query(api.events.getPublicByCode,{eventCode:"nov26"})).not.toBeNull();await f.t.mutation(close,f.args);const before=await f.snapshot();expect(await f.t.query(api.events.getPublicByCode,{eventCode:"nov26"})).toBeNull();await expect(f.t.mutation(api.events.registerForEvent,{sessionHash:"synthetic-new-session",eventId:f.eventId})).rejects.toThrow("Event registration is closed");await expect(f.t.mutation(api.events.addRegistration,{adminSecret:secret,eventId:f.eventId,registrationId:f.registrationId})).rejects.toThrow("Event registration is closed");expect(await f.snapshot()).toEqual(before);
});

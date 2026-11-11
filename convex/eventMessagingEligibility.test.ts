import { convexTest } from "convex-test";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";
import { canReceiveEventMessages } from "./eventMessagingEligibility";
const adminSecret = "synthetic-event-messaging";
beforeEach(() => vi.stubEnv("ATTENDANCE_ADMIN_SECRET", adminSecret));
afterEach(() => vi.unstubAllEnvs());
async function fixture(status: Doc<"registrations">["status"], registrationStatus: Doc<"eventRegistrations">["registrationStatus"], backgroundCheck?: string) {
 const t = convexTest(schema, modules);
 const ids = await t.run(async ctx => {
  const registrationId = await ctx.db.insert("registrations", { name:"Synthetic", age:30, gender:"male", maritalStatus:"single", education:"College", job:"Engineer", email:"synthetic@example.invalid", phone:"555", paymentStatus:"paid", status, backgroundCheck, profileCompletionStatus:"completed", createdAt:1 });
  const eventId = await ctx.db.insert("events", {title:"Synthetic event", eventCode:"synthetic", eventMonth:"2026-11", series:"1plus1_match", location:"Test", startsAt:Date.now()+100000, endsAt:Date.now()+200000, status:"scheduled", maleCapacity:60, femaleCapacity:60, createdAt:1, updatedAt:1});
  const eventRegistrationId = await ctx.db.insert("eventRegistrations", {eventId, registrationId, gender:"male", registrationStatus, confirmationStatus:"cancelled", attendanceStatus:"not_checked_in", eligibilityStatus:"approved_member", confirmationRequestedAt:Date.now(), confirmationExpiresAt:Date.now()+100000, createdAt:1, updatedAt:1});
  await ctx.db.insert("applicantSessions", {registrationId, sessionHash:"synthetic-session", expiresAt:Date.now()+100000, createdAt:1});
  return {registrationId,eventId,eventRegistrationId};
 });
 return {t,...ids};
}
const kinds = ["approved","waitlisted","confirmation_request","cancelled","reminder"] as const;
for (const state of ["pending","approved","waitlisted","rejected","withdrawn"] as const) for (const profile of [{status:"rejected" as const}, {status:"approved" as const,backgroundCheck:"failed"}]) test("blocked profile "+JSON.stringify(profile)+" with event "+state, async () => {
 const {t,eventRegistrationId,eventId,registrationId} = await fixture(profile.status,state,profile.backgroundCheck);
 const before = await t.run(ctx=>ctx.db.get(eventRegistrationId));
 for (const kind of kinds) for (const force of [false,true]) await expect(t.mutation(api.events.claimEventRegistrationEmail,{adminSecret,eventRegistrationId,kind,force})).rejects.toThrow("unavailable");
 await expect(t.mutation(api.events.requestConfirmation,{adminSecret,eventRegistrationId})).rejects.toThrow("unavailable");
 await expect(t.mutation(api.events.updateRegistrationConfirmation,{adminSecret,eventRegistrationId,confirmationStatus:"confirmed"})).rejects.toThrow("unavailable");
 await expect(t.mutation(api.events.confirmParticipation,{sessionHash:"synthetic-session",eventRegistrationId})).rejects.toThrow("unavailable");
 await expect(t.mutation(api.events.claimRegistrationReceivedEmail,{adminSecret,eventRegistrationId,token:"synthetic"})).rejects.toThrow("unavailable");
 await expect(t.mutation(api.events.registerForEvent,{sessionHash:"synthetic-session",eventId})).rejects.toThrow("unavailable");
 await expect(t.mutation(api.events.addRegistration,{adminSecret,registrationId,eventId})).rejects.toThrow("unavailable");
 expect(await t.run(ctx=>ctx.db.get(eventRegistrationId))).toEqual(before);
 expect(await t.run(ctx=>ctx.db.query("eventRegistrationEmails").collect())).toEqual([]);
 expect(await t.run(ctx=>ctx.db.query("receiptDeliveries").collect())).toEqual([]);
});
for (const status of ["pending","approved"] as const) test("eligible positive control "+status, async()=>{
 const {t,eventRegistrationId}=await fixture(status,"pending","pending");
 for (const kind of kinds) expect(await t.mutation(api.events.claimEventRegistrationEmail,{adminSecret,eventRegistrationId,kind})).toMatchObject({claimed:true});
 await t.mutation(api.events.requestConfirmation,{adminSecret,eventRegistrationId});
 await t.mutation(api.events.confirmParticipation,{sessionHash:"synthetic-session",eventRegistrationId});
 expect(await t.run(ctx=>ctx.db.get(eventRegistrationId))).toMatchObject({confirmationStatus:"confirmed"});
});
test("fresh profile defeats stale confirmation, forced resend and mixed bulk calls without changing history", async()=>{
 const {t,eventRegistrationId,registrationId}=await fixture("approved","approved");
 await t.mutation(api.events.requestConfirmation,{adminSecret,eventRegistrationId});
 const prior=await t.mutation(api.events.claimEventRegistrationEmail,{adminSecret,eventRegistrationId,kind:"reminder"});
 await t.mutation(api.events.recordEventRegistrationEmailSuccess,{adminSecret,emailId:prior.emailId!});
 await t.run(async ctx=>{await ctx.db.patch(registrationId,{status:"rejected"});await ctx.db.patch(eventRegistrationId,{confirmationStatus:"confirmed"});});
 const history=await t.run(ctx=>ctx.db.query("eventRegistrationEmails").collect());
 const results=await Promise.allSettled(kinds.map(kind=>t.mutation(api.events.claimEventRegistrationEmail,{adminSecret,eventRegistrationId,kind,force:true})));
 expect(results.every(r=>r.status==="rejected")).toBe(true);
 await expect(t.mutation(api.events.confirmParticipation,{sessionHash:"synthetic-session",eventRegistrationId})).rejects.toThrow("unavailable");
 expect(await t.run(ctx=>ctx.db.query("eventRegistrationEmails").collect())).toEqual(history);
 // Cancellation remains possible; no broad account authentication restriction.
 await t.mutation(api.events.updateRegistrationConfirmation,{adminSecret,eventRegistrationId,confirmationStatus:"cancelled"});
});
test("shared eligibility is conservative about missing records and explicit failure, not arbitrary free text",()=>{
 expect(canReceiveEventMessages(null)).toBe(false);
 for(const backgroundCheck of ["FAILED"," failed ","failed_background_check","background-check-failed","rejected"]) expect(canReceiveEventMessages({status:"approved",backgroundCheck})).toBe(false);
 for(const backgroundCheck of [undefined,"pending","passed","consented","not failed"]) expect(canReceiveEventMessages({status:"approved",backgroundCheck})).toBe(true);
});

for (const state of ["none","withdrawn","rejected"] as const) for (const profile of [{status:"rejected" as const}, {status:"approved" as const,backgroundCheck:"failed"}]) test("checkout cannot restore blocked profile "+JSON.stringify(profile)+" "+state,async()=>{
 const {t,eventRegistrationId,registrationId}=await fixture(profile.status,state==="none"?"pending":state,profile.backgroundCheck);
 if(state==="none")await t.run(ctx=>ctx.db.delete(eventRegistrationId));
 const before=await t.run(async ctx=>({profile:await ctx.db.get(registrationId),rows:await ctx.db.query("eventRegistrations").collect()}));
 await expect(t.mutation(api.registrations.create,{adminSecret,name:"Synthetic",age:30,gender:"male",maritalStatus:"single",education:"College",job:"Engineer",email:"synthetic@example.invalid",phone:"555",eventCode:"synthetic"})).rejects.toThrow("unavailable");
 expect(await t.run(async ctx=>({profile:await ctx.db.get(registrationId),rows:await ctx.db.query("eventRegistrations").collect()}))).toEqual(before);
});

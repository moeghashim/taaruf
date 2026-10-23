import { convexTest } from "convex-test";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
const secret = "receipt-test";
beforeEach(() => vi.stubEnv("ATTENDANCE_ADMIN_SECRET", secret));
async function setup() {
 const t = convexTest(schema, modules);
 const ids = await t.run(async ctx => {
  const registrationId = await ctx.db.insert("registrations", { name:"A", email:"a@example.invalid", age:30, gender:"male", maritalStatus:"single", education:"College", job:"Job", phone:"123", status:"pending", createdAt:1, paymentStatus:"paid" });
  const eventId = await ctx.db.insert("events", {title:"Event",eventCode:"one",eventMonth:"2026-10",series:"test",location:"Here",startsAt:1,endsAt:2,status:"scheduled",maleCapacity:10,femaleCapacity:10,createdAt:1,updatedAt:1});
  const eventRegistrationId = await ctx.db.insert("eventRegistrations", {registrationId,eventId,gender:"male",registrationStatus:"waitlisted",confirmationStatus:"confirmed",attendanceStatus:"not_checked_in",eligibilityStatus:"awaiting_background_check",createdAt:1,updatedAt:1,receiptAttempt:1});
  return {registrationId,eventRegistrationId};
 });
 return {t,...ids};
}
it("requires server authorization and atomically excludes concurrent claims",async()=>{
 const {t,eventRegistrationId}=await setup();
 await expect(t.mutation(api.events.claimRegistrationReceivedEmail,{eventRegistrationId,adminSecret:"bad",token:"a"})).rejects.toThrow("Unauthorized");
 const args={eventRegistrationId,adminSecret:secret,token:"a"};
 const claims=await Promise.all([t.mutation(api.events.claimRegistrationReceivedEmail,args),t.mutation(api.events.claimRegistrationReceivedEmail,{...args,token:"b"})]);
 expect(claims.filter(x=>x.claimed)).toHaveLength(1);
 expect(await t.run(ctx=>ctx.db.get(eventRegistrationId))).not.toHaveProperty("registrationReceivedEmailSentAt");
});
it("crashed claim recovers with stable payload/key; stale ownership cannot complete",async()=>{
 const {t,eventRegistrationId}=await setup();
 const args={eventRegistrationId,adminSecret:secret,token:"a"};
 const first=await t.mutation(api.events.claimRegistrationReceivedEmail,args);
 await t.run(async ctx=>{const d=await ctx.db.query("receiptDeliveries").first();await ctx.db.patch(d!._id,{leaseUntil:0});});
 const retry=await t.mutation(api.events.claimRegistrationReceivedEmail,{...args,token:"b"});
 expect(retry.key).toBe(first.key);
 await t.mutation(api.events.recordRegistrationReceivedEmailFailure,{...args,key:first.key!});
 expect((await t.run(ctx=>ctx.db.get(eventRegistrationId)))?.registrationReceivedEmailSentAt).toBeUndefined();
 await t.mutation(api.events.recordRegistrationReceivedEmailFailure,{...args,token:"b",key:first.key!});
 expect((await t.mutation(api.events.claimRegistrationReceivedEmail,args)).claimed).toBe(false);
});
it("stops uncertain delivery before provider dedupe expiry and never sends approval",async()=>{
 const {t,eventRegistrationId}=await setup();
 const args={eventRegistrationId,adminSecret:secret,token:"a"};
 await t.mutation(api.events.claimRegistrationReceivedEmail,args);
 await t.run(async ctx=>{const d=await ctx.db.query("receiptDeliveries").first();await ctx.db.patch(d!._id,{leaseUntil:0,firstAttemptAt:Date.now()-24*3600000});});
 expect((await t.mutation(api.events.claimRegistrationReceivedEmail,args)).error).toContain("manual reconciliation");
 await t.run(ctx=>ctx.db.patch(eventRegistrationId,{registrationStatus:"approved"}));
 expect((await t.mutation(api.events.claimRegistrationReceivedEmail,args)).claimed).toBe(false);
});
it("old checkout attempt cannot send new rejoin receipt",async()=>{
 const {t,eventRegistrationId}=await setup();
 expect((await t.mutation(api.events.claimRegistrationReceivedEmail,{eventRegistrationId,adminSecret:secret,token:"a",receiptAttempt:0})).claimed).toBe(false);
});
it("welcome retries preserve token URL and exclude concurrent sends",async()=>{
 const {t,registrationId}=await setup();
 await t.run(ctx=>ctx.db.insert("checkoutLinks",{registrationId,stripeSessionId:"cs_one",createdAt:1}));
 const args={stripeSessionId:"cs_one",adminSecret:secret,token:"a",profileUrl:"https://example.invalid/token-one",tokenHash:"one"};
 const first=await t.mutation(api.registrations.claimWelcomeReceipt,args);
 expect(first.claimed).toBe(true);
 expect((await t.mutation(api.registrations.claimWelcomeReceipt,{...args,token:"b"})).claimed).toBe(false);
 await t.mutation(api.registrations.finishWelcomeReceipt,{stripeSessionId:"cs_one",adminSecret:secret,token:"a",error:"retry"});
 const retry=await t.mutation(api.registrations.claimWelcomeReceipt,{...args,token:"b",profileUrl:"changed",tokenHash:"two"});
 expect(retry.profileUrl).toBe(first.profileUrl);
 expect(await t.run(ctx=>ctx.db.query("applicantLoginTokens").collect())).toHaveLength(1);
});

it("overlapping event checkouts retain immutable links after latest session changes",async()=>{
 const {t}=await setup();
 const eventCodes=await t.run(async ctx=>{
  const event=await ctx.db.query("events").first();
  const { _id, _creationTime, ...fields }=event!;
  void _id; void _creationTime;
  await ctx.db.insert("events",{...fields,eventCode:"two"});
  return ["one","two"];
 });
 const args={name:"New",email:"new@example.invalid",age:28,gender:"male" as const,maritalStatus:"single",education:"College",job:"Job",phone:"999"};
 const registrationId=await t.mutation(api.registrations.create,{...args,eventCode:eventCodes[0],stripeSessionId:"cs_first"});
 await t.mutation(api.registrations.create,{...args,eventCode:eventCodes[1],stripeSessionId:"cs_second"});
 const first=await t.query(api.registrations.resolveCheckoutReceipt,{stripeSessionId:"cs_first",adminSecret:secret});
 const second=await t.query(api.registrations.resolveCheckoutReceipt,{stripeSessionId:"cs_second",adminSecret:secret});
 expect(first?.registrationId).toBe(registrationId);
 expect(first?.eventRegistrationId).not.toBe(second?.eventRegistrationId);
 expect((await t.query(api.registrations.getByStripeSession,{stripeSessionId:"cs_first"}))?._id).toBe(registrationId);
 await t.mutation(api.registrations.updatePaymentStatus,{stripeSessionId:"cs_first",paymentStatus:"paid"});
 expect((await t.query(api.registrations.getById,{id:registrationId}))?.paymentStatus).toBe("paid");
});

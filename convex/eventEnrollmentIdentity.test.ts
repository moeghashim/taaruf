import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { modules } from "./test.setup";
import { api, internal } from "./_generated/api";
import { enrollmentForEvent, enrollmentsForRegistration } from "./eventEnrollmentIdentity";
import { countCapacityUsed, promoteWaitlist } from "./eventCapacity";
import { hasApprovedEventAttendance } from "./eventRules";
process.env.ATTENDANCE_ADMIN_SECRET ??= "synthetic-admin-test";
const adminSecret = process.env.ATTENDANCE_ADMIN_SECRET;
async function fixture() {
 const t = convexTest(schema, modules);
 const ids = await t.run(async ctx => {
  const profile = { name: "Synthetic", age: 30, gender: "male" as const, maritalStatus: "single", education: "College", job: "Engineer", phone: "555", status: "approved" as const, paymentStatus: "paid" as const, createdAt: Date.now(), profileCompletionStatus: "completed" as const };
  const source = await ctx.db.insert("registrations", { ...profile, email: "source@example.invalid" });
  const target = await ctx.db.insert("registrations", { ...profile, email: "target@example.invalid" });
  const eventId = await ctx.db.insert("events", { title: "Synthetic", eventCode: "synthetic", eventMonth: "2026-12", series: "1plus1_match", location: "Test", startsAt: Date.now()+100000, endsAt: Date.now()+200000, status: "scheduled", maleCapacity: 1, femaleCapacity: 1, createdAt: 1, updatedAt: 1 });
  const base = { eventId, gender: "male" as const, registrationStatus: "approved" as const, confirmationStatus: "confirmed" as const, attendanceStatus: "attended" as const, eligibilityStatus: "approved_member" as const, createdAt: 1, updatedAt: 1 };
  const winner = await ctx.db.insert("eventRegistrations", { ...base, registrationId: target });
  const loser = await ctx.db.insert("eventRegistrations", { ...base, registrationId: source, supersededBy: winner, mergedIntoRegistrationId: target });
  return {source,target,eventId,winner,loser};
 }); return { t, ...ids };
}
test("superseded enrollment neither counts, qualifies, expires, promotes, nor accepts direct mutations", async () => {
 const {t,source,eventId,winner,loser}=await fixture();
 await t.run(async ctx => {
  expect(await countCapacityUsed(ctx,eventId,"male")).toBe(1);
  expect(await hasApprovedEventAttendance(ctx,eventId,source)).toBe(false);
  await ctx.db.patch(loser,{ registrationStatus:"waitlisted", confirmationStatus:"not_confirmed", confirmationExpiresAt:1 });
  await ctx.db.patch(winner,{registrationStatus:"withdrawn"});
  await promoteWaitlist(ctx,eventId,"male");
  expect((await ctx.db.get(loser))?.registrationStatus).toBe("waitlisted");
 });
 await t.mutation(internal.events.expireUnconfirmed,{});
 for (const [fn,args] of [
  [api.events.updateAttendanceStatus,{attendanceStatus:"attended"}],
  [api.events.updateRegistrationStatus,{registrationStatus:"pending"}],
  [api.events.updateRegistrationConfirmation,{confirmationStatus:"confirmed"}],
  [api.events.forceRegisterWaitlisted,{confirmCapacityOverride:true}],
  [api.events.requestConfirmation,{}],
  [api.events.claimEventRegistrationEmail,{kind:"reminder"}],
  [api.events.claimRegistrationReceivedEmail,{token:"synthetic"}],
 ] as const) await expect(t.mutation(fn,{adminSecret,eventRegistrationId:loser,...args} as never)).rejects.toThrow(/superseded/);
 expect((await t.run(ctx=>ctx.db.get(loser)))?.registrationStatus).toBe("waitlisted");
});
test("canonical association exposes nonduplicate history while preserving original ownership on restore",async()=>{
 const {t,source,target,eventId,winner,loser}=await fixture();
 await t.run(async ctx=>{
  await ctx.db.delete(winner);
  await ctx.db.patch(loser,{supersededBy:undefined,registrationStatus:"withdrawn"});
  expect((await enrollmentForEvent(ctx,eventId,target))?._id).toBe(loser);
  expect(await enrollmentsForRegistration(ctx,source)).toEqual([]);
  expect((await enrollmentsForRegistration(ctx,target)).map(r=>r._id)).toEqual([loser]);
 });
 await t.mutation(api.events.addRegistration,{adminSecret,registrationId:target,eventId});
 const row=await t.run(ctx=>ctx.db.get(loser));
 expect(row?.registrationId).toBe(source);
 expect(row?.mergedIntoRegistrationId).toBe(target);
 expect(row?.registrationStatus).toBe("pending");
 const history=await t.query(api.events.getByRegistration,{adminSecret,registrationId:target});
 expect(history.map(r=>r._id)).toEqual([loser]);
});
test("claims made before supersession cannot pass pre-send validation",async()=>{
 const {t,winner,loser}=await fixture();
 await t.run(ctx=>ctx.db.patch(loser,{supersededBy:undefined,registrationStatus:"pending"}));
 const claim=await t.mutation(api.events.claimRegistrationReceivedEmail,{adminSecret,eventRegistrationId:loser,token:"test"});
 const mail=await t.mutation(api.events.claimEventRegistrationEmail,{adminSecret,eventRegistrationId:loser,kind:"reminder"});
 await t.run(ctx=>ctx.db.patch(loser,{supersededBy:winner}));
 await expect(t.mutation(api.events.validateRegistrationReceivedEmail,{adminSecret,eventRegistrationId:loser,key:claim.key!,token:"test"})).rejects.toThrow();
 await expect(t.mutation(api.events.validateEventRegistrationEmail,{adminSecret,emailId:mail.emailId!})).rejects.toThrow(/superseded/);
});

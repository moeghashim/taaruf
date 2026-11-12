import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

afterEach(() => vi.unstubAllEnvs());
async function fixture() {
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "selection-secret");
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const now = Date.now();
    const fields = { title: "Selected", eventCode: "selected", eventMonth: "2026-11", series: "1plus1_match", location: "Test", startsAt: now - 2000, endsAt: now - 1000, status: "completed" as const, maleCapacity: 60, femaleCapacity: 60, createdAt: now, updatedAt: now };
    const event = await ctx.db.insert("events", fields);
    const other = await ctx.db.insert("events", { ...fields, eventCode: "other", title: "Other", startsAt: now + 10000, endsAt: now + 20000, status: "scheduled" });
    const person = { name: "Sender", age: 30, gender: "male" as const, maritalStatus: "single" as const, education: "College", job: "Engineer", email: "sender@test.com", phone: "555", status: "approved" as const, paymentStatus: "paid" as const, profileCompletionStatus: "completed" as const, createdAt: now };
    const sender = await ctx.db.insert("registrations", { ...person, publicApplicantNumber: 1 });
    const recipient = await ctx.db.insert("registrations", { ...person, name: "Recipient", gender: "female", publicApplicantNumber: 2 });
    await ctx.db.insert("applicantSessions", { registrationId: sender, sessionHash: "selection-session", expiresAt: now + 86400000, createdAt: now });
    const roster = { registrationId: sender, gender: "male" as const, registrationStatus: "approved" as const, confirmationStatus: "confirmed" as const, attendanceStatus: "attended" as const, eligibilityStatus: "approved_member" as const, createdAt: now, updatedAt: now };
    const row = await ctx.db.insert("eventRegistrations", { ...roster, eventId: event });
    const otherRow = await ctx.db.insert("eventRegistrations", { ...roster, eventId: other });
    await ctx.db.insert("applicantSessions", { registrationId:recipient,sessionHash:"recipient-session",expiresAt:now+86400000,createdAt:now }); await ctx.db.insert("eventRegistrations", {...roster,eventId:event,registrationId:recipient,gender:"female"}); return { event, other, sender, recipient, row, otherRow };
  });
  const toggle = (eventId = ids.event, enabled = true) => t.mutation(api.events.setInterestSubmissionsEnabled, { eventId, enabled, adminSecret: "selection-secret" });
  const dashboard = () => t.query(api.applicantInterests.getDashboard, { sessionHash: "selection-session" });
  const submit = (expectedEventId = ids.event) => t.mutation(api.applicantInterests.submitInterestNumber, { photoConsent: "no", expectedEventId, sessionHash: "selection-session", applicantNumber: 2, applicantName: "Recipient" });
  return { t, ...ids, toggle, dashboard, submit };
}


const reverse = (f: Awaited<ReturnType<typeof fixture>>) => f.t.mutation(api.applicantInterests.submitInterestNumber, {expectedEventId:f.event,sessionHash:"recipient-session",applicantNumber:1,applicantName:"Sender"});
const snapshot = (f: Awaited<ReturnType<typeof fixture>>) => f.t.run(async ctx => ({interests:await ctx.db.query("interests").collect(),flows:await ctx.db.query("interestFlows").collect(),events:await ctx.db.query("interestFlowEvents").collect(),deliveries:await ctx.db.query("femaleWorkflowDeliveries").collect(),matches:await ctx.db.query("matches").collect()}));
test("visible inbound intercepts repeated sends without writes",async()=>{
 const f=await fixture();await f.toggle();const first=await f.submit();const before=await snapshot(f);
 for(let i=0;i<3;i++) expect(await reverse(f)).toMatchObject({existingInbound:{interestId:first.interestId,route:"connection"},inboundInterestNotification:null});
 expect(await snapshot(f)).toEqual(before);
});
test("shared female review intercepts male send without writes",async()=>{
 const f=await fixture();await f.toggle();const first=await reverse(f);
 await f.t.mutation(api.femaleInterestWorkflow.createReview,{adminSecret:"selection-secret",interestId:first.interestId,reviewTokenHash:"a".repeat(64)});
 const before=await snapshot(f);expect(await f.submit()).toMatchObject({existingInbound:{interestId:first.interestId,route:"femaleReview"},inboundInterestNotification:null});expect(await snapshot(f)).toEqual(before);
});
test("hidden female submission does not affect male response or reveal history",async()=>{
 const f=await fixture();await f.toggle();const hidden=await reverse(f);const result=await f.submit();
 expect(result).not.toHaveProperty("existingInbound");expect(result.interestId).not.toBe(hidden.interestId);expect(result.inboundInterestNotification).toEqual({interestId:result.interestId});
 expect(await f.t.query(api.femaleInterestWorkflow.getDashboard,{sessionHash:"selection-session"})).toEqual([]);expect((await snapshot(f)).matches).toEqual([]);
});
test("cross event never intercepts",async()=>{
 const f=await fixture();await f.toggle();const first=await f.submit();await f.t.run(ctx=>ctx.db.patch(first.interestId,{eventId:f.other}));expect(await reverse(f)).not.toHaveProperty("existingInbound");
});
test.each(["declined","closed","withdrawn"] as const)("%s is not resurrected",async status=>{
 const f=await fixture();await f.toggle();const first=await f.submit();await f.t.run(ctx=>ctx.db.patch(first.interestId,{status}));expect(await reverse(f)).not.toHaveProperty("existingInbound");
});
test("reset is not intercepted",async()=>{
 const f=await fixture();await f.toggle();const first=await f.submit();await f.t.run(ctx=>ctx.db.patch(first.interestId,{testReset:{at:Date.now(),actor:"admin",reason:"test"}}));expect(await reverse(f)).not.toHaveProperty("existingInbound");
});
test.each(["expired","revoked"])("%s initial share cannot grant access",async kind=>{
 const f=await fixture();await f.toggle();const first=await reverse(f);await f.t.mutation(api.femaleInterestWorkflow.createReview,{adminSecret:"selection-secret",interestId:first.interestId,reviewTokenHash:"a".repeat(64)});
 if(kind==="revoked") await f.t.mutation(api.femaleInterestWorkflow.revokeReview,{adminSecret:"selection-secret",interestId:first.interestId});
 else await f.t.run(async ctx=>{const row=(await ctx.db.get(first.interestId))!;await ctx.db.patch(row._id,{femaleWorkflow:{...row.femaleWorkflow!,reviewExpiresAt:Date.now()-1}});});
 expect(await f.submit()).not.toHaveProperty("existingInbound");
});
test("archived sender cannot be disclosed",async()=>{
 const f=await fixture();await f.toggle();await f.submit();await f.t.run(ctx=>ctx.db.patch(f.sender,{archivedAt:Date.now()}));await expect(reverse(f)).rejects.toThrow("verified");
});
test("intercept consumes no slot even at quota",async()=>{
 const f=await fixture();await f.toggle();const first=await f.submit();
 await f.t.run(async ctx=>{for(let i=0;i<3;i++) await ctx.db.insert("interests",{fromRegistrationId:f.recipient,toRegistrationId:f.sender,eventId:f.event,source:"platform_submission",status:"closed",visibility:"internal_only",createdAt:Date.now(),updatedAt:Date.now()});});
 const before=await snapshot(f);expect(await reverse(f)).toMatchObject({existingInbound:{interestId:first.interestId}});expect(await snapshot(f)).toEqual(before);
});

test("accepted female review remains viewable after invitation expiry",async()=>{
 const f=await fixture();await f.toggle();const first=await reverse(f);
 await f.t.mutation(api.femaleInterestWorkflow.createReview,{adminSecret:"selection-secret",interestId:first.interestId,reviewTokenHash:"a".repeat(64)});
 await f.t.mutation(api.femaleInterestWorkflow.respond,{sessionHash:"selection-session",interestId:first.interestId,decision:"accept"});
 await f.t.run(async ctx=>{const row=(await ctx.db.get(first.interestId))!;await ctx.db.patch(row._id,{femaleWorkflow:{...row.femaleWorkflow!,reviewExpiresAt:Date.now()-1}});});
 expect(await f.t.query(api.femaleInterestWorkflow.getReviewAccess,{sessionHash:"selection-session",interestId:first.interestId})).toHaveProperty("profile");
 const before=await snapshot(f);expect(await f.submit()).toMatchObject({existingInbound:{interestId:first.interestId}});expect(await snapshot(f)).toEqual(before);
});
test("hidden reciprocal joins only after both final approvals and retains hidden history",async()=>{
 const f=await fixture();await f.toggle();const female=await reverse(f);const male=await f.submit();
 await f.t.mutation(api.applicantInterests.respondToInbound,{sessionHash:"recipient-session",interestId:male.interestId,decision:"accept"});
 expect((await snapshot(f)).matches).toHaveLength(0);
 await f.t.mutation(api.applicantInterests.giveFinalApproval,{sessionHash:"selection-session",interestId:male.interestId,approved:true});
 expect((await snapshot(f)).matches).toHaveLength(0);
 await f.t.mutation(api.applicantInterests.giveFinalApproval,{sessionHash:"recipient-session",interestId:male.interestId,approved:true});
 const state=await snapshot(f);expect(state.matches).toHaveLength(1);expect(state.matches[0].contactGate).toBe("pending_admin_approval");
 for(const row of state.interests) expect(row).toMatchObject({status:"converted_to_match",matchId:state.matches[0]._id});
 expect(state.interests.find(row=>row._id===female.interestId)?.femaleWorkflow?.state).toBe("private_documented");
 expect(await f.t.query(api.femaleInterestWorkflow.getDashboard,{sessionHash:"selection-session"})).toEqual([]);
});

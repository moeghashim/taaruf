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


test.each(["sister", "brother"])("prior reset rows must not suppress new share-time mutual: %s first", async order => {
 const f=await fixture();await f.toggle();
 // Historical rows are retained for audit, as on the deployed test pair.
 await f.t.run(async ctx=>{for(const [from,to] of [[f.sender,f.recipient],[f.recipient,f.sender]])for(let n=0;n<4;n++)await ctx.db.insert("interests",{fromRegistrationId:from,toRegistrationId:to,eventId:f.event,source:"platform_submission",status:"closed",visibility:"internal_only",testReset:{at:Date.now(),actor:"admin",reason:"test"},createdAt:Date.now()-1000,updatedAt:Date.now()-1000});});
 let male,female;if(order==="sister"){female=await reverse(f);male=await f.submit();}else{male=await f.submit();female=await reverse(f);}
 await f.t.mutation(api.femaleInterestWorkflow.createReview,{adminSecret:"selection-secret",interestId:female.interestId,reviewTokenHash:"a".repeat(64)});
 expect((await snapshot(f)).interests.find(i=>i._id===male.interestId)?.canonicalInterestId).toBe(female.interestId);
 for(const sessionHash of ["selection-session","recipient-session"])expect((await f.t.query(api.femaleInterestWorkflow.getDashboard,{sessionHash}))[0]).toMatchObject({mutualInterest:true});
 expect((await f.t.query(api.applicantInterests.getDashboard,{sessionHash:"recipient-session"})).inbound).toEqual([]);
 expect((await f.t.query(api.applicantInterests.getDashboard,{sessionHash:"recipient-session"})).privateDocumented[0]).toMatchObject({receiptOnly:true,counterparty:null});
});

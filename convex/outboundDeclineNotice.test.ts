import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { outboundDeclineCount } from "./outboundDeclineNotice";
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


for (const mode of ["ordinary", "female", "mutual"] as const) for (const stage of ["initial", "final"] as const) for (const actor of ["brother", "sister"] as const) {
 if(stage === "initial" && actor !== (mode === "ordinary" ? "sister" : "brother")) continue;
 test(mode+" "+stage+" declined by "+actor+": only actual outbound sender receives anonymous count", async()=>{
  const f=await fixture();await f.toggle();
  const id=mode === "ordinary" ? (await f.submit()).interestId : (await reverse(f)).interestId;
  if(mode === "mutual") await f.submit();
  if(mode !== "ordinary") await f.t.mutation(api.femaleInterestWorkflow.createReview,{adminSecret:"selection-secret",interestId:id,reviewTokenHash:"a".repeat(64)});
  const sessionHash=actor === "brother" ? "selection-session" : "recipient-session";
  if(mode === "ordinary") {
   if(stage === "final") await f.t.mutation(api.applicantInterests.respondToInbound,{sessionHash:"recipient-session",interestId:id,decision:"accept"});
   if(stage === "initial") await f.t.mutation(api.applicantInterests.respondToInbound,{sessionHash,interestId:id,decision:"decline"});
   else await f.t.mutation(api.applicantInterests.giveFinalApproval,{sessionHash,interestId:id,approved:false});
  } else {
   if(stage === "final") await f.t.mutation(api.femaleInterestWorkflow.respond,{sessionHash:"selection-session",interestId:id,decision:"accept"});
   if(stage === "initial") await f.t.mutation(api.femaleInterestWorkflow.respond,{sessionHash,interestId:id,decision:"decline"});
   else if(actor === "brother") await f.t.mutation(api.femaleInterestWorkflow.brotherFinal,{sessionHash,interestId:id,approved:false});
   else await f.t.mutation(api.femaleInterestWorkflow.confirm,{sessionHash,interestId:id,confirmed:false});
  }
  const before=await snapshot(f);
  for(const [who,key] of [["brother","selection-session"],["sister","recipient-session"]] as const){
   const d=await f.t.query(api.applicantInterests.getDashboard,{sessionHash:key});
   const expected=who!==actor&&(mode === "mutual" || who === (mode === "ordinary" ? "brother" : "sister"));
   expect(d.outboundDeclineCount).toBe(expected ? 1 : 0);
   expect(typeof d.outboundDeclineCount).toBe("number");
   expect(d.history.length>0).toBe(who===actor);
   if(expected){expect(d.inbound).toEqual([]);expect(d.outbound).toEqual([]);expect(d.privateDocumented).toEqual([]);expect(d.history).toEqual([]);}
  }
  expect(await snapshot(f)).toEqual(before);
 });
}
for(const who of ["brother","sister"] as const)test("withdrawal stays concealed: "+who,async()=>{
 const f=await fixture();await f.toggle();const id=who==="brother"?(await f.submit()).interestId:(await reverse(f)).interestId;
 await f.t.mutation(api.applicantInterests.withdrawOutbound,{sessionHash:who==="brother"?"selection-session":"recipient-session",interestId:id});
 for(const sessionHash of ["selection-session","recipient-session"])expect((await f.t.query(api.applicantInterests.getDashboard,{sessionHash})).outboundDeclineCount).toBe(0);
});
for(const reason of ["missing-audit","admin","expiry","reset","reopened","wrong-flow","wrong-actor","tied-admin","cancelled-event"] as const)test("negative provenance: "+reason,async()=>{
 const f=await fixture();await f.toggle();const id=(await f.submit()).interestId;
 await f.t.mutation(api.applicantInterests.respondToInbound,{sessionHash:"recipient-session",interestId:id,decision:"decline"});
 await f.t.run(async ctx=>{
  const flow=(await ctx.db.query("interestFlows").withIndex("by_interestId",q=>q.eq("interestId",id)).unique())!;
  const events=await ctx.db.query("interestFlowEvents").withIndex("by_interestId",q=>q.eq("interestId",id)).collect();const last=Math.max(...events.map(e=>e.createdAt));
  if(reason==="missing-audit")for(const e of events)await ctx.db.delete(e._id);
  else if(reason==="reset")await ctx.db.patch(id,{testReset:{at:last+1,actor:"admin",reason:"Synthetic"}});
  else if(reason==="cancelled-event")await ctx.db.patch(f.event,{status:"cancelled"});
  else if(reason==="wrong-flow")await ctx.db.patch(flow._id,{fromRegistrationId:f.recipient,toRegistrationId:f.sender});
  else if(reason==="wrong-actor") { for(const e of events) if(e.eventType==="inbound_declined") await ctx.db.patch(e._id,{actorRegistrationId:f.sender}); }
  else await ctx.db.insert("interestFlowEvents",{interestId:id,interestFlowId:flow._id,actor:"admin",eventType:reason==="expiry"?"review_expired":reason==="reopened"?"admin_submission_reopened":"admin_connection_closed",createdAt:reason==="tied-admin"?last:last+1});
 });
 expect((await f.dashboard()).outboundDeclineCount).toBe(0);
});

for(const reason of ["duplicate-alias","alias-reset","canonical-reset","wrong-event","withdrawn-alias","missing-share","missing-canonical-time"] as const)test("mutual negative: "+reason,async()=>{
 const f=await fixture();await f.toggle();const female=await reverse(f);const male=await f.submit();
 await f.t.mutation(api.femaleInterestWorkflow.createReview,{adminSecret:"selection-secret",interestId:female.interestId,reviewTokenHash:"a".repeat(64)});
 await f.t.mutation(api.femaleInterestWorkflow.respond,{sessionHash:"selection-session",interestId:female.interestId,decision:"accept"});
 await f.t.mutation(api.femaleInterestWorkflow.confirm,{sessionHash:"recipient-session",interestId:female.interestId,confirmed:false});
 expect((await f.dashboard()).outboundDeclineCount).toBe(1);
 await f.t.run(async ctx=>{
  const alias=(await ctx.db.get(male.interestId))!,canonical=(await ctx.db.get(female.interestId))!;
  if(reason==="duplicate-alias"){const {_id,_creationTime,...data}=alias;void _id;void _creationTime;await ctx.db.insert("interests",data);}
  else if(reason==="alias-reset"||reason==="canonical-reset")await ctx.db.patch(reason==="alias-reset"?alias._id:canonical._id,{testReset:{at:Date.now(),actor:"admin",reason:"Synthetic"}});
  else if(reason==="wrong-event")await ctx.db.patch(alias._id,{eventId:f.other});
  else if(reason==="withdrawn-alias")await ctx.db.patch(alias._id,{status:"withdrawn"});
  else if(reason==="missing-canonical-time")await ctx.db.patch(alias._id,{canonicalizedAt:undefined});
  else await ctx.db.patch(canonical._id,{femaleWorkflow:{...canonical.femaleWorkflow!,reviewTokenHash:undefined}});
 });
 expect((await f.dashboard()).outboundDeclineCount).toBe(0);
});

for(const sender of ["brother","sister"] as const)test("aggregate two genuine declines, zero hidden, no identity payload: "+sender,async()=>{
 const f=await fixture();await f.toggle();
 const third=await f.t.run(async ctx=>{
  const original=(await ctx.db.get(sender==="brother"?f.recipient:f.sender))!;
  const {_id,_creationTime,...fields}=original;void _id;void _creationTime;
  const id=await ctx.db.insert("registrations",{...fields,name:"Counterpart secret three",email:"third@synthetic.invalid",publicApplicantNumber:3});
  await ctx.db.insert("applicantSessions",{registrationId:id,sessionHash:"third-session",expiresAt:Date.now()+86400000,createdAt:Date.now()});
  const roster=(await ctx.db.get(f.row))!;const {_id:r,_creationTime:c,...rr}=roster;void r;void c;
  await ctx.db.insert("eventRegistrations",{...rr,registrationId:id,gender:original.gender});return id;
 });void third;
 const sessionHash=sender==="brother"?"selection-session":"recipient-session";
 expect((await f.t.query(api.applicantInterests.getDashboard,{sessionHash})).outboundDeclineCount).toBe(0);
 for(const number of [sender==="brother"?2:1,3]){
  const submitted=await f.t.mutation(api.applicantInterests.submitInterestNumber,{expectedEventId:f.event,sessionHash,applicantNumber:number});
  const recipientSession=number===3?"third-session":sender==="brother"?"recipient-session":"selection-session";
  if(sender==="brother")await f.t.mutation(api.applicantInterests.respondToInbound,{sessionHash:recipientSession,interestId:submitted.interestId,decision:"decline"});
  else {await f.t.mutation(api.femaleInterestWorkflow.createReview,{adminSecret:"selection-secret",interestId:submitted.interestId,reviewTokenHash:"a".repeat(64)});await f.t.mutation(api.femaleInterestWorkflow.respond,{sessionHash:recipientSession,interestId:submitted.interestId,decision:"decline"});}
 }
 const d=await f.t.query(api.applicantInterests.getDashboard,{sessionHash});expect(d.outboundDeclineCount).toBe(2);expect(Number.isSafeInteger(d.outboundDeclineCount)).toBe(true);expect(d.history).toEqual([]);expect(d.outbound).toEqual([]);expect(d.privateDocumented).toEqual([]);expect(JSON.stringify(d)).not.toContain("Counterpart secret three");expect(JSON.stringify(d)).not.toContain("third@synthetic.invalid");
});

test("canonical aliases and repeated outgoing projection count once",async()=>{
 const f=await fixture();await f.toggle();const female=await reverse(f);const male=await f.submit();
 await f.t.mutation(api.femaleInterestWorkflow.createReview,{adminSecret:"selection-secret",interestId:female.interestId,reviewTokenHash:"a".repeat(64)});
 await f.t.mutation(api.femaleInterestWorkflow.respond,{sessionHash:"selection-session",interestId:female.interestId,decision:"accept"});
 await f.t.mutation(api.femaleInterestWorkflow.confirm,{sessionHash:"recipient-session",interestId:female.interestId,confirmed:false});
 await f.t.run(async ctx=>{const alias=(await ctx.db.get(male.interestId))!,canonical=(await ctx.db.get(female.interestId))!;expect(await outboundDeclineCount(ctx,[alias,canonical,alias],f.sender)).toBe(1);});
});

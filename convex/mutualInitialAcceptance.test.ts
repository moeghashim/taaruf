import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
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


async function shared(mutual=true) {
 const f=await fixture(); await f.toggle(); const female=await reverse(f); if(mutual)await f.submit();
 await f.t.mutation(api.femaleInterestWorkflow.createReview,{adminSecret:"selection-secret",interestId:female.interestId,reviewTokenHash:"a".repeat(64)});
 const respond=(who:string,decision:"accept"|"decline"="accept")=>f.t.mutation(api.femaleInterestWorkflow.respond,{sessionHash:who,interestId:female.interestId,decision});
 const access=(who:string)=>f.t.query(api.femaleInterestWorkflow.getReviewAccess,{sessionHash:who,interestId:female.interestId});
 return {...f,id:female.interestId,respond,access};
}
const sister="recipient-session",brother="selection-session";
test.each([sister,brother,"concurrent"])("independent initials, separate finals, explicit release: %s first",async order=>{
 const f=await shared();
 for(const who of [sister,brother])expect(await f.access(who)).toMatchObject({ownInitialDecision:"pending",ownActionStage:"initial",ownDecision:"pending",profile:{email:null,phone:null,imageUrls:[]}});
 if(order==="concurrent")await Promise.all([f.respond(sister),f.respond(brother)]);
 else {
  await f.respond(order);
  expect(await f.access(order)).toMatchObject({ownInitialDecision:"accepted",ownActionStage:null,ownDecision:"pending"});
  expect(await f.access(order===sister?brother:sister)).toMatchObject({ownInitialDecision:"pending",ownActionStage:"initial"});
  await expect(f.t.mutation(api.femaleInterestWorkflow.confirm,{sessionHash:sister,interestId:f.id,confirmed:true})).rejects.toThrow();
  await expect(f.t.mutation(api.femaleInterestWorkflow.brotherFinal,{sessionHash:brother,interestId:f.id,approved:true})).rejects.toThrow();
  expect((await snapshot(f)).deliveries.filter(d=>d.kind==="final_request")).toHaveLength(0);
  await f.respond(order===sister?brother:sister);
 }
 const before=await snapshot(f);expect(before.matches).toHaveLength(0);
 expect(before.flows.every(x=>x.requesterFinalApproval==="pending"&&x.recipientFinalApproval==="pending")).toBe(true);
 for(const who of [sister,brother])expect(await f.access(who)).toMatchObject({ownActionStage:"final",ownDecision:"pending"});
 await Promise.all([f.respond(sister),f.respond(brother)]);expect(await snapshot(f)).toEqual(before);
 await f.t.mutation(api.femaleInterestWorkflow.confirm,{sessionHash:sister,interestId:f.id,confirmed:true});
 expect((await snapshot(f)).matches).toHaveLength(0);
 await f.t.mutation(api.femaleInterestWorkflow.brotherFinal,{sessionHash:brother,interestId:f.id,approved:true});
 expect((await snapshot(f)).matches[0].contactGate).toBe("pending_admin_approval");
 expect((await f.access(sister)).profile.email).toBeNull();
 await f.t.mutation(api.femaleInterestWorkflow.releaseContacts,{adminSecret:"selection-secret",interestId:f.id});
 expect((await f.access(sister)).profile.email).not.toBeNull();
});
test.each([sister,brother])("initial decline retains only actor closed history: %s",async who=>{
 const f=await shared();await f.respond(who,"decline");
 expect((await snapshot(f)).matches).toEqual([]);
 for(const person of [sister,brother]) {
  await expect(f.access(person)).rejects.toThrow();
  const rows=await f.t.query(api.femaleInterestWorkflow.getDashboard,{sessionHash:person});
  if(person===who)expect(rows).toMatchObject([{ownDecision:"declined",state:"closed",canView:false}]);else expect(rows).toEqual([]);
 }
 await expect(f.respond(who===sister?brother:sister)).rejects.toThrow();
});
test.each([sister,brother])("accept/decline concurrent closure cannot resurrect: %s declines",async who=>{
 const f=await shared();await Promise.allSettled([f.respond(who,"decline"),f.respond(who===sister?brother:sister)]);
 const state=await snapshot(f);expect(state.interests.every(i=>i.status==="declined")).toBe(true);expect(state.matches).toEqual([]);
 await expect(f.respond(who===sister?brother:sister)).rejects.toThrow();
});
test("existing brother acceptance and sister final are preserved, never synthesized into sister initial",async()=>{
 const f=await shared();const at=Date.now()-100;
 await f.t.run(async ctx=>{const row=(await ctx.db.get(f.id))!;await ctx.db.patch(f.id,{femaleWorkflow:{...row.femaleWorkflow!,state:"awaiting_sister_confirmation",brotherAcceptedAt:at,sisterConfirmedAt:at}});const flow=(await ctx.db.query("interestFlows").withIndex("by_interestId",q=>q.eq("interestId",f.id)).unique())!;await ctx.db.patch(flow._id,{recipientDecision:"accepted",requesterFinalApproval:"approved",requesterFinalApprovalAt:at,requesterExplicitFinalAt:at});});
 const before=await snapshot(f);expect(await f.access(sister)).toMatchObject({ownInitialDecision:"pending",ownDecision:"approved",ownActionStage:"initial"});expect(await snapshot(f)).toEqual(before);
 await expect(f.t.mutation(api.femaleInterestWorkflow.brotherFinal,{sessionHash:brother,interestId:f.id,approved:true})).rejects.toThrow();
 await f.respond(sister);
 const after=await snapshot(f);expect(after.flows.find(x=>x.interestId===f.id)?.requesterExplicitFinalAt).toBe(at);expect(after.interests.find(x=>x._id===f.id)?.femaleWorkflow?.sisterConfirmedAt).toBe(at);
 expect(after.matches).toEqual([]);
});
test("ordinary female workflow unchanged; sister cannot initial accept",async()=>{
 const f=await shared(false);await expect(f.respond(sister)).rejects.toThrow("Unauthorized");
 expect(await f.access(sister)).not.toHaveProperty("ownInitialDecision");
 await f.respond(brother);expect(await f.access(sister)).toMatchObject({ownActionStage:"final"});
 await f.t.mutation(api.femaleInterestWorkflow.confirm,{sessionHash:sister,interestId:f.id,confirmed:true});
 expect((await snapshot(f)).interests.find(x=>x._id===f.id)?.femaleWorkflow?.sisterInitialAcceptedAt).toBeUndefined();
});

test("released legacy mutual preserves finals and never fabricates sister initial",async()=>{
 const f=await shared();await legacy(f);await f.respond(sister);await f.respond(brother);
 await f.t.mutation(api.femaleInterestWorkflow.confirm,{sessionHash:sister,interestId:f.id,confirmed:true});
 await f.t.mutation(api.femaleInterestWorkflow.brotherFinal,{sessionHash:brother,interestId:f.id,approved:true});
 await f.t.mutation(api.femaleInterestWorkflow.releaseContacts,{adminSecret:"selection-secret",interestId:f.id});
 await f.t.run(async ctx=>{const row=(await ctx.db.get(f.id))!;await ctx.db.patch(f.id,{femaleWorkflow:{...row.femaleWorkflow!,sisterInitialAcceptedAt:undefined}});});
 const before=await snapshot(f);
 expect((await f.access(sister)).profile.shareableBio).toBe("Brother genuine bio sentinel");
 expect((await f.access(brother)).profile.shareableBio).toBe("Sister genuine bio sentinel");
 expect(await f.access(sister)).toMatchObject({ownInitialDecision:"pending",ownDecision:"approved",ownActionStage:null,state:"contacts_released"});
 await f.t.mutation(api.femaleInterestWorkflow.confirm,{sessionHash:sister,interestId:f.id,confirmed:true});
 await f.t.mutation(api.femaleInterestWorkflow.brotherFinal,{sessionHash:brother,interestId:f.id,approved:true});
 expect(await snapshot(f)).toEqual(before);
});
test.each([sister,brother])("accept then opposite decline serializes safely: %s accepts",async who=>{
 const f=await shared();await f.respond(who);await f.respond(who===sister?brother:sister,"decline");
 expect((await snapshot(f)).matches).toEqual([]);await expect(f.access(who)).rejects.toThrow();
});

async function legacy(f: Awaited<ReturnType<typeof shared>>, who = sister) {
 const at = Date.now()-100;
 await f.t.run(async ctx => {
  await ctx.db.patch(f.sender,{name:"Sender Family",shareableBio:"Brother genuine bio sentinel"});
  await ctx.db.patch(f.recipient,{name:"Recipient Family",shareableBio:"Sister genuine bio sentinel"});
  const row=(await ctx.db.get(f.id))!;
  await ctx.db.patch(f.id,{femaleWorkflow:{...row.femaleWorkflow!,state:"awaiting_sister_confirmation",...(who===sister?{brotherAcceptedAt:at,sisterConfirmedAt:at}:{sisterInitialAcceptedAt:at})}});
  const flow=(await ctx.db.query("interestFlows").withIndex("by_interestId",q=>q.eq("interestId",f.id)).unique())!;
  await ctx.db.patch(flow._id,{recipientDecision:"accepted",bioVisibleAt:at,...(who===sister?{requesterFinalApproval:"approved" as const,requesterFinalApprovalAt:at,requesterExplicitFinalAt:at}:{recipientFinalApproval:"approved" as const,recipientFinalApprovalAt:at,recipientExplicitFinalAt:at})});
 });return at;
}
test("legacy mutual hides real bios but retains separate brother first-name grant",async()=>{
 const f=await shared();await legacy(f);
 for(const who of [sister,brother]) {
  expect((await f.access(who)).profile.shareableBio).toBeNull();
  const dashboard=await f.t.query(api.applicantInterests.getDashboard,{sessionHash:who});
  expect(JSON.stringify(dashboard)).not.toContain("genuine bio sentinel");
 }
 expect((await f.access(brother)).profile.name).toBe("Recipient");
 await f.respond(sister);
 expect((await f.access(sister)).profile.shareableBio).toBe("Brother genuine bio sentinel");
 expect((await f.access(brother)).profile.shareableBio).toBe("Sister genuine bio sentinel");
});
test.each([sister,brother])("initial decline preserves explicit legacy final: %s",async who=>{
 const f=await shared();await legacy(f,who);const before=await snapshot(f);
 expect(await f.access(who)).toMatchObject({ownDecision:"approved",ownActionStage:"initial"});
 await f.respond(who,"decline");const after=await snapshot(f);
 expect(after.interests.every(i=>i.status==="declined")).toBe(true);
 for(const old of before.flows){const next=after.flows.find(x=>x._id===old._id)!;expect({...next,flowStatus:old.flowStatus,updatedAt:old.updatedAt}).toEqual(old);}
 expect(after.events).toEqual(expect.arrayContaining(before.events));
 for(const person of [sister,brother]){
  await expect(f.access(person)).rejects.toThrow();
  const rows=await f.t.query(api.femaleInterestWorkflow.getDashboard,{sessionHash:person});
  if(person===who)expect(rows).toMatchObject([{ownDecision:"declined",state:"closed",canView:false}]);else expect(rows).toEqual([]);
  const dashboard=await f.t.query(api.applicantInterests.getDashboard,{sessionHash:person});
  expect(dashboard.history.length).toBe(person===who?1:0);
 }
 await expect(f.respond(who)).rejects.toThrow();
 await expect(f.t.mutation(api.femaleInterestWorkflow.brotherFinal,{sessionHash:brother,interestId:f.id,approved:true})).rejects.toThrow();
 expect((await snapshot(f)).matches).toEqual([]);
});
test.each([0,-1,NaN,Infinity,Date.now()+86400000])("invalid initial %s fails closed and allows explicit repair",async at=>{
 const f=await shared();await legacy(f);
 await f.t.run(async ctx=>{const row=(await ctx.db.get(f.id))!;await ctx.db.patch(f.id,{femaleWorkflow:{...row.femaleWorkflow!,sisterInitialAcceptedAt:at}});});
 expect(await f.access(sister)).toMatchObject({ownInitialDecision:"pending",ownActionStage:"initial",profile:{shareableBio:null}});
 expect((await f.access(brother)).ownActionStage).toBeNull();
 await expect(f.t.mutation(api.femaleInterestWorkflow.brotherFinal,{sessionHash:brother,interestId:f.id,approved:true})).rejects.toThrow();
 await f.respond(sister);expect((await f.access(sister)).ownInitialDecision).toBe("accepted");
});
test("legacy queued sister confirmation fails claim, pre-send and retry before both initials",async()=>{
 const f=await shared();await legacy(f);vi.stubEnv("FEMALE_WORKFLOW_EMAIL_MODE","isolated");
 await f.t.run(async ctx=>{const row=(await ctx.db.get(f.id))!;await ctx.db.patch(f.id,{femaleWorkflow:{...row.femaleWorkflow!,sisterConfirmedAt:undefined}});});
 const id=await f.t.run(ctx=>ctx.db.insert("femaleWorkflowDeliveries",{interestId:f.id,recipientId:f.recipient,kind:"sister_confirmation",key:f.id+":test",status:"pending",attempts:0,nextAttemptAt:Date.now(),createdAt:Date.now()}));
 expect((await f.t.mutation(internal.femaleWorkflowDelivery.claim,{})).some(d=>d._id===id)).toBe(false);
 await f.t.run(ctx=>ctx.db.patch(id,{status:"sending",attempts:1,leaseUntil:Date.now()+60000,providerPayload:{from:"test@example.com",to:["sender@test.com"],subject:"test",text:"test"}}));
 expect(await f.t.mutation(internal.femaleWorkflowDelivery.authorizeSend,{id,attempt:1})).toBe(false);
 expect(await f.t.mutation(internal.femaleWorkflowDelivery.markAttempt,{id,attempt:1})).toBe(false);
 await f.t.run(ctx=>ctx.db.patch(id,{status:"failed"}));
 await expect(f.t.mutation(api.femaleInterestWorkflow.retryDelivery,{deliveryId:id,adminSecret:"selection-secret"})).rejects.toThrow("Sister confirmation unavailable");
 await f.respond(sister);
 await f.t.mutation(api.femaleInterestWorkflow.retryDelivery,{deliveryId:id,adminSecret:"selection-secret"});
 expect((await f.t.mutation(internal.femaleWorkflowDelivery.claim,{})).some(d=>d._id===id)).toBe(true);
});

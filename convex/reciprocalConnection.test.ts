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

test.each(["sister", "brother", "concurrent"])("independent until explicit share: %s first", async order => {
 const f=await fixture(); await f.toggle();
 let male, female;
 if(order==="concurrent") [male,female]=await Promise.all([f.submit(),reverse(f)]);
 else if(order==="sister") {female=await reverse(f);male=await f.submit();}
 else {male=await f.submit();female=await reverse(f);}
 const state=await snapshot(f); expect(state.interests).toHaveLength(2);expect(state.flows).toHaveLength(2);expect(state.matches).toHaveLength(0);
 expect(state.interests.every(i=>!i.canonicalInterestId)).toBe(true);
 for(const flow of state.flows) expect(flow).toMatchObject({recipientDecision:"pending",requesterFinalApproval:"pending",recipientFinalApproval:"pending"});
 expect(await f.submit()).toMatchObject({interestId:male.interestId,inboundInterestNotification:null});expect(await reverse(f)).toMatchObject({interestId:female.interestId});
 expect((await snapshot(f)).interests).toHaveLength(2);
 const before=await f.dashboard();expect(before.outbound[0]).toMatchObject({receiptOnly:false,canWithdraw:true});
 expect(before.outbound[0].counterparty).not.toBeNull();
 expect(JSON.stringify(before)).not.toContain(female.interestId);expect(JSON.stringify(before)).not.toContain("mutualInterest");
 expect((await f.t.query(api.applicantInterests.getDashboard,{sessionHash:"recipient-session"})).inbound[0]).toMatchObject({interestId:male.interestId,canRespond:true});
 expect(await f.t.query(api.femaleInterestWorkflow.getDashboard,{sessionHash:"selection-session"})).toEqual([]);
 await f.t.mutation(api.femaleInterestWorkflow.createReview,{adminSecret:"selection-secret",interestId:female.interestId,reviewTokenHash:"a".repeat(64)});
 expect((await snapshot(f)).interests.find(i=>i._id===male.interestId)?.canonicalInterestId).toBe(female.interestId);
 const shared=await snapshot(f);
 await f.t.mutation(api.femaleInterestWorkflow.createReview,{adminSecret:"selection-secret",interestId:female.interestId,reviewTokenHash:"a".repeat(64)});
 expect((await snapshot(f)).deliveries).toEqual(shared.deliveries);
 for(const call of [()=>f.t.mutation(api.applicantInterests.respondToInbound,{sessionHash:"recipient-session",interestId:male.interestId,decision:"accept"}),()=>f.t.mutation(api.interests.updateAdminStatus,{adminSecret:"selection-secret",id:male.interestId,adminStatus:"requested"})]) await expect(call()).rejects.toThrow();
 for(const sessionHash of ["selection-session","recipient-session"]) {
   expect((await f.t.query(api.femaleInterestWorkflow.getDashboard,{sessionHash}))[0]).toMatchObject({interestId:female.interestId,mutualInterest:true});
   expect(await f.t.query(api.femaleInterestWorkflow.getReviewAccess,{sessionHash,interestId:female.interestId})).toMatchObject({mutualInterest:true});
 }
 expect((await f.t.query(api.applicantInterests.getDashboard,{sessionHash:"recipient-session"})).privateDocumented[0]).toMatchObject({receiptOnly:true,counterparty:null});
 await expect(f.t.mutation(api.femaleInterestWorkflow.brotherFinal,{sessionHash:"selection-session",interestId:female.interestId,approved:true})).rejects.toThrow();
 await f.t.mutation(api.femaleInterestWorkflow.respond,{sessionHash:"selection-session",interestId:female.interestId,decision:"accept"});
 await Promise.all([f.t.mutation(api.femaleInterestWorkflow.brotherFinal,{sessionHash:"selection-session",interestId:female.interestId,approved:true}),f.t.mutation(api.femaleInterestWorkflow.confirm,{sessionHash:"recipient-session",interestId:female.interestId,confirmed:true})]);
 const done=await snapshot(f);expect(done.matches).toHaveLength(1);expect(done.matches[0]).toMatchObject({interestId:female.interestId,contactGate:"pending_admin_approval"});
 expect(done.interests.every(row=>row.matchId===done.matches[0]._id)).toBe(true);
 for(const flow of done.flows)expect(flow).toMatchObject({requesterFinalApproval:"approved",recipientFinalApproval:"approved"});
 expect(done.events.filter(e=>e.eventType==="explicit_final_approval_given")).toHaveLength(2);
 expect((await f.t.query(api.femaleInterestWorkflow.getReviewAccess,{sessionHash:"selection-session",interestId:female.interestId})).profile.email).toBeNull();
});
test.each(["sister","brother"])("withdraw %s refunds own receipt only; opposite stays actionable", async who=>{
 const f=await fixture();await f.toggle();const female=await reverse(f);const male=await f.submit();
 const otherId=who==="sister"?male.interestId:female.interestId;
 const before=(await snapshot(f)).interests.find(i=>i._id===otherId);
 await f.t.mutation(api.applicantInterests.withdrawOutbound,{sessionHash:who==="sister"?"recipient-session":"selection-session",interestId:who==="sister"?female.interestId:male.interestId});
 const state=await snapshot(f);expect(state.interests.filter(i=>i.slotReturnedAt!==undefined)).toHaveLength(1);
 expect(state.interests.find(i=>i._id===otherId)).toEqual(before);
 if(who==="sister") await f.t.mutation(api.applicantInterests.respondToInbound,{sessionHash:"recipient-session",interestId:male.interestId,decision:"accept"});
 else {
  await f.t.mutation(api.femaleInterestWorkflow.createReview,{adminSecret:"selection-secret",interestId:female.interestId,reviewTokenHash:"a".repeat(64)});
  expect(await f.t.query(api.femaleInterestWorkflow.getReviewAccess,{sessionHash:"selection-session",interestId:female.interestId})).not.toHaveProperty("mutualInterest");
 }
});
test("progressed visible history preserves redirect and never resets consent",async()=>{
 const f=await fixture();await f.toggle();const male=await f.submit();await f.t.mutation(api.applicantInterests.respondToInbound,{sessionHash:"recipient-session",interestId:male.interestId,decision:"accept"});const before=await snapshot(f);expect(await reverse(f)).toMatchObject({existingInbound:{interestId:male.interestId}});expect(await snapshot(f)).toEqual(before);
});

test("full quota exact retry preserves own expression",async()=>{
 const f=await fixture();await f.toggle();const female=await reverse(f);const male=await f.submit();
 await f.t.run(async ctx=>{const original=(await ctx.db.get(male.interestId))!;for(let n=0;n<2;n++)await ctx.db.insert("interests",{fromRegistrationId:f.sender,toRegistrationId:f.recipient,eventId:f.event,source:"platform_submission",status:"closed",visibility:"admin_actionable",createdAt:original.createdAt+1,updatedAt:Date.now()});});
 expect(await f.submit()).toMatchObject({interestId:male.interestId});expect(JSON.stringify(await f.submit())).not.toContain(female.interestId);
});
test("share/send race never creates alias after explicit share",async()=>{
 const f=await fixture();await f.toggle();const female=await reverse(f);
 await Promise.all([f.submit(),f.t.mutation(api.femaleInterestWorkflow.createReview,{adminSecret:"selection-secret",interestId:female.interestId,reviewTokenHash:"a".repeat(64)})]);
 const state=await snapshot(f);expect(state.interests.length).toBeLessThanOrEqual(2);expect(state.matches).toEqual([]);expect(state.flows.every(i=>i.recipientDecision==="pending")).toBe(true);
 if(state.interests.length===2)expect(state.interests.find(i=>i._id!==female.interestId)?.canonicalInterestId).toBe(female.interestId);
});
test("withdraw/share race is fail closed without extra refunds",async()=>{
 const f=await fixture();await f.toggle();const female=await reverse(f);const male=await f.submit();
 await Promise.allSettled([f.t.mutation(api.applicantInterests.withdrawOutbound,{sessionHash:"selection-session",interestId:male.interestId}),f.t.mutation(api.femaleInterestWorkflow.createReview,{adminSecret:"selection-secret",interestId:female.interestId,reviewTokenHash:"a".repeat(64)})]);
 const state=await snapshot(f);const withdrawn=state.interests.some(i=>i.status==="withdrawn");expect(state.interests.filter(i=>i.slotReturnedAt!==undefined).length).toBe(withdrawn?1:0);
 if(withdrawn)expect(await f.t.query(api.femaleInterestWorkflow.getReviewAccess,{sessionHash:"selection-session",interestId:female.interestId})).not.toHaveProperty("mutualInterest");
});
test.each(["declined","closed","withdrawn","reset","restored","accepted","photo"])("excludes unsafe history: %s",async kind=>{
 const f=await fixture();await f.toggle();const male=await f.submit();
 await f.t.run(async ctx=>{const flow=(await ctx.db.query("interestFlows").withIndex("by_interestId",q=>q.eq("interestId",male.interestId)).unique())!;
 if(kind==="reset")await ctx.db.patch(male.interestId,{testReset:{at:Date.now(),actor:"admin",reason:"test"}});
 else if(kind==="restored")await ctx.db.patch(f.sender,{lastRestoredArchivedAt:Date.now()});
 else if(kind==="accepted")await ctx.db.patch(flow._id,{recipientDecision:"accepted",bioVisibleAt:Date.now()});
 else if(kind==="photo")await ctx.db.patch(flow._id,{photoDecision:"approved"});
 else await ctx.db.patch(male.interestId,{status:kind as "closed"|"declined"|"withdrawn"});
 });
 await reverse(f);expect((await snapshot(f)).interests.every(i=>!i.canonicalInterestId)).toBe(true);
});
test("stale bearer photo shares blocked after share; own alias revocation allowed",async()=>{
 const f=await fixture();await f.toggle();const male=await f.submit();
 await f.t.run(ctx=>ctx.db.insert("profileShares",{ownerRegistrationId:f.sender,recipientRegistrationId:f.recipient,interestId:male.interestId,includeImages:true,shareToken:"stale",status:"shared",sentAt:Date.now(),createdAt:Date.now(),updatedAt:Date.now()}));
 const female=await reverse(f);
 await f.t.mutation(api.femaleInterestWorkflow.createReview,{adminSecret:"selection-secret",interestId:female.interestId,reviewTokenHash:"a".repeat(64)});
 expect(await f.t.query(api.profileShares.getByShareToken,{shareToken:"stale"})).toBeNull();
 await f.t.mutation(api.applicantInterests.revokeSenderPhotoConsent,{sessionHash:"selection-session",interestId:male.interestId});
});

// Exercise both serializations explicitly: convex-test does not simulate production OCC retries.
test.each(["sister", "brother"])("share wins withdrawal race: %s cannot refund either expression", async who => {
 const f=await fixture();await f.toggle();const female=await reverse(f);const male=await f.submit();
 await f.t.mutation(api.femaleInterestWorkflow.createReview,{adminSecret:"selection-secret",interestId:female.interestId,reviewTokenHash:"a".repeat(64)});
 const before=await snapshot(f);
 await expect(f.t.mutation(api.applicantInterests.withdrawOutbound,{sessionHash:who==="sister"?"recipient-session":"selection-session",interestId:who==="sister"?female.interestId:male.interestId})).rejects.toThrow();
 expect(await snapshot(f)).toEqual(before);
});
test.each(["no", "revoke-before", "revoke-after"])("canonical brother photos honor %s expression grant", async choice => {
 const f=await fixture();await f.toggle();
 await f.t.run(async ctx=>{const image=await ctx.storage.store(new Blob(["photo"],{type:"image/png"}));await ctx.db.patch(f.sender,{photoSharingPermission:"yes",imageStorageIds:[image]});});
 const male=await f.t.mutation(api.applicantInterests.submitInterestNumber,{photoConsent:choice==="no"?"no":"yes",expectedEventId:f.event,sessionHash:"selection-session",applicantNumber:2,applicantName:"Recipient"});
 const female=await reverse(f);
 const revoke=()=>f.t.mutation(api.applicantInterests.revokeSenderPhotoConsent,{sessionHash:"selection-session",interestId:male.interestId});
 if(choice==="revoke-before")await revoke();
 await f.t.mutation(api.femaleInterestWorkflow.createReview,{adminSecret:"selection-secret",interestId:female.interestId,reviewTokenHash:"a".repeat(64)});
 if(choice==="revoke-after") {
  expect((await f.t.query(api.femaleInterestWorkflow.getReviewAccess,{sessionHash:"recipient-session",interestId:female.interestId})).profile.imageUrls).toHaveLength(1);
  await revoke();await revoke();
 }
 expect((await f.t.query(api.femaleInterestWorkflow.getReviewAccess,{sessionHash:"recipient-session",interestId:female.interestId})).profile.imageUrls).toEqual([]);
});
test.each(["closed","withdrawn","reset","expired","accepted","photo"])("share excludes unsafe reciprocal %s without resetting history",async kind=>{
 const f=await fixture();await f.toggle();const female=await reverse(f);const male=await f.submit();
 await f.t.run(async ctx=>{
  const flow=(await ctx.db.query("interestFlows").withIndex("by_interestId",q=>q.eq("interestId",male.interestId)).unique())!;
  if(kind==="reset")await ctx.db.patch(male.interestId,{testReset:{at:Date.now(),actor:"admin",reason:"test"}});
  else if(kind==="expired")await ctx.db.patch(flow._id,{keepOpenExpiresAt:Date.now()-1,flowStatus:"kept_open"});
  else if(kind==="accepted")await ctx.db.patch(flow._id,{recipientDecision:"accepted",bioVisibleAt:Date.now()});
  else if(kind==="photo")await ctx.db.patch(flow._id,{photoDecision:"approved"});
  else await ctx.db.patch(male.interestId,{status:kind as "closed"|"withdrawn"});
 });
 const before=await snapshot(f);
 await f.t.mutation(api.femaleInterestWorkflow.createReview,{adminSecret:"selection-secret",interestId:female.interestId,reviewTokenHash:"a".repeat(64)});
 const after=await snapshot(f);expect(after.interests.find(i=>i._id===male.interestId)).toEqual(before.interests.find(i=>i._id===male.interestId));expect(after.flows).toEqual(before.flows);
 expect(await f.t.query(api.femaleInterestWorkflow.getReviewAccess,{sessionHash:"selection-session",interestId:female.interestId})).not.toHaveProperty("mutualInterest");
});


test.each(["brother-initial", "brother-final", "sister-final"])("linked %s decline has one canonical own receipt, preserving both audits", async kind => {
 const f=await fixture();await f.toggle();const female=await reverse(f);const male=await f.submit();
 await f.t.mutation(api.femaleInterestWorkflow.createReview,{adminSecret:"selection-secret",interestId:female.interestId,reviewTokenHash:"a".repeat(64)});
 if(kind!=="brother-initial") await f.t.mutation(api.femaleInterestWorkflow.respond,{sessionHash:"selection-session",interestId:female.interestId,decision:"accept"});
 if(kind==="brother-initial") await f.t.mutation(api.femaleInterestWorkflow.respond,{sessionHash:"selection-session",interestId:female.interestId,decision:"decline"});
 else if(kind==="brother-final") await f.t.mutation(api.femaleInterestWorkflow.brotherFinal,{sessionHash:"selection-session",interestId:female.interestId,approved:false});
 else await f.t.mutation(api.femaleInterestWorkflow.confirm,{sessionHash:"recipient-session",interestId:female.interestId,confirmed:false});
 const actor=kind==="sister-final"?"recipient-session":"selection-session";
 const own=await f.t.query(api.applicantInterests.getDashboard,{sessionHash:actor});
 expect(own.history).toHaveLength(1);expect(own.history[0]).toMatchObject({interestId:female.interestId,ownDecision:"declined"});
 expect((await f.t.query(api.applicantInterests.getDashboard,{sessionHash:actor==="recipient-session"?"selection-session":"recipient-session"})).history).toEqual([]);
 const state=await snapshot(f);expect(state.interests).toHaveLength(2);
 expect(state.events.filter(e=>e.eventType==="final_approval_declined").map(e=>e.interestId).sort()).toEqual([male.interestId,female.interestId].sort());
});

test("stale alias notification reads and both failure recorders deny without mutation",async()=>{
 const f=await fixture();await f.toggle();const female=await reverse(f);const male=await f.submit();
 expect(male.inboundInterestNotification).not.toBeNull();
 await f.t.mutation(api.femaleInterestWorkflow.createReview,{adminSecret:"selection-secret",interestId:female.interestId,reviewTokenHash:"a".repeat(64)});
 const before=await snapshot(f);
 for(const fn of [api.applicantInterests.recordInboundInterestNotificationFailure,api.applicantInterests.recordFinalApprovalNotificationFailure]) await expect(f.t.mutation(fn,{adminSecret:"selection-secret",interestId:male.interestId,error:"stale"})).rejects.toThrow("Connection unavailable");
 await expect(f.t.query(api.applicantInterests.getNotificationRecipient,{adminSecret:"selection-secret",sessionHash:"selection-session",interestId:male.interestId,kind:"inbound"})).rejects.toThrow("Connection unavailable");
 await expect(f.t.mutation(api.interests.assertNotificationEligible,{adminSecret:"selection-secret",id:male.interestId})).rejects.toThrow("Connection unavailable");
 expect(await snapshot(f)).toEqual(before);
});

test("hidden sister expression is observationally identical to absence before share",async()=>{
 vi.spyOn(Date,"now").mockReturnValue(1800000000000);
 try {
  const observations=[];
  for(const hidden of [false,true]) {
   const f=await fixture();await f.toggle();if(hidden)await reverse(f);
   const submitted=await f.submit();const dashboard=await f.dashboard();
   const normalize=(value:unknown)=>JSON.parse(JSON.stringify(value).split(submitted.interestId).join("OWN").split(f.sender).join("SELF").split(f.recipient).join("OTHER").split(f.event).join("EVENT"));
   observations.push(normalize({submitted,dashboard,workflow:await f.t.query(api.femaleInterestWorkflow.getDashboard,{sessionHash:"selection-session"})}));
  }
  expect(observations[1]).toEqual(observations[0]);
 } finally {vi.restoreAllMocks();}
});

// Public-handler regressions for correction4849's independent consent boundary.
async function expressionState(f: Awaited<ReturnType<typeof fixture>>, id: string) {
 const state=await snapshot(f);
 return {interest:state.interests.find(row=>row._id===id),flow:state.flows.find(row=>row.interestId===id),audit:state.events.filter(row=>row.interestId===id),deliveries:state.deliveries.filter(row=>row.interestId===id)};
}
const actorSession = (actor: string) => actor === "brother" ? "selection-session" : "recipient-session";
for (const shared of [false,true]) {
 test.each(["brother","sister"])("ordinary %s final decline preserves opposite expression (shared="+shared+")",async actor=>{
  const f=await fixture();await f.toggle();const female=await reverse(f);const male=await f.submit();
  await f.t.mutation(api.applicantInterests.respondToInbound,{sessionHash:"recipient-session",interestId:male.interestId,decision:"accept"});
  if(shared)await f.t.mutation(api.femaleInterestWorkflow.createReview,{adminSecret:"selection-secret",interestId:female.interestId,reviewTokenHash:"a".repeat(64)});
  const before=await expressionState(f,female.interestId);
  const quota=(await f.t.query(api.applicantInterests.getDashboard,{sessionHash:"recipient-session"})).interestSubmissions;
  await f.t.mutation(api.applicantInterests.giveFinalApproval,{sessionHash:actorSession(actor),interestId:male.interestId,approved:false});
  expect(await expressionState(f,female.interestId)).toEqual(before);
  expect((await f.t.query(api.applicantInterests.getDashboard,{sessionHash:"recipient-session"})).interestSubmissions).toEqual(quota);
  expect((await snapshot(f)).matches).toEqual([]);
  for(const who of ["brother","sister"]) {
   const history=(await f.t.query(api.applicantInterests.getDashboard,{sessionHash:actorSession(who)})).history;
   expect(history).toHaveLength(who===actor?1:0);
   if(who===actor)expect(history[0]).toMatchObject({interestId:male.interestId,ownDecision:"declined"});
  }
 });
 test.each(["brother","sister"])("ordinary bilateral finals isolate opposite expression, %s first (shared="+shared+")",async first=>{
  const f=await fixture();await f.toggle();const female=await reverse(f);const male=await f.submit();
  await f.t.mutation(api.applicantInterests.respondToInbound,{sessionHash:"recipient-session",interestId:male.interestId,decision:"accept"});
  if(shared)await f.t.mutation(api.femaleInterestWorkflow.createReview,{adminSecret:"selection-secret",interestId:female.interestId,reviewTokenHash:"a".repeat(64)});
  const before=await expressionState(f,female.interestId);
  const quota=(await f.t.query(api.applicantInterests.getDashboard,{sessionHash:"recipient-session"})).interestSubmissions;
  for(const who of [first,first==="brother"?"sister":"brother"]) {
   await f.t.mutation(api.applicantInterests.giveFinalApproval,{sessionHash:actorSession(who),interestId:male.interestId,approved:true});
   expect(await expressionState(f,female.interestId)).toEqual(before);
  }
  const state=await snapshot(f);expect(state.matches).toHaveLength(1);
  expect(state.matches[0]).toMatchObject({interestId:male.interestId,contactGate:"pending_admin_approval"});
  expect(state.interests.filter(row=>row.matchId)).toHaveLength(1);
  expect((await f.t.query(api.applicantInterests.getDashboard,{sessionHash:"recipient-session"})).interestSubmissions).toEqual(quota);
  for(const sessionHash of ["selection-session","recipient-session"])expect((await f.t.query(api.applicantInterests.getDashboard,{sessionHash})).history).toEqual([]);
 });
}

test.each(["brother-decline","sister-decline","bilateral"])("shared workflow %s cannot aggregate progressed unlinked ordinary consent",async action=>{
 const f=await fixture();await f.toggle();const female=await reverse(f);const male=await f.submit();
 await f.t.mutation(api.applicantInterests.respondToInbound,{sessionHash:"recipient-session",interestId:male.interestId,decision:"accept"});
 await f.t.mutation(api.applicantInterests.giveFinalApproval,{sessionHash:"selection-session",interestId:male.interestId,approved:true});
 const before=await expressionState(f,male.interestId);
 await f.t.mutation(api.femaleInterestWorkflow.createReview,{adminSecret:"selection-secret",interestId:female.interestId,reviewTokenHash:"a".repeat(64)});
 expect(await expressionState(f,male.interestId)).toEqual(before);
 expect(await f.t.query(api.femaleInterestWorkflow.getReviewAccess,{sessionHash:"selection-session",interestId:female.interestId})).not.toHaveProperty("mutualInterest");
 await f.t.mutation(api.femaleInterestWorkflow.respond,{sessionHash:"selection-session",interestId:female.interestId,decision:"accept"});
 if(action==="brother-decline")await f.t.mutation(api.femaleInterestWorkflow.brotherFinal,{sessionHash:"selection-session",interestId:female.interestId,approved:false});
 else {
  await f.t.mutation(api.femaleInterestWorkflow.confirm,{sessionHash:"recipient-session",interestId:female.interestId,confirmed:action==="bilateral"});
  // An ordinary final must not count for the separate shared review.
  expect((await snapshot(f)).matches).toEqual([]);
  if(action==="bilateral")await f.t.mutation(api.femaleInterestWorkflow.brotherFinal,{sessionHash:"selection-session",interestId:female.interestId,approved:true});
 }
 expect(await expressionState(f,male.interestId)).toEqual(before);
 const state=await snapshot(f);expect(state.matches).toHaveLength(action==="bilateral"?1:0);
 if(action==="bilateral")expect(state.interests.filter(row=>row.matchId).map(row=>row._id)).toEqual([female.interestId]);
});

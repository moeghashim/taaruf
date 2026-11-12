import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { receivedInterestUpdates } from "../src/lib/received-interest-updates";
const adminSecret = "synthetic-heading-admin";
afterEach(() => vi.unstubAllEnvs());
async function fixture(female: boolean) {
 vi.stubEnv("ATTENDANCE_ADMIN_SECRET", adminSecret);
 const t = convexTest(schema, modules);
 const ids = await t.run(async ctx => {
  const now = Date.now();
  const base = { age:30,maritalStatus:"single",education:"College",job:"Engineer",phone:"5550100",status:"approved" as const,createdAt:now };
  const brother = await ctx.db.insert("registrations", {...base,name:"Brother",gender:"male",email:"brother@example.test"});
  const sister = await ctx.db.insert("registrations", {...base,name:"Sister",gender:"female",email:"sister@example.test"});
  const eventId = await ctx.db.insert("events", {title:"Synthetic",eventCode:"test",eventMonth:"2026-11",series:"test",location:"Test",startsAt:now,endsAt:now,status:"completed",maleCapacity:1,femaleCapacity:1,createdAt:now,updatedAt:now});
  const fromRegistrationId=female?sister:brother, toRegistrationId=female?brother:sister;
  const interestId=await ctx.db.insert("interests", {fromRegistrationId,toRegistrationId,eventId,source:"platform_submission",status:"new",visibility:female?"internal_only":"admin_actionable",senderPhotoConsent:"no",...(female?{femaleWorkflow:{state:"private_documented" as const}}:{}),createdAt:now,updatedAt:now});
  await ctx.db.insert("interestFlows",{interestId,fromRegistrationId,toRegistrationId,flowStatus:female?"private_documented":"awaiting_inbound_response",recipientDecision:"pending",requesterFinalApproval:"pending",recipientFinalApproval:"pending",photoDecision:"pending",createdAt:now,updatedAt:now});
  for(const [registrationId,sessionHash] of [[brother,"brother"],[sister,"sister"]] as const) await ctx.db.insert("applicantSessions",{registrationId,sessionHash,expiresAt:now+86400000,createdAt:now});
  return {interestId};
 });
 async function notices(sessionHash: string) {
  const dashboard=await t.query(api.applicantInterests.getDashboard,{sessionHash});
  const reviews=(await t.query(api.femaleInterestWorkflow.getDashboardPage,{sessionHash,paginationOpts:{numItems:50,cursor:null}})).page;
  const ready=[];
  for(const row of reviews.filter(r=>r.state==="contacts_released")) {
   const detail=await t.query(api.femaleInterestWorkflow.getReviewAccess,{sessionHash,interestId:row.interestId});
   if(detail.profile.email||detail.profile.phone) ready.push(row.interestId);
  }
  return {dashboard,reviews,notices:receivedInterestUpdates([...dashboard.outbound,...dashboard.inbound,...dashboard.privateDocumented],reviews,ready)};
 }
 async function share() { if(female) await t.mutation(api.femaleInterestWorkflow.createReview,{adminSecret,interestId:ids.interestId,reviewTokenHash:"a".repeat(64)}); }
 async function accept() { if(female) await t.mutation(api.femaleInterestWorkflow.respond,{sessionHash:"brother",interestId:ids.interestId,decision:"accept"}); else await t.mutation(api.applicantInterests.respondToInbound,{sessionHash:"sister",interestId:ids.interestId,decision:"accept"}); }
 return {t,...ids,notices,share,accept};
}
for(const female of [false,true]) {
 const sender=female?"sister":"brother", target=female?"brother":"sister";
 test("actual public projection lifecycle: "+sender+" sender",async()=>{
  const f=await fixture(female);
  const before=await f.notices(sender);
  expect(before.notices).toEqual([]);
  if(female) {expect(before.dashboard.outbound).toEqual([]);expect(before.reviews[0]).toMatchObject({role:"sister",ownAction:null,ownDecision:"pending"});}
  await f.share();
  expect((await f.notices(sender)).notices).toEqual([]);
  expect((await f.notices(target)).notices[0].heading).toBe("You Have Received An Interest");
  await f.accept();
  expect((await f.notices(sender)).notices[0]).toMatchObject({heading:"Your review is needed",copy:"This connection is awaiting your review."});
  if(female) await f.t.mutation(api.femaleInterestWorkflow.confirm,{sessionHash:sender,interestId:f.interestId,confirmed:true});
  else await f.t.mutation(api.applicantInterests.giveFinalApproval,{sessionHash:sender,interestId:f.interestId,approved:true});
  expect((await f.notices(sender)).notices).toEqual([]);
  if(female) await f.t.mutation(api.femaleInterestWorkflow.brotherFinal,{sessionHash:target,interestId:f.interestId,approved:true});
  if(!female) await f.t.mutation(api.applicantInterests.giveFinalApproval,{sessionHash:target,interestId:f.interestId,approved:true});
  expect((await f.notices(sender)).notices).toEqual([]);
  if(female) await f.t.mutation(api.femaleInterestWorkflow.releaseContacts,{adminSecret,interestId:f.interestId});
  else {const row=await f.t.run(ctx=>ctx.db.get(f.interestId));await f.t.mutation(api.matches.updateStatus,{adminSecret,id:row!.matchId!,status:"contact_shared"});}
  for(const role of [sender,target]) expect((await f.notices(role)).notices[0].heading).toBe("A match has been created!");
 });
 test("target decline never leaves a stale sent notice: "+sender,async()=>{
  const f=await fixture(female);await f.share();
  if(female) await f.t.mutation(api.femaleInterestWorkflow.respond,{sessionHash:target,interestId:f.interestId,decision:"decline"});
  else await f.t.mutation(api.applicantInterests.respondToInbound,{sessionHash:target,interestId:f.interestId,decision:"decline"});
  const result=await f.notices(sender);
  expect(result.notices.some(n=>n.heading==="You Have Sent An Interest")).toBe(false);
  if(female) expect(result.notices).toEqual([]);
  else expect(result.dashboard.history).toEqual([]);
 });
}

test("real kept-open projection stays quiet for BOTH sender and recipient without leaking the decision",async()=>{
 const f=await fixture(false);
 const before=await f.notices("brother");
 await f.t.mutation(api.applicantInterests.respondToInbound,{sessionHash:"sister",interestId:f.interestId,decision:"keep_open"});
 const sender=await f.notices("brother"),recipient=await f.notices("sister");
 expect(sender.notices).toEqual([]);expect(recipient.notices).toEqual([]);
 expect(sender.dashboard.outbound[0].ownInitialDecision).toBeNull();
 expect(sender.dashboard.outbound[0].flowStatus).toBe(before.dashboard.outbound[0].flowStatus);
 expect(recipient.dashboard.inbound[0].ownInitialDecision).toBe("kept_open");
 expect(recipient.dashboard.inbound[0].canRespond).toBe(true);
});

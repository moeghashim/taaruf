import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";
import { contactsVisible } from "./contactGate";
import schema from "./schema";
import { modules } from "./test.setup";
const preview = makeFunctionReference<"query">("adminRemovePausedPair:preview");
const remove = makeFunctionReference<"mutation">("adminRemovePausedPair:remove");
afterEach(() => vi.unstubAllEnvs());
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const reg = (gender: "male" | "female", n: number) => ctx.db.insert("registrations", { name: "Synthetic", gender, publicApplicantNumber: n, age: 30, maritalStatus: "single", education: "College", job: "Test", email: n+"@example.invalid", phone: "555", paymentStatus: "paid", status: "approved", searchStatus: "active", profileCompletionStatus: "completed", createdAt: 1 });
    const maleId = await reg("male",9001), femaleId = await reg("female",9002), other = await reg("male",9003);
    const interestId = await ctx.db.insert("interests", { fromRegistrationId: femaleId, toRegistrationId: maleId, eventId: "100events" as Id<"events">, source: "platform_submission", visibility: "internal_only", status: "converted_to_match", adminStatus: "matched", femaleWorkflow: { state: "contacts_released", reviewTokenHash: "old-token", brotherAcceptedAt: 1, sisterConfirmedAt: 2, adminReleasedAt: 3 }, createdAt: 1, updatedAt: 3 });
    const expectedMatchId = await ctx.db.insert("matches", { maleRegistrationId: maleId, femaleRegistrationId: femaleId, interestId, status: "paused", contactGate: "contacts_released", adminReleasedAt: 3, interestType: "mutual_interest", createdAt: 1, updatedAt: 4 });
    await ctx.db.patch(interestId,{matchId:expectedMatchId});
    const flowId = await ctx.db.insert("interestFlows",{ interestId, fromRegistrationId: femaleId, toRegistrationId: maleId, flowStatus: "contact_shared", recipientDecision: "accepted", requesterFinalApproval: "approved", recipientFinalApproval: "approved", photoDecision: "approved", contactSharedAt: 3, photosVisibleAt: 2, createdAt: 1, updatedAt: 3 });
    await ctx.db.insert("profileShares",{ ownerRegistrationId: femaleId, recipientRegistrationId: maleId, matchId: expectedMatchId, interestId, shareToken: "synthetic-share", status: "interested", includeImages: true, createdAt: 1, updatedAt: 3 });
    const queuedId = await ctx.db.insert("interests",{ fromRegistrationId: femaleId, toRegistrationId: other, eventId: "100events" as Id<"events">, source: "platform_submission", visibility: "internal_only", status: "queued", createdAt: 1, updatedAt: 1 });
    for (const status of ["sent","pending"] as const) {
      await ctx.db.insert("contactReleaseEmails",{matchId:expectedMatchId,recipientId:maleId,key:"contact-"+status,email:"9001@example.invalid",status,attempts:1,nextAttemptAt:1,releaseAt:3,activationAt:1,createdAt:1,...(status === "sent" ? {providerId:"accepted-provider-receipt",sentAt:4}: {})});
      await ctx.db.insert("femaleWorkflowDeliveries",{interestId,recipientId:maleId,key:"workflow-"+status,kind:"contacts_ready",status,attempts:1,nextAttemptAt:1,createdAt:1});
      await ctx.db.insert("matchmakerNotifications",{matchId:expectedMatchId,recipientId:maleId,key:"notice-"+status,status,createdAt:1});
    }
    return {maleId,femaleId,expectedMatchId,interestId,flowId,queuedId,other};
  });
  const scope = {expectedMatchId:ids.expectedMatchId,maleId:ids.maleId,femaleId:ids.femaleId,maleNumber:9001,femaleNumber:9002};
  const p = await t.query(preview,scope);
  return {t,ids,scope,args:{...scope,expectedFingerprint:p.fingerprint,confirm:"REMOVE PAUSED REAL CONNECTION; NO PARTICIPANT DECLINE"}};
}
async function state(t: ReturnType<typeof convexTest>) { return t.run(async ctx => ({ registrations:await ctx.db.query("registrations").collect(),matches:await ctx.db.query("matches").collect(),interests:await ctx.db.query("interests").collect(),flows:await ctx.db.query("interestFlows").collect(),shares:await ctx.db.query("profileShares").collect(),contacts:await ctx.db.query("contactReleaseEmails").collect(),deliveries:await ctx.db.query("femaleWorkflowDeliveries").collect(),notifications:await ctx.db.query("matchmakerNotifications").collect(),jobs:await ctx.db.system.query("_scheduled_functions").collect(),audits:await ctx.db.query("adminPairRemovalAudits").collect() })); }
test("real removal preserves eligibility, consent history, accepted receipts and unrelated queue; no access, promotion, mail or resurrection",async()=>{
  const f=await fixture(), before=await state(f.t);
  const result=await f.t.mutation(remove,f.args), after=await state(f.t);
  expect(after.registrations).toEqual(before.registrations);
  expect(after.matches).toEqual([]);expect(after.jobs).toEqual([]);
  expect(after.interests.find(i=>i._id===f.ids.queuedId)).toEqual(before.interests.find(i=>i._id===f.ids.queuedId));
  const interest=after.interests.find(i=>i._id===f.ids.interestId)!;
  expect(interest).toMatchObject({status:"closed",femaleWorkflow:{state:"revoked",brotherAcceptedAt:1,sisterConfirmedAt:2}});
  expect(interest.adminStatus).toBeUndefined();expect(interest.matchId).toBeUndefined();expect(interest.testReset).toBeUndefined();expect(interest.femaleWorkflow?.reviewTokenHash).toBeUndefined();
  expect(after.flows[0]).toMatchObject({flowStatus:"closed",recipientDecision:"accepted",requesterFinalApproval:"approved",recipientFinalApproval:"approved",closedReason:"admin_removed_connection"});
  expect(after.flows[0].contactSharedAt).toBeUndefined();
  for(const key of ["contacts","deliveries","notifications"] as const)expect(after[key].filter(d=>d.status==="sent")).toEqual(before[key].filter(d=>d.status==="sent"));
  expect(after.contacts[1].status).toBe("cancelled");expect(after.deliveries[1].status).toBe("cancelled");
  expect(await f.t.query(api.profileShares.getByShareToken,{shareToken:"synthetic-share"})).toBeNull();
  expect(await f.t.run(ctx=>contactsVisible(ctx,interest,after.flows[0]))).toBe(false);
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET","synthetic-admin");
  await expect(f.t.mutation(api.interests.updateStatus,{adminSecret:"synthetic-admin",id:interest._id,status:"active"})).rejects.toThrow("Connection unavailable");
  expect(await f.t.mutation(remove,f.args)).toEqual({...result,alreadyRemoved:true});
  expect(await state(f.t)).toEqual(after);
  await expect(f.t.mutation(remove,{...f.args,maleNumber:1})).rejects.toThrow("different request");
});
for(const drift of ["wrongId","pair","number","fingerprint","active","foreignPointer","foreignShare","sending","claimed","eligibility","canonical","blocking"] as const)test("atomic guard: "+drift,async()=>{
  const f=await fixture();
  await f.t.run(async ctx=>{
    if(drift==="active")await ctx.db.patch(f.ids.expectedMatchId,{status:"new"});
    if(drift==="foreignPointer")await ctx.db.patch(f.ids.other,{activeMatchId:f.ids.expectedMatchId});
    if(drift==="foreignShare")await ctx.db.patch((await ctx.db.query("profileShares").first())!._id,{ownerRegistrationId:f.ids.other});
    if(drift==="sending")await ctx.db.patch((await ctx.db.query("contactReleaseEmails").first())!._id,{status:"sending"});
    if(drift==="claimed")await ctx.db.patch((await ctx.db.query("matchmakerNotifications").first())!._id,{status:"claimed"});
    if(drift==="eligibility")await ctx.db.patch(f.ids.maleId,{searchStatus:"paused"});
    if(drift==="canonical")await ctx.db.patch(f.ids.queuedId,{canonicalInterestId:f.ids.interestId});
    if(drift==="blocking")await ctx.db.insert("matches",{maleRegistrationId:f.ids.other,femaleRegistrationId:f.ids.femaleId,status:"new",interestType:"admin_suggested",createdAt:1,updatedAt:1});
    if(drift==="wrongId"){const id=await ctx.db.insert("matches",{maleRegistrationId:f.ids.maleId,femaleRegistrationId:f.ids.femaleId,status:"paused",interestType:"admin_suggested",createdAt:1,updatedAt:1}); f.args.expectedMatchId=id;}
  });
  if(drift==="pair")f.args.maleId=f.ids.other;
  if(drift==="number")f.args.maleNumber=1;
  if(drift==="fingerprint")f.args.expectedFingerprint="stale";
  const before=await state(f.t);await expect(f.t.mutation(remove,f.args)).rejects.toThrow();expect(await state(f.t)).toEqual(before);
});
test("clears only exact active pointers",async()=>{
 const f=await fixture();await f.t.run(ctx=>ctx.db.patch(f.ids.maleId,{activeMatchId:f.ids.expectedMatchId}));
 const p=await f.t.query(preview,f.scope);await f.t.mutation(remove,{...f.args,expectedFingerprint:p.fingerprint});
 expect((await state(f.t)).registrations.every(r=>r.activeMatchId===undefined)).toBe(true);
});

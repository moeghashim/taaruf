import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
const adminSecret = "synthetic-female-admin";
const hash = "a".repeat(64);
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function fixture() {
  vi.stubEnv("ATTENDANCE_ADMIN_SECRET", adminSecret);
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const now = Date.now();
    const base = { age: 30, maritalStatus: "single", education: "College", job: "Engineer", phone: "5550100", status: "approved" as const, createdAt: now };
    const sister = await ctx.db.insert("registrations", { ...base, name: "Synthetic Sister", gender: "female", email: "sister@example.com" });
    const brother = await ctx.db.insert("registrations", { ...base, name: "Synthetic Brother", gender: "male", email: "brother@example.com" });
    const other = await ctx.db.insert("registrations", { ...base, name: "Other", gender: "male", email: "other@example.com" });
    const event = await ctx.db.insert("events", { title: "Synthetic", eventCode: "test", eventMonth: "2026-11", series: "test", location: "Test", startsAt: now, endsAt: now, status: "completed", maleCapacity: 1, femaleCapacity: 1, createdAt: now, updatedAt: now });
    const interestId = await ctx.db.insert("interests", { fromRegistrationId: sister, toRegistrationId: brother, eventId: event, source: "platform_submission", status: "new", visibility: "internal_only", senderPhotoConsent: "no", femaleWorkflow: { state: "private_documented" }, createdAt: now, updatedAt: now });
    await ctx.db.insert("interestFlows", { interestId, fromRegistrationId: sister, toRegistrationId: brother, flowStatus: "private_documented", recipientDecision: "pending", requesterFinalApproval: "pending", recipientFinalApproval: "pending", photoDecision: "pending", createdAt: now, updatedAt: now });
    for (const [registrationId, sessionHash] of [[sister, "sister"], [brother, "brother"], [other, "other"]] as const) await ctx.db.insert("applicantSessions", { registrationId, sessionHash, expiresAt: now + 86400000, createdAt: now });
    return { sister, brother, interestId };
  });
  return { t, ...ids };
}

async function shared() { const f = await fixture(); await f.t.mutation(api.femaleInterestWorkflow.createReview, {adminSecret, interestId:f.interestId, reviewTokenHash:hash}); return f; }
const accept = (f:Awaited<ReturnType<typeof fixture>>) => f.t.mutation(api.femaleInterestWorkflow.respond,{sessionHash:"brother",interestId:f.interestId,decision:"accept"});
const final = (f:Awaited<ReturnType<typeof fixture>>, approved=true) => f.t.mutation(api.femaleInterestWorkflow.brotherFinal,{sessionHash:"brother",interestId:f.interestId,approved});
const confirm = (f:Awaited<ReturnType<typeof fixture>>) => f.t.mutation(api.femaleInterestWorkflow.confirm,{sessionHash:"sister",interestId:f.interestId,confirmed:true});
for(const sisterFirst of [false,true]) test("initial acceptance is not final; either final order and duplicate requests: "+sisterFirst,async()=>{
 const f=await shared();
 await expect(final(f)).rejects.toThrow("Initial acceptance");
 expect((await f.t.query(api.femaleInterestWorkflow.getDashboard,{sessionHash:"brother"}))[0].ownActionStage).toBe("initial");
 await Promise.all([accept(f),accept(f)]);
 const before=await f.t.run(ctx=>ctx.db.query("interestFlows").first());
 expect(before).toMatchObject({recipientDecision:"accepted",recipientFinalApproval:"pending",requesterFinalApproval:"pending"});
 expect(before?.recipientExplicitFinalAt).toBeUndefined();
 expect((await f.t.query(api.femaleInterestWorkflow.getDashboard,{sessionHash:"brother"}))[0]).toMatchObject({ownDecision:"pending",ownAction:"review",ownActionStage:"final"});
 if(sisterFirst) await confirm(f); else await final(f);
 expect(await f.t.run(ctx=>ctx.db.query("matches").take(10))).toHaveLength(0);
 if(sisterFirst) await Promise.all([final(f),final(f)]); else await Promise.all([confirm(f),confirm(f)]);
 expect(await f.t.run(ctx=>ctx.db.query("matches").take(10))).toHaveLength(1);
 const snapshot=await f.t.run(ctx=>ctx.db.get(f.interestId));await accept(f);await final(f);await confirm(f);
 expect(await f.t.run(ctx=>ctx.db.get(f.interestId))).toEqual(snapshot);
 for(const role of ["sister","brother"]) expect((await f.t.query(api.femaleInterestWorkflow.getReviewAccess,{sessionHash:role,interestId:f.interestId})).profile.email).toBeNull();
});
test("legacy implicit approval and propagated reverse event cannot join; fresh final preserves history",async()=>{
 const f=await shared();await accept(f);
 await f.t.run(async ctx=>{
  const i=(await ctx.db.get(f.interestId))!;const flow=(await ctx.db.query("interestFlows").first())!;const at=i.femaleWorkflow!.brotherAcceptedAt!;
  await ctx.db.patch(flow._id,{recipientFinalApproval:"approved",recipientFinalApprovalAt:at});
  await ctx.db.insert("interestFlowEvents",{interestFlowId:flow._id,interestId:i._id,actor:"applicant",actorRegistrationId:f.brother,eventType:"final_approval_given",createdAt:at});
  const reverse=await ctx.db.insert("interests",{fromRegistrationId:f.brother,toRegistrationId:f.sister,eventId:i.eventId,source:"admin_entered",status:"new",visibility:"admin_actionable",createdAt:at,updatedAt:at});
  const rflow=await ctx.db.insert("interestFlows",{interestId:reverse,fromRegistrationId:f.brother,toRegistrationId:f.sister,recipientDecision:"pending",flowStatus:"awaiting_inbound_response",requesterFinalApproval:"approved",requesterFinalApprovalAt:at,recipientFinalApproval:"pending",photoDecision:"pending",createdAt:at,updatedAt:at});
  await ctx.db.insert("interestFlowEvents",{interestFlowId:rflow,interestId:reverse,actor:"applicant",actorRegistrationId:f.brother,eventType:"final_approval_given",createdAt:at});
 });
 await confirm(f);expect(await f.t.run(ctx=>ctx.db.query("matches").take(10))).toHaveLength(0);
 expect((await f.t.run(ctx=>ctx.db.query("interestFlows").first()))?.recipientFinalApproval).toBe("approved");
 await final(f);expect(await f.t.run(ctx=>ctx.db.query("matches").take(10))).toHaveLength(1);
 expect((await f.t.run(ctx=>ctx.db.query("interestFlowEvents").take(100))).filter(e=>e.eventType==="final_approval_given")).toHaveLength(2);
});
for(const invalid of ["expiry","wrong token","revoked session","archive","reset","revoked review","initial missing"] as const)test("final fails closed: "+invalid,async()=>{
 const f=await shared();await accept(f);
 if(invalid==="wrong token") {await expect(f.t.mutation(api.femaleInterestWorkflow.brotherFinal,{sessionHash:"brother",interestId:f.interestId,approved:true,reviewTokenHash:"wrong"})).rejects.toThrow();return;}
 await f.t.run(async ctx=>{
  const i=(await ctx.db.get(f.interestId))!;
  if(invalid==="expiry")await ctx.db.patch(i._id,{femaleWorkflow:{...i.femaleWorkflow!,reviewExpiresAt:1}});
  if(invalid==="revoked review")await ctx.db.patch(i._id,{femaleWorkflow:{...i.femaleWorkflow!,state:"revoked"}});
  if(invalid==="reset")await ctx.db.patch(i._id,{testReset:{at:Date.now(),actor:"admin",reason:"test"}});
  if(invalid==="archive")await ctx.db.patch(f.sister,{archivedAt:Date.now()});
  if(invalid==="initial missing")await ctx.db.patch((await ctx.db.query("interestFlows").first())!._id,{recipientDecision:"pending"});
  if(invalid==="revoked session")await ctx.db.patch((await ctx.db.query("applicantSessions").withIndex("by_sessionHash",q=>q.eq("sessionHash","brother")).unique())!._id,{revokedAt:Date.now()});
 });
 await expect(final(f)).rejects.toThrow();expect(await f.t.run(ctx=>ctx.db.query("matches").take(10))).toHaveLength(0);
});
test("legacy initial acceptance can still be declined in final stage",async()=>{const f=await shared();await accept(f);await f.t.run(async ctx=>{const flow=(await ctx.db.query("interestFlows").first())!;await ctx.db.patch(flow._id,{recipientFinalApproval:"approved"});});await final(f,false);expect((await f.t.run(ctx=>ctx.db.get(f.interestId)))?.status).toBe("declined");});

test("genuine reciprocal explicit final survives; initial accept alone never joins",async()=>{
 const f=await shared();
 const reverse=await f.t.run(async ctx=>{
  const i=(await ctx.db.get(f.interestId))!;const now=Date.now();
  const id=await ctx.db.insert("interests",{fromRegistrationId:f.brother,toRegistrationId:f.sister,eventId:i.eventId,source:"admin_entered",status:"new",visibility:"admin_actionable",createdAt:now,updatedAt:now});
  await ctx.db.insert("interestFlows",{interestId:id,fromRegistrationId:f.brother,toRegistrationId:f.sister,recipientDecision:"pending",flowStatus:"awaiting_inbound_response",requesterFinalApproval:"pending",recipientFinalApproval:"pending",photoDecision:"pending",createdAt:now,updatedAt:now});return id;
 });
 await f.t.mutation(api.applicantInterests.respondToInbound,{sessionHash:"sister",interestId:reverse,decision:"accept"});
 await f.t.mutation(api.applicantInterests.giveFinalApproval,{sessionHash:"brother",interestId:reverse,approved:true});
 await accept(f);expect(await f.t.run(ctx=>ctx.db.query("matches").take(10))).toHaveLength(0);
 await confirm(f);expect(await f.t.run(ctx=>ctx.db.query("matches").take(10))).toHaveLength(1);
});

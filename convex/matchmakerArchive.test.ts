import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { contactsVisible } from "./contactGate";
const secret = "synthetic-archive-matchmaker";
beforeEach(() => vi.stubEnv("ATTENDANCE_ADMIN_SECRET", secret));
afterEach(() => vi.unstubAllEnvs());
const mm = api.matchmakerMatching;
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const image = await ctx.storage.store(new Blob(["synthetic"]));
    const base = {age:30, maritalStatus:"single", education:"College", job:"Engineer", phone:"5550100", status:"approved" as const, profileCompletionStatus:"completed" as const, searchStatus:"active" as const, backgroundMatchmakingOptIn:true, photoSharingPermission:"yes" as const, imageStorageIds:[image], createdAt:1};
    const male = await ctx.db.insert("registrations", {...base, name:"Private Man", gender:"male", email:"man@example.invalid"});
    const female = await ctx.db.insert("registrations", {...base, name:"Private Woman", gender:"female", email:"woman@example.invalid"});
    for (const [registrationId,sessionHash] of [[male,"male"],[female,"female"]] as const) await ctx.db.insert("applicantSessions", {registrationId,sessionHash,createdAt:Date.now(),expiresAt:Date.now()+100000});
    return {male,female};
  });
  const matchId = await t.mutation(api.matches.create,{adminSecret:secret,maleRegistrationId:ids.male,femaleRegistrationId:ids.female});
  const present = () => t.mutation(mm.present,{adminSecret:secret,matchId});
  return {t,...ids,matchId,present};
}
test.each(["male","female"] as const)("archived %s blocks drafts, presentation, approvals, and notification claims but not optout",async side=>{
  const f=await fixture();await f.present();
  await f.t.run(ctx=>ctx.db.patch(f[side],{archivedAt:0}));
  await expect(f.present()).rejects.toThrow(/archived/i);
  await expect(f.t.mutation(api.matches.create,{adminSecret:secret,maleRegistrationId:f.male,femaleRegistrationId:f.female})).rejects.toThrow(/archived/i);
  await expect(f.t.mutation(mm.approve,{sessionHash:"male",matchId:f.matchId})).rejects.toThrow(/archived/i);
  await expect(f.t.mutation(mm.claimNotification,{adminSecret:secret,matchId:f.matchId,recipientId:f.male})).rejects.toThrow(/archived/i);
  await expect(f.t.mutation(mm.setConsent,{sessionHash:side,optedIn:true})).rejects.toThrow(/archived/i);
  await f.t.mutation(mm.setConsent,{sessionHash:side,optedIn:false});
  expect((await f.t.run(ctx=>ctx.db.get(f[side])))?.backgroundMatchmakingOptIn).toBe(false);
  for(const sessionHash of ["male","female"]) expect((await f.t.query(mm.getMine,{sessionHash})).matches[0]).toMatchObject({canApprove:false,partner:null});
});
test.each(["male","female"] as const)("archiving %s preserves disclosures but suppresses contacts/photos permanently across restore",async side=>{
  const f=await fixture();await f.present();
  for(const sessionHash of ["male","female"]) await f.t.mutation(mm.approve,{sessionHash,matchId:f.matchId});
  await f.t.mutation(mm.releaseContacts,{adminSecret:secret,matchId:f.matchId});
  const before=await f.t.run(ctx=>ctx.db.get(f.matchId));
  expect((await f.t.query(mm.getMine,{sessionHash:"male"})).matches[0].partner?.images).toHaveLength(1);
  await f.t.mutation(api.archive.archiveAdmin,{adminSecret:secret,registrationId:f[side],expectedArchivedAt:null,confirm:true});
  for(const restored of [false,true]) {
    if(restored) await f.t.run(ctx=>ctx.db.patch(f[side],{archivedAt:undefined}));
    for(const sessionHash of ["male","female"]) {
      const view=(await f.t.query(mm.getMine,{sessionHash})).matches[0];
      expect(view).toMatchObject({contactShared:true,canApprove:false,partner:null});
      expect(view.partner?.email).toBeUndefined();expect(view.partner?.phone).toBeUndefined();expect(view.partner?.name).toBeUndefined();
    }
    await expect(f.t.mutation(mm.releaseContacts,{adminSecret:secret,matchId:f.matchId})).rejects.toThrow();
  }
  expect(await f.t.run(ctx=>ctx.db.get(f.matchId))).toMatchObject({adminReleasedAt:before!.adminReleasedAt,maleMatchmakerApprovalAt:before!.maleMatchmakerApprovalAt,femaleMatchmakerApprovalAt:before!.femaleMatchmakerApprovalAt,closedReason:"participant_archived"});
});
test("unlinked historical contact disclosure cannot bypass an archive-closed flow after restore",async()=>{
 const f=await fixture();
 await f.t.run(async ctx=>{
   const eventId=await ctx.db.insert("events",{title:"Synthetic",eventCode:"test",eventMonth:"2026-11",series:"test",location:"Test",startsAt:1,endsAt:2,status:"completed",maleCapacity:1,femaleCapacity:1,createdAt:1,updatedAt:1});
   const interestId=await ctx.db.insert("interests",{eventId,source:"admin_entered",visibility:"admin_actionable",fromRegistrationId:f.male,toRegistrationId:f.female,status:"closed",createdAt:1,updatedAt:1});
   const flowId=await ctx.db.insert("interestFlows",{interestId,fromRegistrationId:f.male,toRegistrationId:f.female,flowStatus:"closed",closedReason:"participant_archived",recipientDecision:"accepted",requesterFinalApproval:"approved",recipientFinalApproval:"approved",photoDecision:"approved",contactSharedAt:1,createdAt:1,updatedAt:1});
   const interest=(await ctx.db.get(interestId))!;const flow=(await ctx.db.get(flowId))!;
   expect(await contactsVisible(ctx,interest,flow)).toBe(false);
   expect((await ctx.db.get(flowId))?.contactSharedAt).toBe(1);
 });
});

test("already-closed historical release cannot regain access after real archive and restore",async()=>{
 const f=await fixture();await f.present();
 await f.t.run(ctx=>ctx.db.patch(f.matchId,{status:"closed",adminReleasedAt:1}));
 const archived=await f.t.mutation(api.archive.archiveAdmin,{adminSecret:secret,registrationId:f.female,expectedArchivedAt:null,confirm:true});
 await f.t.mutation(api.archive.restoreAdmin,{adminSecret:secret,registrationId:f.female,expectedArchivedAt:archived.archivedAt,confirm:true});
 const view=(await f.t.query(mm.getMine,{sessionHash:"male"})).matches[0];
 expect(view.contactShared).toBe(true);expect(view.partner).toBeNull();expect(view.partner?.email).toBeUndefined();
 expect((await f.t.run(ctx=>ctx.db.get(f.matchId)))?.adminReleasedAt).toBe(1);
});

test("claimed matchmaker delivery retains late success after archive without requeue",async()=>{
 const f=await fixture();await f.t.run(ctx=>ctx.db.insert("settings",{key:"matchmakerEmailActivationAt",value:"1"}));await f.t.mutation(mm.present,{adminSecret:secret,matchId:f.matchId,emailReady:true});
 const claim=await f.t.mutation(mm.claimNotification,{adminSecret:secret,matchId:f.matchId,recipientId:f.male});expect(claim).not.toBeNull();
 const archived=await f.t.mutation(api.archive.archiveAdmin,{adminSecret:secret,registrationId:f.male,expectedArchivedAt:null,confirm:true});
 expect(await f.t.run(ctx=>ctx.db.get(claim!.deliveryId))).toMatchObject({status:"claimed"});
 await f.t.mutation(mm.recordNotification,{adminSecret:secret,deliveryId:claim!.deliveryId,sent:true});
 expect(await f.t.run(ctx=>ctx.db.get(claim!.deliveryId))).toMatchObject({status:"sent"});
 await f.t.mutation(api.archive.restoreAdmin,{adminSecret:secret,registrationId:f.male,expectedArchivedAt:archived.archivedAt,confirm:true});
 await expect(f.t.mutation(mm.claimNotification,{adminSecret:secret,matchId:f.matchId,recipientId:f.female})).rejects.toThrow("Match unavailable");
 expect((await f.t.run(ctx=>ctx.db.query("matchmakerNotifications").collect())).map(n=>n.status).sort()).toEqual(["failed","sent"]);
});

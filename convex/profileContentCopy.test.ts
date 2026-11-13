import { convexTest } from "convex-test";
import { beforeEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { modules } from "./test.setup";
import { api, internal } from "./_generated/api";
import { CONTENT_FIELDS } from "./profileContentCopy";
beforeEach(()=>vi.stubEnv("ATTENDANCE_ADMIN_SECRET","synthetic-admin"));
const adminSecret="synthetic-admin";
async function fixture() {
 const t=convexTest(schema,modules);
 const ids=await t.run(async ctx=>{
  const image=await ctx.storage.store(new Blob(["source synthetic"],{type:"image/png"}));
  const old=await ctx.storage.store(new Blob(["target synthetic"],{type:"image/png"}));
  const base={name:"Synthetic",gender:"female" as const,age:30,maritalStatus:"single",education:"College",job:"Old",phone:"",paymentStatus:"paid" as const,status:"approved" as const,createdAt:1,photoSharingPermission:"ask_me_first" as const};
  const targetId=await ctx.db.insert("registrations",{...base,email:"target@example.invalid",publicApplicantNumber:144,imageStorageIds:[old],amountPaid:100,adminNotes:"preserve",profileAccessToken:"synthetic-capability",interestSubmissionNumbers:[12],backgroundMatchmakingOptIn:false});
  const sourceId=await ctx.db.insert("registrations",{...base,email:"source@example.invalid",publicApplicantNumber:163,imageStorageIds:[image],job:"New",shareableBio:"Synthetic bio",prayerCommitment:"always_five",paymentStatus:"pending"});
  await ctx.db.insert("photoUploads",{storageId:image,registrationId:sourceId,createdAt:1});
  return {targetId,sourceId,image,old};
 });
 const pair={sourceId:ids.sourceId,targetId:ids.targetId,sourceNumber:163,targetNumber:144};
 return {t,ids,pair};
}
async function request(f:Awaited<ReturnType<typeof fixture>>) {
 const p=await f.t.query(api.profileContentCopy.preview,{...f.pair,adminSecret});
 return {...f.pair,adminSecret,operationKey:"synthetic-copy-001",expectedFingerprint:p.fingerprint};
}
test("copy clones bytes, keeps source and every non-content field, preserves originals and rollback",async()=>{
 const f=await fixture(),{t,ids}=f;const args=await request(f);
 const before=await t.run(async ctx=>({source:await ctx.db.get(ids.sourceId),target:await ctx.db.get(ids.targetId)}));
 const done=await t.action(api.profileContentCopy.apply,args);
 const after=await t.run(async ctx=>({source:await ctx.db.get(ids.sourceId),target:await ctx.db.get(ids.targetId)}));
 expect(after.source).toEqual(before.source);
 const omit=(r:Record<string,unknown>)=>Object.fromEntries(Object.entries(r).filter(([k])=>![...CONTENT_FIELDS,"imageStorageIds"].includes(k as never)));
 expect(omit(after.target!)).toEqual(omit(before.target!));
 expect(after.target!.job).toBe("New");expect(after.target!.shareableBio).toBe("Synthetic bio");
 const fresh=after.target!.imageStorageIds![0];expect(fresh).not.toBe(ids.image);expect(fresh).not.toBe(ids.old);
 await t.run(async ctx=>{
  expect(await (await ctx.storage.get(fresh))!.text()).toBe("source synthetic");
  expect(await ctx.storage.get(ids.old)).not.toBeNull();expect(await ctx.storage.get(ids.image)).not.toBeNull();
  expect((await ctx.db.query("photoUploads").withIndex("by_storageId",q=>q.eq("storageId",fresh)).unique())!.registrationId).toBe(ids.targetId);
 });
 expect(await t.action(api.profileContentCopy.apply,args)).toEqual({...done,alreadyApplied:true});
 expect(await t.mutation(api.profileContentCopy.rollback,{adminSecret,auditId:done.auditId})).toEqual({alreadyRolledBack:false});
 expect(await t.mutation(api.profileContentCopy.rollback,{adminSecret,auditId:done.auditId})).toEqual({alreadyRolledBack:true});
 expect(await t.run(ctx=>ctx.db.get(ids.targetId))).toEqual(before.target);
 await expect(t.action(api.profileContentCopy.apply,args)).rejects.toThrow("Operation key conflict");
});
test("auth rejects preview apply rollback before writes",async()=>{
 const f=await fixture(),args=await request(f);
 await expect(f.t.query(api.profileContentCopy.preview,{...f.pair,adminSecret:"bad"})).rejects.toThrow("Unauthorized");
 await expect(f.t.action(api.profileContentCopy.apply,{...args,adminSecret:"bad"})).rejects.toThrow("Unauthorized");
 const done=await f.t.action(api.profileContentCopy.apply,args);
 await expect(f.t.mutation(api.profileContentCopy.rollback,{adminSecret:"bad",auditId:done.auditId})).rejects.toThrow("Unauthorized");
});
for(const who of ["sourceId","targetId"] as const) test(who+" drift rejects apply and rollback",async()=>{
 const f=await fixture(),args=await request(f);
 await f.t.run(ctx=>ctx.db.patch(f.ids[who],{job:"concurrent"}));
 await expect(f.t.action(api.profileContentCopy.apply,args)).rejects.toThrow("scope drift");
 const fresh=await request(f);const done=await f.t.action(api.profileContentCopy.apply,fresh);
 await f.t.run(ctx=>ctx.db.patch(f.ids[who],{adminNotes:"concurrent"}));
 await expect(f.t.mutation(api.profileContentCopy.rollback,{adminSecret,auditId:done.auditId})).rejects.toThrow("scope drift");
});
for(const who of ["sourceId","targetId"] as const) test("missing "+who+" fails closed",async()=>{
 const f=await fixture();await f.t.run(ctx=>ctx.db.delete(f.ids[who]));
 await expect(f.t.query(api.profileContentCopy.preview,{...f.pair,adminSecret})).rejects.toThrow("not found");
});
test("identity confirmation and photo privacy are mandatory",async()=>{
 const f=await fixture();await expect(f.t.query(api.profileContentCopy.preview,{...f.pair,targetNumber:99,adminSecret})).rejects.toThrow("confirmation mismatch");
 await f.t.run(ctx=>ctx.db.patch(f.ids.sourceId,{photoSharingPermission:"yes"}));
 await expect(f.t.query(api.profileContentCopy.preview,{...f.pair,adminSecret})).rejects.toThrow("privacy differs");
});
test("source ownership conflict rejects and never edits source ledger",async()=>{
 const f=await fixture();await f.t.run(async ctx=>{const l=(await ctx.db.query("photoUploads").first())!;await ctx.db.patch(l._id,{registrationId:f.ids.targetId});});
 await expect(f.t.query(api.profileContentCopy.preview,{...f.pair,adminSecret})).rejects.toThrow("ownership mismatch");
});
test("prepared operation refuses duplicate action and finalization rechecks concurrency",async()=>{
 const f=await fixture(),args=await request(f);const {adminSecret:unused,...requestArgs}=args;void unused;
 const prepared=await f.t.mutation(internal.profileContentCopy.prepare,requestArgs);
 await expect(f.t.action(api.profileContentCopy.apply,args)).rejects.toThrow("already prepared");
 await f.t.run(ctx=>ctx.db.patch(f.ids.sourceId,{job:"changed"}));
 await expect(f.t.mutation(internal.profileContentCopy.finish,{auditId:prepared.auditId,copiedStorageIds:[]})).rejects.toThrow("scope drift");
});
test("copied originals cannot be adopted as new files",async()=>{
 const f=await fixture(),args=await request(f);const {adminSecret:unused,...requestArgs}=args;void unused;
 const p=await f.t.mutation(internal.profileContentCopy.prepare,requestArgs);
 await expect(f.t.mutation(internal.profileContentCopy.finish,{auditId:p.auditId,copiedStorageIds:[f.ids.image]})).rejects.toThrow("provenance");
});
test("source references remain unchanged; target references fail closed without revocation",async()=>{
 const f=await fixture();const share=await f.t.run(ctx=>ctx.db.insert("profileShares",{ownerRegistrationId:f.ids.sourceId,recipientRegistrationId:f.ids.sourceId,includeImages:true,status:"shared",shareToken:"synthetic",createdAt:1,updatedAt:1}));
 const before=await f.t.run(ctx=>ctx.db.get(share));await f.t.action(api.profileContentCopy.apply,await request(f));
 expect(await f.t.run(ctx=>ctx.db.get(share))).toEqual(before);
 await f.t.run(ctx=>ctx.db.patch(share,{recipientRegistrationId:f.ids.targetId}));
 await expect(f.t.query(api.profileContentCopy.preview,{...f.pair,adminSecret})).rejects.toThrow("relationship references");
});

test("repeated requests attach once and preserve event enrollment",async()=>{
 const f=await fixture(),args=await request(f);
 const enrollment=await f.t.run(async ctx=>{
  const eventId=await ctx.db.insert("events",{title:"Synthetic",eventCode:"synthetic",eventMonth:"2026-11",series:"test",location:"Test",maleCapacity:10,femaleCapacity:10,startsAt:100,endsAt:200,status:"scheduled",createdAt:1,updatedAt:1});
  return await ctx.db.insert("eventRegistrations",{eventId,registrationId:f.ids.targetId,gender:"female",registrationStatus:"approved",confirmationStatus:"confirmed",attendanceStatus:"not_checked_in",eligibilityStatus:"approved_member",createdAt:1,updatedAt:1});
 });
 const before=await f.t.run(ctx=>ctx.db.get(enrollment));
 await f.t.action(api.profileContentCopy.apply,args);
 expect((await f.t.action(api.profileContentCopy.apply,args)).alreadyApplied).toBe(true);
 expect(await f.t.run(ctx=>ctx.db.query("profileContentCopyAudits").collect())).toHaveLength(1);
 expect(await f.t.run(ctx=>ctx.db.get(enrollment))).toEqual(before);
});
test("same key different request is rejected and archived source fails closed",async()=>{
 const f=await fixture(),args=await request(f);await f.t.action(api.profileContentCopy.apply,args);
 await expect(f.t.action(api.profileContentCopy.apply,{...args,sourceNumber:999})).rejects.toThrow("Operation key conflict");
 await f.t.run(ctx=>ctx.db.patch(f.ids.sourceId,{archivedAt:1}));
 await expect(f.t.query(api.profileContentCopy.preview,{...f.pair,adminSecret})).rejects.toThrow("Inactive identity");
});

for(const which of ["source", "third"] as const) test("reject shared ledgerless target original: "+which,async()=>{
 const f=await fixture();
 await f.t.run(async ctx=>{
  if(which==="source") await ctx.db.patch(f.ids.sourceId,{imageStorageIds:[f.ids.old]});
  else { const target=(await ctx.db.get(f.ids.targetId))!;const {_id,_creationTime,...rest}=target;void _id;void _creationTime;await ctx.db.insert("registrations",{...rest,email:"third@example.invalid",publicApplicantNumber:999}); }
 });
 await expect(f.t.query(api.profileContentCopy.preview,{...f.pair,adminSecret})).rejects.toThrow("Ambiguous shared photo ownership");
 expect(await f.t.run(ctx=>ctx.db.query("profileContentCopyAudits").collect())).toHaveLength(0);
});
test("authenticated status exposes interrupted staged count without profile data",async()=>{
 const f=await fixture(),args=await request(f);const {adminSecret:unused,...requestArgs}=args;void unused;
 const p=await f.t.mutation(internal.profileContentCopy.prepare,requestArgs);
 const clone=await f.t.run(async ctx=>ctx.storage.store((await ctx.storage.get(f.ids.image))!));
 await f.t.mutation(internal.profileContentCopy.recordClone,{auditId:p.auditId,storageId:clone,index:0});
 const status=await f.t.query(api.profileContentCopy.status,{adminSecret,operationKey:args.operationKey});
 expect(status).toMatchObject({state:"prepared",stagedPhotoCount:1,recoveryRequired:true});
 expect(JSON.stringify(status)).not.toContain("example.invalid");
 await expect(f.t.query(api.profileContentCopy.status,{adminSecret:"wrong",operationKey:args.operationKey})).rejects.toThrow("Unauthorized");
 await expect(f.t.action(api.profileContentCopy.apply,args)).rejects.toThrow("reconcile");
});

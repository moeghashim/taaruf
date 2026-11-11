import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
const secret = "synthetic-matchmaker";
beforeEach(() => vi.stubEnv("ATTENDANCE_ADMIN_SECRET", secret));
afterEach(() => vi.unstubAllEnvs());
const mm = api.matchmakerMatching;
async function fixture() {
 const t = convexTest(schema, modules);
 const ids = await t.run(async ctx => {
  const base = {age:30, maritalStatus:"single", education:"College", job:"Engineer", phone:"5550100", status:"approved" as const, profileCompletionStatus:"completed" as const, searchStatus:"active" as const, createdAt:1};
  const male = await ctx.db.insert("registrations", {...base, name:"Private Man", gender:"male", email:"man@example.invalid", publicApplicantNumber:101});
  const female = await ctx.db.insert("registrations", {...base, name:"Private Woman", gender:"female", email:"woman@example.invalid", publicApplicantNumber:102});
  const other = await ctx.db.insert("registrations", {...base, name:"Other", gender:"male", email:"other@example.invalid"});
  for (const [registrationId, sessionHash] of [[male,"male"],[female,"female"],[other,"other"]] as const) await ctx.db.insert("applicantSessions", {registrationId, sessionHash, createdAt:Date.now(), expiresAt:Date.now()+100000});
  return {male,female,other};
 });
 const matchId = await t.mutation(api.matches.create, {adminSecret:secret, maleRegistrationId:ids.male, femaleRegistrationId:ids.female, adminNotes:"secret note"});
 await t.mutation(internal.matchmakerMatching.prepareEmailActivation, {});
 await t.run(async ctx => {const s = await ctx.db.query("settings").withIndex("by_key", q => q.eq("key", "matchmakerEmailActivationAt")).unique(); await ctx.db.patch(s!._id, {value: String(Date.now()-1000)});});
 const present = () => t.mutation(mm.present,{adminSecret:secret,matchId,emailReady:true});
 const optin = async () => {for (const sessionHash of ["male","female"]) await t.mutation(mm.setConsent,{sessionHash,optedIn:true});};
 return {t,...ids,matchId,present,optin};
}
test("draft is invisible, cannot approve or notify; consent defaults false",async()=>{
 const {t,matchId,male}=await fixture();
 expect(await t.query(mm.getMine,{sessionHash:"male"})).toMatchObject({optedIn:false,matches:[]});
 await expect(t.mutation(mm.approve,{sessionHash:"male",matchId})).rejects.toThrow("unavailable");
 await expect(t.mutation(mm.claimNotification,{adminSecret:secret,matchId,recipientId:male})).rejects.toThrow("unavailable");
 expect(await t.run(ctx=>ctx.db.query("matchmakerNotifications").collect())).toEqual([]);
});
test("both explicit consents rechecked on present, no partial notifications",async()=>{
 const {t,matchId,present,optin}=await fixture();
 await expect(present()).rejects.toThrow("Both applicants must opt in");
 await t.mutation(mm.setConsent,{sessionHash:"male",optedIn:true});
 await expect(present()).rejects.toThrow("Both applicants must opt in");
 await optin(); await t.mutation(mm.setConsent,{sessionHash:"female",optedIn:false});
 await expect(present()).rejects.toThrow("Both applicants must opt in");
 expect((await t.run(ctx=>ctx.db.get(matchId)))?.matchmakerPresentedAt).toBeUndefined();
 expect(await t.run(ctx=>ctx.db.query("matchmakerNotifications").collect())).toEqual([]);
});
test("presentation idempotent; DTO excludes admin, contact, capabilities and unconsented photos",async()=>{
 const {t,optin,present}=await fixture(); await optin();
 expect(await present()).toEqual({alreadyPresented:false}); expect(await present()).toEqual({alreadyPresented:true});
 const result=await t.query(mm.getMine,{sessionHash:"male"});
 expect(result.matches).toHaveLength(1);expect(result.matches[0].partner?.images).toEqual([]);
 const json=JSON.stringify(result); for(const sensitive of ["Private Woman","woman@example.invalid","5550100","secret note","profileAccessToken"]) expect(json).not.toContain(sensitive);
 expect(await t.run(ctx=>ctx.db.query("matchmakerNotifications").collect())).toHaveLength(2);
 expect(await t.run(ctx=>ctx.db.query("interests").collect())).toEqual([]);
});
test("notification permanent claim prevents repeat and ambiguous failure resend",async()=>{
 const {t,optin,present,matchId,male}=await fixture();await optin();await present();
 const args={adminSecret:secret,matchId,recipientId:male};
 const first=await t.mutation(mm.claimNotification,args);expect(first).not.toBeNull();
 expect(await t.mutation(mm.claimNotification,args)).toBeNull();
 await t.mutation(mm.recordNotification,{adminSecret:secret,deliveryId:first!.deliveryId,sent:false});
 expect(await t.mutation(mm.claimNotification,args)).toBeNull();
 await present(); expect(await t.mutation(mm.claimNotification,args)).toBeNull();
});
test("global optout independent from match approval, withdrawal closes only match",async()=>{
 const {t,optin,present,matchId}=await fixture(); await optin();await present();
 await t.mutation(mm.setConsent,{sessionHash:"male",optedIn:false});
 expect((await t.query(mm.getMine,{sessionHash:"male"})).matches).toHaveLength(1);
 await t.mutation(mm.approve,{sessionHash:"male",matchId});
 await t.mutation(mm.withdraw,{sessionHash:"female",matchId});
 expect((await t.query(mm.getMine,{sessionHash:"female"})).optedIn).toBe(true);
 await expect(t.mutation(mm.releaseContacts,{adminSecret:secret,matchId})).rejects.toThrow("not active");
 await expect(present()).rejects.toThrow("unavailable");
 await expect(t.mutation(mm.approve,{sessionHash:"male",matchId})).rejects.toThrow("unavailable");
});
test("both approvals and explicit admin release; shared history retained after optout, followups isolated",async()=>{
 const {t,optin,present,matchId,male,female}=await fixture();await optin();await present();
 const release=()=>t.mutation(mm.releaseContacts,{adminSecret:secret,matchId});
 await expect(release()).rejects.toThrow("Both applicants");
 await t.mutation(mm.approve,{sessionHash:"male",matchId});await expect(release()).rejects.toThrow("Both applicants");
 await t.mutation(mm.approve,{sessionHash:"female",matchId});
 expect((await t.query(mm.getMine,{sessionHash:"male"})).matches[0].contactShared).toBe(false);
 await release();await release();
 await t.mutation(mm.setConsent,{sessionHash:"male",optedIn:false});
 await expect(t.mutation(mm.withdraw,{sessionHash:"male",matchId})).rejects.toThrow("retained");
 const view=(await t.query(mm.getMine,{sessionHash:"male"})).matches[0];expect(view.partner?.email).toBe("woman@example.invalid");
 for(const [sessionHash,status] of [["male","contact_made"],["female","engaged"],["male","getting_to_know"],["male","not_proceeding"]] as const) await t.mutation(mm.followup,{sessionHash,matchId,status});
 const m=await t.run(ctx=>ctx.db.get(matchId));expect(m?.maleFollowup).toMatchObject({status:"not_proceeding",authorRegistrationId:male,updatedAt:expect.any(Number)});expect(m?.femaleFollowup).toMatchObject({status:"engaged",authorRegistrationId:female});
});
test("unauthenticated, expired and unrelated users cannot mutate or inspect pair",async()=>{
 const {t,optin,present,matchId}=await fixture(); await optin();await present();
 await expect(t.query(mm.getMine,{sessionHash:"bad"})).rejects.toThrow("Unauthorized");
 for(const fn of [mm.approve,mm.withdraw]) await expect(t.mutation(fn,{sessionHash:"other",matchId})).rejects.toThrow("unavailable");
 await expect(t.mutation(mm.followup,{sessionHash:"other",matchId,status:"engaged"})).rejects.toThrow("unavailable");
 await expect(t.mutation(mm.present,{matchId,adminSecret:"bad"})).rejects.toThrow("Unauthorized");
 expect((await t.query(mm.getMine,{sessionHash:"other"})).matches).toEqual([]);
 await t.run(async ctx=>{const s=await ctx.db.query("applicantSessions").withIndex("by_sessionHash",q=>q.eq("sessionHash","male")).unique();await ctx.db.patch(s!._id,{expiresAt:0});});
 await expect(t.mutation(mm.setConsent,{sessionHash:"male",optedIn:false})).rejects.toThrow("Unauthorized");
});
test("legacy shared manual record visible without inferred global optin; never re-presented",async()=>{
 const {t,matchId,present}=await fixture(); await t.run(ctx=>ctx.db.patch(matchId,{status:"closed",adminReleasedAt:1}));
 const result=await t.query(mm.getMine,{sessionHash:"male"}); expect(result.optedIn).toBe(false);expect(result.matches[0].contactShared).toBe(true);
 await expect(t.mutation(mm.withdraw,{sessionHash:"male",matchId})).rejects.toThrow("retained");await expect(present()).rejects.toThrow();
});
test("photo permission revocation and closed match stop new photo URLs",async()=>{
 const {t,female,optin,present,matchId}=await fixture();const storageId=await t.run(ctx=>ctx.storage.store(new Blob(["synthetic"])));
 await t.run(ctx=>ctx.db.patch(female,{imageStorageIds:[storageId],photoSharingPermission:"yes"}));await optin();await present();
 expect((await t.query(mm.getMine,{sessionHash:"male"})).matches[0].partner?.images).toHaveLength(1);
 await t.run(ctx=>ctx.db.patch(female,{photoSharingPermission:"no"}));expect((await t.query(mm.getMine,{sessionHash:"male"})).matches[0].partner?.images).toEqual([]);
 await t.run(ctx=>ctx.db.patch(female,{photoSharingPermission:"yes"}));await t.mutation(mm.withdraw,{sessionHash:"male",matchId});expect((await t.query(mm.getMine,{sessionHash:"male"})).matches[0].partner?.images).toEqual([]);
});
test("eligibility rechecked after draft and followup forbidden before sharing",async()=>{
 const {t,optin,present,matchId,female}=await fixture();await optin();await t.run(ctx=>ctx.db.patch(female,{searchStatus:"paused"}));await expect(present()).rejects.toThrow("actively searching");
 await t.run(ctx=>ctx.db.patch(female,{searchStatus:"active"}));await present();await expect(t.mutation(mm.followup,{sessionHash:"male",matchId,status:"engaged"})).rejects.toThrow("must be shared");
});

test("notification bookkeeping cannot fabricate contact release and admin resets retain presented history",async()=>{
 const {t,matchId,male,female,optin,present}=await fixture();
 await expect(t.mutation(api.matches.markContactSharedNotificationSent,{adminSecret:secret,id:matchId,sent:true})).rejects.toThrow("Contacts must be released");
 expect((await t.query(mm.getMine,{sessionHash:"male"})).matches).toEqual([]);
 await optin();await present();
 for(const fn of [api.matches.resetPair,api.matches.deletePairConnection]) await expect(t.mutation(fn,{adminSecret:secret,registrationAId:male,registrationBId:female})).rejects.toThrow("retained");
 expect(await t.run(ctx=>ctx.db.get(matchId))).not.toBeNull();
});


test.each(["paused", "closed", "declined"] as const)("%s introductions remain withdrawable without offering approval", async status => {
 const {t,optin,present,matchId}=await fixture();await optin();await present();
 for(const sessionHash of ["male","female"]) await t.mutation(mm.approve,{sessionHash,matchId});
 await t.mutation(api.matches.updateStatus,{adminSecret:secret,id:matchId,status});
 expect((await t.query(mm.getMine,{sessionHash:"male"})).matches[0]).toMatchObject({canWithdraw:true,canApprove:false});
 await expect(t.mutation(mm.approve,{sessionHash:"male",matchId})).rejects.toThrow("unavailable");
 await t.mutation(mm.withdraw,{sessionHash:"male",matchId});
 expect((await t.query(mm.getMine,{sessionHash:"male"})).matches[0]).toMatchObject({canWithdraw:false,canApprove:false,withdrawnAt:expect.any(Number)});
 await expect(t.mutation(api.matches.resume,{adminSecret:secret,id:matchId})).rejects.toThrow();
 await expect(t.mutation(mm.releaseContacts,{adminSecret:secret,matchId})).rejects.toThrow();
});

test.each([false,true])("missing partner retains introduction history (shared=%s)",async shared=>{
 const {t,optin,present,matchId,female}=await fixture();await optin();await present();
 expect((await t.query(mm.getMine,{sessionHash:"male"})).matches[0].canApprove).toBe(true);
 if(shared){
  for(const sessionHash of ["male","female"]) await t.mutation(mm.approve,{sessionHash,matchId});
  await t.mutation(mm.releaseContacts,{adminSecret:secret,matchId});
  await t.mutation(mm.followup,{sessionHash:"female",matchId,status:"contact_made"});
 }
 const before=await t.run(ctx=>ctx.db.get(matchId));
 await t.run(ctx=>ctx.db.delete(female));
 const result=await t.query(mm.getMine,{sessionHash:"male"});
 expect(result.matches).toHaveLength(1);
 expect(result.matches[0]).toMatchObject({_id:matchId,partner:null,contactShared:shared,canWithdraw:!shared,canApprove:false,presentedAt:before?.matchmakerPresentedAt});
 if(shared) expect(result.matches[0].partnerFollowup).toMatchObject({status:"contact_made"});
 expect(await t.run(ctx=>ctx.db.get(matchId))).toEqual(before);
 expect(JSON.stringify(result)).not.toContain("woman@example.invalid");
 expect((await t.query(mm.getMine,{sessionHash:"other"})).matches).toEqual([]);
});

test("disabled presentation never becomes historical queue",async()=>{
 const {t,optin,matchId,male}=await fixture();await optin();
 await t.mutation(mm.present,{adminSecret:secret,matchId,emailReady:false});
 await t.mutation(mm.present,{adminSecret:secret,matchId,emailReady:true});
 expect(await t.mutation(mm.claimNotification,{adminSecret:secret,matchId,recipientId:male})).toBeNull();
 expect((await t.run(ctx=>ctx.db.query("matchmakerNotifications").collect())).every(n=>n.status==="failed" && n.activationAt===undefined)).toBe(true);
});
test("legacy pending rows without activation stamp cannot send",async()=>{
 const {t,optin,present,matchId,male}=await fixture();await optin();await present();
 await t.run(async ctx=>{for(const n of await ctx.db.query("matchmakerNotifications").collect())await ctx.db.patch(n._id,{activationAt:undefined});});
 expect(await t.mutation(mm.claimNotification,{adminSecret:secret,matchId,recipientId:male})).toBeNull();
});
test("activation is immutable and readiness requires admin",async()=>{
 const {t}=await fixture();const first=await t.mutation(internal.matchmakerMatching.prepareEmailActivation,{});
 expect(await t.mutation(internal.matchmakerMatching.prepareEmailActivation,{})).toEqual(first);
 await expect(t.query(mm.emailReadiness,{})).rejects.toThrow("Unauthorized");
});
test("partner optout prevents recipient send",async()=>{
 const {t,optin,present,matchId,male}=await fixture();await optin();await present();
 await t.mutation(mm.setConsent,{sessionHash:"female",optedIn:false});
 expect(await t.mutation(mm.claimNotification,{adminSecret:secret,matchId,recipientId:male})).toBeNull();
});

test('generic settings cannot create or change matching activation cutoff', async () => {
 const t = convexTest(schema, modules);
 const key = 'matchmakerEmailActivationAt';
 await expect(t.mutation(api.settings.set, {adminSecret:secret,key,value:'1'})).rejects.toThrow('immutable');
 expect(await t.query(mm.emailReadiness,{adminSecret:secret})).toEqual({activationAt:null});
 const original = await t.mutation(internal.matchmakerMatching.prepareEmailActivation,{});
 for (const value of ['1',String(original.activationAt+1),'invalid','0']) {
  await expect(t.mutation(api.settings.set,{adminSecret:secret,key,value})).rejects.toThrow('immutable');
  expect(await t.query(mm.emailReadiness,{adminSecret:secret})).toEqual(original);
 }
 expect(await t.mutation(internal.matchmakerMatching.prepareEmailActivation,{})).toEqual(original);
});

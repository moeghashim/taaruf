import {convexTest} from "convex-test";
import {test,expect,vi,afterEach} from "vitest";
import {api} from "./_generated/api";
import schema from "./schema";
import {modules} from "./test.setup";
afterEach(()=>vi.unstubAllEnvs());
async function fixture(){
 vi.stubEnv("ATTENDANCE_ADMIN_SECRET","review-secret");
 const t=convexTest(schema,modules);
 const ids=await t.run(async ctx=>{
 const base={age:30,maritalStatus:"single",education:"College",job:"Engineer",phone:"5550100",status:"approved" as const,profileCompletionStatus:"completed" as const,searchStatus:"active" as const,backgroundMatchmakingOptIn:true,createdAt:1};
 const male=await ctx.db.insert("registrations",{...base,name:"Synthetic Man",gender:"male",email:"m@example.invalid"});
 const female=await ctx.db.insert("registrations",{...base,name:"Synthetic Woman",gender:"female",email:"f@example.invalid"});
 for(const [id,hash] of [[male,"m"],[female,"f"]] as const) await ctx.db.insert("applicantSessions",{registrationId:id,sessionHash:hash,createdAt:Date.now(),expiresAt:Date.now()+100000});
 return {male,female};
 });
 const matchId=await t.mutation(api.matches.create,{adminSecret:"review-secret",maleRegistrationId:ids.male,femaleRegistrationId:ids.female});
 return {t,...ids,matchId};
}
test("notification bookkeeping cannot expose an unpresented draft",async()=>{
 const {t,matchId}=await fixture();
 await expect(t.mutation(api.matches.markContactSharedNotificationSent,{adminSecret:"review-secret",id:matchId,sent:true})).rejects.toThrow("Contacts must be released");
 expect((await t.query(api.matchmakerMatching.getMine,{sessionHash:"m"})).matches).toEqual([]);
});
test("resetPair retains released manual record",async()=>{
 const {t,matchId,male,female}=await fixture();
 await t.mutation(api.matchmakerMatching.present,{adminSecret:"review-secret",matchId});
 for(const sessionHash of ["m","f"]) await t.mutation(api.matchmakerMatching.approve,{sessionHash,matchId});
 await t.mutation(api.matchmakerMatching.releaseContacts,{adminSecret:"review-secret",matchId});
 await expect(t.mutation(api.matches.resetPair,{adminSecret:"review-secret",registrationAId:male,registrationBId:female})).rejects.toThrow("retained");
 expect(await t.run(ctx=>ctx.db.get(matchId))).not.toBeNull();
});
test.each(["male", "female"] as const)("%s context-free shares cannot bypass presentation or withdrawal",async side=>{
 const {t,matchId,male,female}=await fixture();
 const ownerRegistrationId=side === "male" ? male : female;
 const recipientRegistrationId=side === "male" ? female : male;
 const args={adminSecret:"review-secret",ownerRegistrationId,recipientRegistrationId,includeImages:false,shareToken:"synthetic-review-token"};
 await t.mutation(api.matchmakerMatching.present,{adminSecret:"review-secret",matchId});
 await expect(t.mutation(api.profileShares.create,args)).rejects.toThrow("Share context is unavailable");
 // Simulate an already-issued unscoped token from the vulnerable implementation.
 await t.run(async ctx=>{ const match=await ctx.db.get(matchId); await ctx.db.insert("profileShares",{ownerRegistrationId,recipientRegistrationId,includeImages:false,shareToken:"prior-unscoped",status:"shared",createdAt:match!.createdAt,updatedAt:match!.createdAt}); });
 await t.mutation(api.profileShares.create,{...args,matchId,shareToken:"scoped-token"});
 expect(await t.query(api.profileShares.getByShareToken,{shareToken:"scoped-token"})).not.toBeNull();
 await t.mutation(api.matchmakerMatching.withdraw,{sessionHash:"f",matchId});
 for (const shareToken of ["prior-unscoped","scoped-token"]) expect(await t.query(api.profileShares.getByShareToken,{shareToken})).toBeNull();
 await expect(t.mutation(api.profileShares.create,args)).rejects.toThrow("Share context is unavailable");
});
test("older legitimate shares remain readable despite a later withdrawn recommendation",async()=>{
 const {t,matchId,male,female}=await fixture();
 await t.run(async ctx=>{
  const match=await ctx.db.get(matchId);
  const olderId=await ctx.db.insert("matches",{maleRegistrationId:male,femaleRegistrationId:female,status:"closed",contactGate:"contacts_released",interestType:"admin_suggested",createdAt:1,updatedAt:1});
  // Linked history uses an active historical share context, independent of the new recommendation.
  await ctx.db.patch(olderId,{status:"paused"});
  for(const [token,linked] of [["older-free",false],["older-linked",true]] as const) await ctx.db.insert("profileShares",{ownerRegistrationId:female,recipientRegistrationId:male,includeImages:false,shareToken:token,status:"shared",createdAt:match!.createdAt-1,updatedAt:match!.createdAt-1,...(linked?{matchId:olderId}:{})});
 });
 await t.mutation(api.matchmakerMatching.present,{adminSecret:"review-secret",matchId});
 await t.mutation(api.matchmakerMatching.withdraw,{sessionHash:"f",matchId});
 for(const shareToken of ["older-free","older-linked"]) expect(await t.query(api.profileShares.getByShareToken,{shareToken})).not.toBeNull();
});
test("provider cooldown persists across requests without consuming another claim",async()=>{
 const {t,matchId,male,female}=await fixture();
 await t.mutation(api.matchmakerMatching.present,{adminSecret:"review-secret",matchId});
 const first=await t.mutation(api.matchmakerMatching.claimNotification,{adminSecret:"review-secret",matchId,recipientId:male});
 await t.mutation(api.matchmakerMatching.recordNotification,{adminSecret:"review-secret",deliveryId:first!.deliveryId,sent:false,retryAfterMs:3600000});
 expect(await t.mutation(api.matchmakerMatching.claimNotification,{adminSecret:"review-secret",matchId,recipientId:female})).toBeNull();
 expect(await t.run(async ctx=>(await ctx.db.query("matchmakerNotifications").withIndex("by_key",q=>q.eq("key","matchmaker:"+matchId+":"+female)).unique())?.status)).toBe("pending");
});

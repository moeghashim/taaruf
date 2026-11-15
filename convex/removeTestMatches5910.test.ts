import {convexTest} from "convex-test";
import {expect,test,vi} from "vitest";
import {makeFunctionReference} from "convex/server";
import type {Id} from "./_generated/dataModel";
import schema from "./schema";
import {modules} from "./test.setup";
// convex-test uses synthetic IDs; only the constants module is mapped, never the implementation.
const ids=vi.hoisted(()=>({PAIR:["000000000000000010000registrations","000000000000000010001registrations"],TARGETS:["000000000000000010002matches","000000000000000010003matches"],INTEREST:"000000000000000010004interests"}));
vi.mock("./removeTestMatches5910Scope",()=>ids);
const preview=makeFunctionReference<"query">("removeTestMatches5910:preview"),remove=makeFunctionReference<"mutation">("removeTestMatches5910:remove");
async function fixture(){
 const t=convexTest(schema,modules);
 // Use real allocated IDs, propagated solely through the mocked constants module.
 const sentinel=await t.run(async ctx=>{
  for(const [i,gender] of (["male","female"] as const).entries())ids.PAIR[i]=await ctx.db.insert("registrations",{name:"Synthetic TEST",gender,age:30,maritalStatus:"single",education:"College",job:"Test",email:i+"@example.invalid",phone:"555",paymentStatus:"paid",status:"approved",publicApplicantNumber:[334,220][i],createdAt:1});
  const [a,b]=ids.PAIR as Id<"registrations">[];
  ids.INTEREST=await ctx.db.insert("interests",{fromRegistrationId:a,toRegistrationId:b,eventId:"100events" as Id<"events">,visibility:"admin_actionable",source:"admin_entered",status:"closed",adminStatus:"matched",createdAt:1,updatedAt:1});
  for(let i=0;i<2;i++)ids.TARGETS[i]=await ctx.db.insert("matches",{maleRegistrationId:a,femaleRegistrationId:b,status:"closed",interestType:i?"mutual_interest":"admin_suggested",adminNotes:"TEST ONLY",...(i?{interestId:ids.INTEREST as Id<"interests">}:{}),createdAt:1,updatedAt:1});
  await ctx.db.patch(ids.INTEREST as Id<"interests">,{matchId:ids.TARGETS[1] as Id<"matches">});
  const other=await ctx.db.insert("matches",{maleRegistrationId:a,femaleRegistrationId:b,status:"new",interestType:"mutual_interest",createdAt:2,updatedAt:2});
  await ctx.db.patch(a,{activeMatchId:other});
  await ctx.db.patch(b,{activeMatchId:ids.TARGETS[0] as Id<"matches">});
  await ctx.db.insert("profileShares",{ownerRegistrationId:a,recipientRegistrationId:b,matchId:ids.TARGETS[1] as Id<"matches">,status:"closed",includeImages:false,shareToken:"synthetic",createdAt:1,updatedAt:1});
  await ctx.db.insert("matchmakerNotifications",{matchId:ids.TARGETS[0] as Id<"matches">,recipientId:b,status:"pending",key:"test",createdAt:1});
  const queued=await ctx.db.insert("interests",{fromRegistrationId:b,toRegistrationId:a,eventId:"100events" as Id<"events">,source:"admin_entered",visibility:"admin_actionable",status:"queued",createdAt:2,updatedAt:2});
  return {other:await ctx.db.get(other),queued:await ctx.db.get(queued),a:await ctx.db.get(a)};
 });
 const p=await t.query(preview,{});
 return {t,sentinel,args:{expectedIds:ids.TARGETS,expectedFingerprint:p.fingerprint,confirm:"DELETE BOTH TEST MATCHES 334-220 / 5910"}};
}
test("atomic removal, exact references only, no queues/emails, replay safe",async()=>{
 const f=await fixture();const r=await f.t.mutation(remove,f.args);
 const after=await f.t.run(async ctx=>({matches:await ctx.db.query("matches").collect(),interests:await ctx.db.query("interests").collect(),regs:await ctx.db.query("registrations").collect(),shares:await ctx.db.query("profileShares").collect(),notifications:await ctx.db.query("matchmakerNotifications").collect(),jobs:await ctx.db.system.query("_scheduled_functions").collect(),audits:await ctx.db.query("pairTestResetAudits").collect()}));
 expect(after.matches).toEqual([f.sentinel.other]);expect(after.interests.find(i=>i._id===f.sentinel.queued!._id)).toEqual(f.sentinel.queued);expect(after.regs.find(r=>r._id===ids.PAIR[0])).toEqual(f.sentinel.a);expect(after.regs).toHaveLength(2);expect(after.regs[1].activeMatchId).toBeUndefined();expect(after.interests[0].matchId).toBeUndefined();expect(after.shares[0].matchId).toBeUndefined();expect(after.notifications).toEqual([]);expect(after.jobs).toEqual([]);expect(after.audits).toHaveLength(1);expect(JSON.parse(after.audits[0].snapshot).matches).toHaveLength(2);
 expect(await f.t.mutation(remove,f.args)).toEqual({...r,alreadyRemoved:true});
});
for(const drift of ["fingerprint","ids","active","released","missing","identity","foreignInterest","share","claimed","contactHistory"] as const)test("fail closed: "+drift,async()=>{
 const f=await fixture();
 await f.t.run(async ctx=>{
 const m=ids.TARGETS[0] as Id<"matches">;
 if(drift==="active")await ctx.db.patch(m,{status:"new"});
 if(drift==="released")await ctx.db.patch(m,{adminReleasedAt:1});
 if(drift==="missing")await ctx.db.delete(m);
 if(drift==="identity")await ctx.db.patch(ids.PAIR[0] as Id<"registrations">,{publicApplicantNumber:1});
 if(drift==="foreignInterest")await ctx.db.insert("interests",{fromRegistrationId:ids.PAIR[0] as Id<"registrations">,toRegistrationId:ids.PAIR[1] as Id<"registrations">,matchId:m,eventId:"100events" as Id<"events">,source:"admin_entered",visibility:"admin_actionable",status:"closed",createdAt:1,updatedAt:1});
 if(drift==="share")await ctx.db.patch((await ctx.db.query("profileShares").first())!._id,{status:"viewed"});
 if(drift==="claimed")await ctx.db.patch((await ctx.db.query("matchmakerNotifications").first())!._id,{status:"claimed"});
 if(drift==="contactHistory")await ctx.db.insert("contactReleaseEmails",{matchId:m,recipientId:ids.PAIR[0] as Id<"registrations">,key:"test",email:"test@example.invalid",releaseAt:1,activationAt:1,createdAt:1,status:"sent",attempts:1,nextAttemptAt:1});
 });
 if(drift==="fingerprint")f.args.expectedFingerprint="stale";
 if(drift==="ids")f.args.expectedIds=[ids.TARGETS[0]];
 const before=await f.t.run(ctx=>ctx.db.query("matches").collect());
 await expect(f.t.mutation(remove,f.args)).rejects.toThrow();
 expect(await f.t.run(ctx=>ctx.db.query("matches").collect())).toEqual(before);expect(await f.t.run(ctx=>ctx.db.query("pairTestResetAudits").collect())).toEqual([]);
});

import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { isArchivedInterest } from "../src/lib/interest-lifecycle";
import { preview as definition, removeAndRefund as mutationDefinition } from "./adminRefund6336";
// Only the ID constants are adapted to convex-test-generated IDs. No production
// code accepts a testing flag or alternate scope. All data below is synthetic.
const scope = vi.hoisted(() => ({ interestId: "", eventId: "", fromRegistrationId: "", toRegistrationId: "" }));
vi.mock("./adminRefund6336Scope", () => ({ exactScope6336: scope }));
const preview = makeFunctionReference<"query">("adminRefund6336:preview");
const remove = makeFunctionReference<"mutation">("adminRefund6336:removeAndRefund");
beforeEach(() => vi.stubEnv("ATTENDANCE_ADMIN_SECRET", "synthetic-admin"));
afterEach(() => vi.unstubAllEnvs());
async function fixture() {
 const t = convexTest(schema, modules);
 const ids = await t.run(async ctx => {
  const reg = (n: number, gender: "male" | "female") => ctx.db.insert("registrations", { publicApplicantNumber:n,name:"Synthetic",gender,age:30,maritalStatus:"single",education:"College",job:"Test",email:n+"@example.invalid",phone:"555",paymentStatus:"paid",status:"approved",createdAt:1 });
  const fromRegistrationId=await reg(267,"male"),toRegistrationId=await reg(257,"female"),other=await reg(9001,"female");
  const eventId=await ctx.db.insert("events",{title:"Synthetic",eventCode:"nov26",eventMonth:"2026-11",series:"test",location:"Test",startsAt:1,endsAt:2,status:"scheduled",maleCapacity:50,femaleCapacity:50,createdAt:1,updatedAt:1});
  const interestId=await ctx.db.insert("interests",{eventId,fromRegistrationId,toRegistrationId,source:"platform_submission",status:"closed",adminStatus:"pending",visibility:"admin_actionable",notes:"Synthetic history",createdAt:1,updatedAt:2});
  for(let n=0;n<2;n++) await ctx.db.insert("interests",{eventId,fromRegistrationId,toRegistrationId:other,source:"platform_submission",visibility:"internal_only",status:"new",createdAt:1,updatedAt:1});
  const flowId=await ctx.db.insert("interestFlows",{interestId,fromRegistrationId,toRegistrationId,flowStatus:"awaiting_inbound_response",recipientDecision:"pending",requesterFinalApproval:"pending",recipientFinalApproval:"pending",photoDecision:"pending",createdAt:1,updatedAt:1});
  await ctx.db.insert("interestFlowEvents",{interestId,interestFlowId:flowId,actor:"system",eventType:"flow_created",message:"Synthetic retained history",createdAt:1});
  return {interestId,eventId,fromRegistrationId,toRegistrationId,flowId,other};
 });
 Object.assign(scope,{interestId:ids.interestId,eventId:ids.eventId,fromRegistrationId:ids.fromRegistrationId,toRegistrationId:ids.toRegistrationId});
 const args={...scope,adminSecret:"synthetic-admin"}; const p=await t.query(preview,args);
 return {t,ids,args:{...args,expectedFingerprint:p.fingerprint,confirm:"ADMIN REMOVE CLOSED 267 TO 257; RETURN ONE SLOT"}};
}
async function state(t:ReturnType<typeof convexTest>) { return t.run(async ctx=>({interests:await ctx.db.query("interests").collect(),flows:await ctx.db.query("interestFlows").collect(),history:await ctx.db.query("interestFlowEvents").collect(),registrations:await ctx.db.query("registrations").collect(),audits:await ctx.db.query("adminPairRemovalAudits").collect(),jobs:await ctx.db.system.query("_scheduled_functions").collect()})); }
async function quota(f:Awaited<ReturnType<typeof fixture>>) { return f.t.run(async ctx=>Promise.all([f.ids.fromRegistrationId,f.ids.toRegistrationId].map(async id=>{const rows=await ctx.db.query("interests").withIndex("by_submission_quota",q=>q.eq("fromRegistrationId",id).eq("eventId",f.ids.eventId).eq("source","platform_submission").eq("testReset",undefined).eq("slotReturnedAt",undefined)).take(3);return {used:rows.length,available:3-rows.length,ids:rows.map(r=>r._id)};}))); }
test("atomic one-slot refund; retained audit/history; derived ribbon, quota and admin count semantics; repeat no-op",async()=>{
 const f=await fixture(),before=await state(f.t);
 expect((await quota(f)).map(({used,available})=>({used,available}))).toEqual([{used:3,available:0},{used:0,available:3}]);
 expect(definition.isInternal).toBe(true);expect(mutationDefinition.isInternal).toBe(true);
 const result=await f.t.mutation(remove,f.args),after=await state(f.t);
 expect(result.slotsReturned).toBe(1);
 expect((await quota(f)).map(({used,available})=>({used,available}))).toEqual([{used:2,available:1},{used:0,available:3}]);
 expect((await quota(f))[0].ids).not.toContain(f.ids.interestId);
 expect(after.registrations).toEqual(before.registrations);expect(after.jobs).toEqual([]);
 expect(after.interests.filter(i=>i._id!==f.ids.interestId)).toEqual(before.interests.filter(i=>i._id!==f.ids.interestId));
 const row=after.interests.find(i=>i._id===f.ids.interestId)!;
 expect(row).toMatchObject({...before.interests[0],updatedAt:row.updatedAt});expect(row.slotReturnedAt).toBe(row.adminRemovedAt);expect(row.testReset).toBeUndefined();
 expect(after.flows[0]).toMatchObject({...before.flows[0],flowStatus:"closed",updatedAt:after.flows[0].updatedAt,closedReason:"admin_removed_refunded"});
 expect(after.history.slice(0,before.history.length)).toEqual(before.history);expect(after.history.at(-1)).toMatchObject({actor:"admin",eventType:"admin_removed_refunded"});
 expect(after.audits).toHaveLength(1);expect(after.audits[0].request).not.toContain("synthetic-admin");expect(JSON.parse(after.audits[0].snapshot).target).toEqual(before.interests[0]);
 const all=await f.t.query(api.interests.getAll,{adminSecret:"synthetic-admin"});
 expect(all.find(i=>i._id===f.ids.interestId)?.workbenchReview.label).toBe("Closed — Admin removed; submission slot returned");
 const detail=await f.t.query(api.interests.getByRegistration,{adminSecret:"synthetic-admin",registrationId:f.ids.fromRegistrationId});
 expect(detail.outbound).toHaveLength(3);expect(detail.outbound.filter(isArchivedInterest)).toHaveLength(1); // historical total, NOT charged quota
 expect(await f.t.mutation(remove,f.args)).toEqual({...result,alreadyRemoved:true,slotsReturned:0});expect(await state(f.t)).toEqual(after);
 await expect(f.t.mutation(remove,{...f.args,expectedFingerprint:"other"})).rejects.toThrow("different request");
});
for(const drift of ["auth","pair","event","id","status","source","number","eventCode","refunded","removed","test","flow","contact","canonical","fingerprint","history","quota"] as const)test("no writes on "+drift,async()=>{
 const f=await fixture();
 if(drift==="auth")f.args.adminSecret="wrong";
 if(drift==="pair")f.args.toRegistrationId=f.ids.other;
 if(drift==="event")f.args.eventId="100events";
 if(drift==="id")f.args.interestId="100interests";
 if(drift==="fingerprint")f.args.expectedFingerprint="stale";
 await f.t.run(async ctx=>{
  if(drift==="status")await ctx.db.patch(f.ids.interestId,{status:"new"});
  if(drift==="source")await ctx.db.patch(f.ids.interestId,{source:"admin_entered"});
  if(drift==="number")await ctx.db.patch(f.ids.fromRegistrationId,{publicApplicantNumber:999});
  if(drift==="eventCode")await ctx.db.patch(f.ids.eventId,{eventCode:"other"});
  if(drift==="refunded")await ctx.db.patch(f.ids.interestId,{slotReturnedAt:4});
  if(drift==="removed")await ctx.db.patch(f.ids.interestId,{adminRemovedAt:4});
  if(drift==="test")await ctx.db.patch(f.ids.interestId,{testReset:{at:4,reason:"synthetic",actor:"admin"}});
  if(drift==="flow")await ctx.db.patch(f.ids.flowId,{flowStatus:"contact_shared"});
  if(drift==="contact")await ctx.db.patch(f.ids.flowId,{contactSharedAt:4});
  if(drift==="canonical")await ctx.db.patch(f.ids.interestId,{canonicalInterestId:f.ids.interestId});
  if(drift==="history")await ctx.db.patch((await ctx.db.query("interestFlowEvents").first())!._id,{message:"changed"});
  if(drift==="quota")await ctx.db.patch((await ctx.db.query("interests").collect())[1]._id,{slotReturnedAt:4});
 });
 const before=await state(f.t);await expect(f.t.mutation(remove,f.args)).rejects.toThrow();expect(await state(f.t)).toEqual(before);
});
test("preview also rejects unauthorized access",async()=>{const f=await fixture();await expect(f.t.query(preview,{...scope,adminSecret:"wrong"})).rejects.toThrow("Unauthorized");});

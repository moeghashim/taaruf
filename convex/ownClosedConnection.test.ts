import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { modules } from "./test.setup";
import { ownClosedDecision } from "./ownClosedConnection";

for (const scenario of ["valid", "counterpart", "admin", "unknown", "closed", "expired", "reset", "wrong-flow", "old-event"] as const) test("closed receipt provenance: " + scenario, async () => {
 const t=convexTest(schema,modules);
 await t.run(async ctx=>{
  const base={age:30,maritalStatus:"single",education:"College",job:"Test",phone:"",status:"approved" as const,createdAt:10};
  const from=await ctx.db.insert("registrations",{...base,name:"Synthetic M",gender:"male",email:"m@example.invalid"});
  const to=await ctx.db.insert("registrations",{...base,name:"Synthetic F",gender:"female",email:"f@example.invalid"});
  const eventId=await ctx.db.insert("events",{title:"Synthetic",eventCode:"test",eventMonth:"2026-11",series:"test",location:"Test",startsAt:10,endsAt:20,status:"completed",maleCapacity:1,femaleCapacity:1,createdAt:10,updatedAt:20});
  const id=await ctx.db.insert("interests",{eventId,fromRegistrationId:from,toRegistrationId:to,source:"admin_entered",status:scenario === "closed" || scenario === "expired" ? "closed" : "declined",visibility:"admin_actionable",...(scenario === "reset" ? {testReset:{at:20,actor:"admin",reason:"test"}} : {}),createdAt:10,updatedAt:20});
  const values={interestId:id,fromRegistrationId:from,toRegistrationId:to,flowStatus:"declined" as const,recipientDecision:"declined" as const,requesterFinalApproval:"pending" as const,recipientFinalApproval:"pending" as const,photoDecision:"pending" as const,createdAt:10,updatedAt:20};
  const fid=await ctx.db.insert("interestFlows",values);
  if(scenario !== "unknown") await ctx.db.insert("interestFlowEvents",{interestFlowId:scenario === "wrong-flow" ? await ctx.db.insert("interestFlows",values) : fid,interestId:id,actor:scenario === "admin" ? "admin" : "applicant",actorRegistrationId:scenario === "counterpart" ? from : to,eventType:"inbound_declined",createdAt:scenario === "old-event" ? 9 : 20});
  const before=await ctx.db.query("interestFlowEvents").collect();
  expect(await ownClosedDecision(ctx,(await ctx.db.get(id))!,(await ctx.db.get(fid))!,to)).toBe(scenario === "valid" ? "declined" : null);
  expect(await ctx.db.query("interestFlowEvents").collect()).toEqual(before);
 });
});

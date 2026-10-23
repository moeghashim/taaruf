import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { modules } from "./test.setup";
import { canonical, clearExact, digest } from "./zClearAprilLegacy";
async function fixture() {
  const t = convexTest(schema, modules);
  const expected = await t.run(async ctx => {
    const eventId = await ctx.db.insert("events", { title:"test",eventCode:"apr26",eventMonth:"2026-04",series:"1plus1_match",location:"test",startsAt:1,endsAt:2,status:"scheduled",maleCapacity:60,femaleCapacity:60,createdAt:1,updatedAt:1 });
    for(let i=0;i<23;i++) {
      const registrationId = await ctx.db.insert("registrations",{name:"synthetic",age:30,gender:"male",maritalStatus:"single",education:"college",job:"test",email:"synthetic@example.invalid",phone:"000",paymentStatus:"paid",status:i<16?"approved":"pending",searchStatus:"active",createdAt:1});
      if(i===22) await ctx.db.delete(registrationId);
      await ctx.db.insert("eventWaitlistEntries",{eventId,registrationId,gender:"male",status:"active",createdAt:1,updatedAt:1});
    }
    return (await ctx.db.query("eventWaitlistEntries").collect()).sort((a,b)=>a._id.localeCompare(b._id));
  });
  return {t,expected,authorized:await digest(expected)};
}
test("soft-clears exactly 23 including orphan, preserves profiles, history, idempotence",async()=>{
  const {t,expected,authorized}=await fixture();
  const before=await t.run(ctx=>ctx.db.query("registrations").collect());
  expect(await t.run(ctx=>clearExact(ctx,expected,authorized))).toEqual({cleared:23,alreadyRemoved:0,active:0});
  const after=await t.run(ctx=>ctx.db.query("eventWaitlistEntries").collect());
  expect(after).toHaveLength(23);expect(after.every(r=>r.status==="removed")).toBe(true);
  expect(await t.run(ctx=>ctx.db.query("registrations").collect())).toEqual(before);
  expect(await t.run(ctx=>clearExact(ctx,expected,authorized))).toEqual({cleared:0,alreadyRemoved:23,active:0});
  expect(await t.run(ctx=>ctx.db.query("eventWaitlistEntries").collect())).toEqual(after);
});
for(const kind of ["count","duplicate","digest","wrong-event","current-value","current-id","new-entry","partial"]) test("fails closed: "+kind,async()=>{
 const {t,expected,authorized}=await fixture();
 let supplied=expected;let auth=authorized;
 if(kind==="count") supplied=expected.slice(1);
 if(kind==="duplicate") supplied=expected.map((r,i)=>i===0?expected[1]:r);
 if(kind==="digest") auth="wrong";
 await t.run(async ctx=>{
  if(kind==="wrong-event")await ctx.db.patch(expected[0].eventId,{eventCode:"other"});
  if(kind==="current-value")await ctx.db.patch(expected[22]._id,{updatedAt:2});
  if(kind==="current-id"||kind==="new-entry"){
   const {_id,_creationTime,...copy}=expected[0];void _creationTime;
   if(kind==="current-id")await ctx.db.delete(_id);
   await ctx.db.insert("eventWaitlistEntries",copy);
  }
  if(kind==="partial")await ctx.db.patch(expected[22]._id,{status:"removed",updatedAt:2,removedAt:2});
 });
 const before=await t.run(ctx=>ctx.db.query("eventWaitlistEntries").collect());
 await expect(t.run(ctx=>clearExact(ctx,supplied,auth))).rejects.toThrow();
 expect(canonical(await t.run(ctx=>ctx.db.query("eventWaitlistEntries").collect()))).toBe(canonical(before));
});

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { modules } from "./test.setup";
import { plan, applyMerge, rollbackMerge, snapshot, fingerprint } from "./registrationMerge163144";
async function fixture() {
 const t=convexTest(schema,modules);
 const pair=await t.run(async ctx=>{
 const base={name:"Synthetic",gender:"female" as const,age:30,maritalStatus:"single",education:"College",job:"Test",phone:"555",paymentStatus:"paid" as const,status:"pending" as const,createdAt:1};
 const target=await ctx.db.insert("registrations",{...base,email:"target@example.invalid",publicApplicantNumber:144,stripeSessionId:"synthetic-payment-target"});
 const source=await ctx.db.insert("registrations",{...base,email:"source@example.invalid",publicApplicantNumber:163,stripeSessionId:"synthetic-payment-source"});
 const eventId=await ctx.db.insert("events",{title:"Synthetic",eventCode:"nov14",eventMonth:"2026-11",series:"1plus1_match",location:"Test",maleCapacity:60,femaleCapacity:60,startsAt:100,endsAt:200,status:"scheduled",createdAt:1,updatedAt:1});
 for(const registrationId of [source,target]) await ctx.db.insert("eventRegistrations",{eventId,registrationId,gender:"female",registrationStatus:"pending",confirmationStatus:"confirmed",attendanceStatus:"not_checked_in",eligibilityStatus:"awaiting_background_check",createdAt:1,updatedAt:1});
 for(const [i,registrationId] of [source,target].entries()) await ctx.db.insert("receiptDeliveries",{key:"registration/"+registrationId,token:"synthetic-"+i,leaseUntil:1,firstAttemptAt:1,sentAt:2,name:"Synthetic",email:i?"target@example.invalid":"source@example.invalid"});
 return {source,target};});
 return {t,pair};
}
test("dry run fails closed, is deterministic and never changes data",async()=>{
 const {t,pair}=await fixture();const before=await t.run(ctx=>snapshot(ctx,pair));
 const p=await t.run(ctx=>plan(ctx,pair));expect(p.blockers).toContain("This merge must preserve the primary profile and eligibility");expect(p.conflicts).toHaveLength(0);
 expect((await t.run(ctx=>snapshot(ctx,pair))).fingerprint).toBe(before.fingerprint);
 await expect(t.run(ctx=>applyMerge(ctx,pair,{operationKey:"synthetic-unresolved",expectedFingerprint:p.fingerprint,policy:"unresolved",authorization:"Synthetic test authorization only"}))).rejects.toThrow("authorization");
 expect((await t.run(ctx=>snapshot(ctx,pair))).fingerprint).toBe(before.fingerprint);
});
for(const policy of ["retain_target"] as const) test(policy+" preserves source history/payments and rolls back without credentials revival",async()=>{
 const {t,pair}=await fixture();const p=await t.run(ctx=>plan(ctx,pair,policy));
 const args={operationKey:"synthetic-"+policy,expectedFingerprint:p.fingerprint,policy,authorization:"Synthetic test authorization only"};
 const applied=await t.run(ctx=>applyMerge(ctx,pair,args));
 expect(await t.run(ctx=>applyMerge(ctx,pair,args))).toEqual({...applied,alreadyApplied:true});
 const s=await t.run(ctx=>snapshot(ctx,pair));
 expect(s.state.receiptDeliveries).toEqual(p.state.receiptDeliveries);
 expect(s.state.registrations.find(r=>r._id===pair.target)).toEqual(p.state.registrations.find(r=>r._id===pair.target));
 const enrollments=await t.run(ctx=>ctx.db.query("eventRegistrations").collect());
 expect(enrollments.filter(e=>!e.supersededBy)).toHaveLength(1);
 expect(enrollments.find(e=>e.registrationId===pair.target)?.eligibilityStatus).toBe("awaiting_background_check");
 expect(enrollments.find(e=>e.registrationId===pair.source)?.eligibilityStatus).toBe("awaiting_background_check");
 await t.run(ctx=>rollbackMerge(ctx,applied.auditId));
 expect(await t.run(ctx=>rollbackMerge(ctx,applied.auditId))).toEqual({alreadyRolledBack:true});
 const source=await t.run(ctx=>ctx.db.get(pair.source));expect(source?.mergedIntoRegistrationId).toBeUndefined();expect(source?.securityRetiredAt).toBeGreaterThan(0);
 expect((await t.run(ctx=>snapshot(ctx,pair))).state.eventRegistrations).toEqual(p.state.eventRegistrations);
 expect((await t.run(ctx=>snapshot(ctx,pair))).state.receiptDeliveries).toEqual(p.state.receiptDeliveries);
 await expect(t.run(ctx=>applyMerge(ctx,pair,args))).rejects.toThrow("Operation key conflict");
});
test("dependency membership drift blocks apply and rollback atomically",async()=>{
 const {t,pair}=await fixture();let p=await t.run(ctx=>plan(ctx,pair,"retain_target"));
 const args={operationKey:"synthetic-drift",expectedFingerprint:p.fingerprint,policy:"retain_target" as const,authorization:"Synthetic test authorization only"};
 await t.run(ctx=>ctx.db.insert("applicantSessions",{registrationId:pair.source,sessionHash:"new",expiresAt:999,createdAt:1,lastUsedAt:1}));
 await expect(t.run(ctx=>applyMerge(ctx,pair,args))).rejects.toThrow("scope drift");
 p=await t.run(ctx=>plan(ctx,pair,"retain_target"));const applied=await t.run(ctx=>applyMerge(ctx,pair,{...args,expectedFingerprint:p.fingerprint}));
 await t.run(ctx=>ctx.db.insert("interestLookups",{registrationId:pair.source,windowStart:1,count:1}));
 const before=await t.run(ctx=>snapshot(ctx,pair));await expect(t.run(ctx=>rollbackMerge(ctx,applied.auditId))).rejects.toThrow("scope drift");
 expect((await t.run(ctx=>snapshot(ctx,pair))).fingerprint).toBe(before.fingerprint);
});
test("fingerprint covers nested credentials and sorted keys",()=>{expect(fingerprint({b:2,a:1})).toBe(fingerprint({a:1,b:2}));expect(fingerprint({token:"a"})).not.toBe(fingerprint({token:"b"}));});

test("unsettled outbound delivery blocks merge before any writes",async()=>{
 const {t,pair}=await fixture();
 await t.run(async ctx=>{const receipt=(await ctx.db.query("receiptDeliveries").first())!;await ctx.db.patch(receipt._id,{sentAt:undefined});});
 const p=await t.run(ctx=>plan(ctx,pair,"retain_target"));expect(p.blockers).toContain("Unsettled outbound delivery requires reconciliation before merge");
 await expect(t.run(ctx=>applyMerge(ctx,pair,{operationKey:"synthetic-inflight",expectedFingerprint:p.fingerprint,policy:"retain_target",authorization:"Synthetic test authorization only"}))).rejects.toThrow("Unsettled outbound");
 expect((await t.run(ctx=>snapshot(ctx,pair))).fingerprint).toBe(p.fingerprint);
});

test("conflicting eligibility fails closed even with retain-target policy",async()=>{const {t,pair}=await fixture();await t.run(async ctx=>{const r=(await ctx.db.query("eventRegistrations").collect()).find(r=>r.registrationId===pair.source)!;await ctx.db.patch(r._id,{eligibilityStatus:"approved_member"});});const p=await t.run(ctx=>plan(ctx,pair,"retain_target"));expect(p.blockers).toContain("Eligibility conflict requires separate decision");});
test("wrong pair and inactive identities fail closed",async()=>{const {t,pair}=await fixture();await expect(t.run(ctx=>plan(ctx,{source:pair.target,target:pair.source},"retain_target"))).rejects.toThrow("Configured merge pair unavailable");await t.run(ctx=>ctx.db.patch(pair.source,{securityRetiredAt:1}));expect((await t.run(ctx=>plan(ctx,pair,"retain_target"))).blockers).toContain("Inactive identity requires review");});

import { MERGE_TABLES } from "./registrationMerge163144";
test("bounded scan inventory covers every schema table",()=>expect(MERGE_TABLES).toEqual(Object.keys(schema.tables).sort()));

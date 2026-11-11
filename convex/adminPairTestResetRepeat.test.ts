import { expect, test, vi, afterEach } from "vitest";
import { preview, reset, TEST_PAIR } from "./adminPairTestReset";
import type { MutationCtx } from "./_generated/server";
afterEach(()=>vi.unstubAllEnvs());
type Row = Record<string, unknown>;
function fixture(){
 vi.stubEnv("ATTENDANCE_ADMIN_SECRET","synthetic");
 const tables:Record<string,Row[]>={registrations:TEST_PAIR.map((_id,i)=>({_id,publicApplicantNumber:219+i})),interests:[],interestFlows:[],matches:[],profileShares:[],interestFlowEvents:[],femaleWorkflowDeliveries:[],pairTestResetAudits:[]};
 const writes:unknown[]=[];
 const ctx={db:{query:(table:string)=>({take:async()=>tables[table],withIndex:(_name:string,cb:(q:unknown)=>unknown)=>{let value:unknown;cb({eq:(_k:string,v:unknown)=>{value=v;}});return {unique:async()=>tables[table].find(r=>r.operationKey===value)??null};}}),insert:async(table:string,value:Row)=>{const row={_id:table+tables[table].length,...value};tables[table].push(row);writes.push(row);return row._id;},patch:async(id:string,patch:Row)=>{writes.push({id,patch});Object.assign(Object.values(tables).flat().find(r=>r._id===id)!,patch);}}} as unknown as MutationCtx;
 const cycle=(n:number)=>{const interestId="interest"+n,interestFlowId="flow"+n;tables.interests.push({_id:interestId,fromRegistrationId:TEST_PAIR[n%2],toRegistrationId:TEST_PAIR[1-n%2],source:"platform_submission",status:"closed"});tables.interestFlows.push({_id:interestFlowId,interestId,fromRegistrationId:TEST_PAIR[n%2],toRegistrationId:TEST_PAIR[1-n%2],flowStatus:"contact_shared"});tables.interestFlowEvents.push({_id:"event"+n,interestId,interestFlowId,eventType:"contacts_disclosed_in_portal"});tables.femaleWorkflowDeliveries.push({_id:"delivery"+n,interestId,recipientId:TEST_PAIR[0],status:"failed",attempts:1,error:"Isolated delivery configuration missing or recipient not allowlisted",nextAttemptAt:42,createdAt:1});};cycle(0);
 return {tables,writes,ctx,cycle};
}
const pre=(preview as unknown as {_handler:(ctx:MutationCtx,args:{adminSecret:string})=>Promise<{fingerprint:string,count:number,deliveries:number}>})._handler;
const run=(reset as unknown as {_handler:(ctx:MutationCtx,args:Record<string,unknown>)=>Promise<unknown>})._handler;
const args=(fingerprint:string,n=0)=>({adminSecret:"synthetic",expectedFingerprint:fingerprint,operationKey:"synthetic-cycle-"+n,reason:"Synthetic repeat reset",confirmPair:"219-220"});
test("three repeat cycles preserve original errors, counters, audit/history and unrelated pairs; idempotent",async()=>{
 const h=fixture();h.tables.interests.push({_id:"foreign",fromRegistrationId:TEST_PAIR[0],toRegistrationId:"other",status:"new"});h.tables.femaleWorkflowDeliveries.push({_id:"foreignDelivery",interestId:"foreign",status:"sending",leaseUntil:99});
 for(let n=0;n<3;n++){
  if(n)h.cycle(n);const before=structuredClone(h.tables),p=await pre(h.ctx,{adminSecret:"synthetic"});expect(p.deliveries).toBe(1);const request=args(p.fingerprint,n);const writes=h.writes.length;await run(h.ctx,request);expect(h.writes.length).toBeGreaterThan(writes);
  const audit=h.tables.pairTestResetAudits[n];expect(JSON.parse(audit.snapshot as string).deliveries).toEqual(before.femaleWorkflowDeliveries.filter(d=>d.interestId!=="foreign"));
  expect(h.tables.femaleWorkflowDeliveries.find(d=>d._id==="delivery"+n)).toEqual({...before.femaleWorkflowDeliveries.find(d=>d._id==="delivery"+n),status:"cancelled"});
  expect(h.tables.pairTestResetAudits.slice(0,n)).toEqual(before.pairTestResetAudits);expect(h.tables.interestFlowEvents.slice(0,before.interestFlowEvents.length)).toEqual(before.interestFlowEvents);
  expect(h.tables.interests.find(r=>r._id==="foreign")).toEqual(before.interests.find(r=>r._id==="foreign"));expect(h.tables.femaleWorkflowDeliveries.find(r=>r._id==="foreignDelivery")).toEqual(before.femaleWorkflowDeliveries.find(r=>r._id==="foreignDelivery"));
  const count=h.writes.length;await expect(run(h.ctx,request)).resolves.toMatchObject({alreadyReset:true});expect(h.writes).toHaveLength(count);expect((await pre(h.ctx,{adminSecret:"synthetic"})).count).toBe(0);
  await expect(run(h.ctx,{...request,reason:"different valid reason"})).rejects.toThrow("Operation key reused");
 }
});
for(const patch of [{status:"sending"},{status:"pending"},{leaseUntil:0},{firstAttemptAt:0},{providerPayload:{}},{sentAt:0},{attempts:2},{error:"Email transport failed"}])test("uncertain delivery stays blocked "+JSON.stringify(patch),async()=>{const h=fixture();Object.assign(h.tables.femaleWorkflowDeliveries[0],patch);await expect(pre(h.ctx,{adminSecret:"synthetic"})).rejects.toThrow("manual reconciliation");expect(h.writes).toEqual([]);});
test("fresh fingerprint required and auth/fixed pair guards remain",async()=>{const h=fixture(),p=await pre(h.ctx,{adminSecret:"synthetic"});h.tables.femaleWorkflowDeliveries[0].nextAttemptAt=43;await expect(run(h.ctx,args(p.fingerprint))).rejects.toThrow("Preview changed");await expect(pre(h.ctx,{adminSecret:"wrong"})).rejects.toThrow("Unauthorized");h.tables.registrations[0].publicApplicantNumber=218;await expect(pre(h.ctx,{adminSecret:"synthetic"})).rejects.toThrow("Configured test pair unavailable");expect(h.writes).toEqual([]);});

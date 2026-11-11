import { expect, test, vi } from "vitest";
import { preview, reopen, TARGET } from "./reopen315";
import type { MutationCtx } from "./_generated/server";
const sister="j573g9z3ynhnvm0szxxen85ngx8j0vxx",brother="j571mzmn1fpw9c8pddz9rp63q98fye2j",event="kd71abx4ysgak9cc9k43fppyvd8gtfer";
function fixture(){return {
registrations:[{_id:sister,name:"sister test",gender:"female",publicApplicantNumber:315},{_id:brother,name:"Admin Test",gender:"male",publicApplicantNumber:217}],
events:[{_id:event,eventCode:"nov26",startsAt:1794681900000}],
interests:[{_id:TARGET,fromRegistrationId:sister,toRegistrationId:brother,eventId:event,source:"platform_submission",status:"closed",adminStatus:"pending",visibility:"internal_only",femaleWorkflow:{state:"revoked",reviewExpiresAt:1794977449898},createdAt:1,updatedAt:2},{_id:"reverse",status:"new",notes:"preserve"}],
interestFlows:[{_id:"flow",interestId:TARGET,fromRegistrationId:sister,toRegistrationId:brother,flowStatus:"private_documented",recipientDecision:"pending",requesterFinalApproval:"pending",recipientFinalApproval:"pending",photoDecision:"pending",createdAt:1,updatedAt:1}],
femaleWorkflowDeliveries:[{_id:"delivery",interestId:TARGET,recipientId:brother,status:"failed",attempts:0,kind:"brother_review",error:"no backfill"}],
interestFlowEvents:[{_id:"history",interestId:TARGET,eventType:"interest_number_submitted"}],matches:[],profileShares:[{_id:"share",interestId:"reverse",status:"shared",shareToken:"synthetic-only"}],interestReopenAudits:[]
} as Record<string,Record<string,unknown>[]>;}
function harness(tables=fixture()){
 const writes:unknown[]=[];
 const ctx={db:{get:async(id:string)=>Object.values(tables).flat().find(x=>x._id===id)??null,
 query:(table:string)=>({take:async()=>tables[table],withIndex:()=>({take:async()=>tables[table],unique:async()=>tables[table][0]??null})}),
 insert:async(table:string,value:Record<string,unknown>)=>{writes.push({table,value});const row={_id:table+"-new",...value};tables[table].push(row);return row._id;},
 patch:async(id:string,patch:Record<string,unknown>)=>{writes.push({id,patch});Object.assign(Object.values(tables).flat().find(x=>x._id===id)!,patch);}
 }} as unknown as MutationCtx;
 return {tables,writes,ctx};
}
const pre=(preview as unknown as {_handler:(ctx:MutationCtx,args:{adminSecret:string})=>Promise<{fingerprint:string}>})._handler;
const run=(reopen as unknown as {_handler:(ctx:MutationCtx,args:{adminSecret:string,expectedFingerprint:string,confirm:string})=>Promise<unknown>})._handler;
async function scoped(fn:()=>Promise<void>){vi.stubEnv("ATTENDANCE_ADMIN_SECRET","synthetic");try{await fn();}finally{vi.unstubAllEnvs();}}
test("preview read-only, minimal patch, append audit/history, preserve all other rows and repeat idempotently",()=>scoped(async()=>{
 const h=harness(),before=structuredClone(h.tables);const p=await pre(h.ctx,{adminSecret:"synthetic"});expect(h.writes).toEqual([]);
 const args={adminSecret:"synthetic",expectedFingerprint:p.fingerprint,confirm:"315-to-217-nov14"};await run(h.ctx,args);
 expect(h.writes).toHaveLength(3);expect(h.tables.interests[0]).toMatchObject({status:"new",adminStatus:"pending",visibility:"internal_only",femaleWorkflow:{state:"private_documented"}});expect(h.tables.interests[0].femaleWorkflow).toEqual({state:"private_documented"});
 for(const table of ["registrations","events","interestFlows","femaleWorkflowDeliveries","matches","profileShares"])expect(h.tables[table]).toEqual(before[table]);expect(h.tables.interests[1]).toEqual(before.interests[1]);expect(h.tables.interestFlowEvents[0]).toEqual(before.interestFlowEvents[0]);
 expect(JSON.parse(h.tables.interestReopenAudits[0].snapshot as string).interest).toEqual(before.interests[0]);
 await expect(run(h.ctx,args)).resolves.toMatchObject({alreadyApplied:true});expect(h.writes).toHaveLength(3);
 await expect(run(h.ctx,{...args,expectedFingerprint:"changed"})).rejects.toThrow("Preview changed");
}));
const drifts:Record<string,(t:ReturnType<typeof fixture>)=>void>={
 wrongPair:t=>{t.registrations[0].publicApplicantNumber=220;},wrongName:t=>{t.registrations[0].name="other";},wrongEvent:t=>{t.events[0].startsAt=0;},wrongDirection:t=>{t.interests[0].toRegistrationId=sister;},wrongSource:t=>{t.interests[0].source="admin_entered";},reset:t=>{t.interests[0].testReset={};},match:t=>{t.interests[0].matchId="m";},alreadyOpen:t=>{t.interests[0].status="new";},adminApproved:t=>{t.interests[0].adminStatus="matched";},visible:t=>{t.interests[0].visibility="admin_actionable";},token:t=>{t.interests[0].femaleWorkflow={state:"revoked",reviewTokenHash:"old"};},approval:t=>{t.interestFlows[0].requesterFinalApproval="approved";},contact:t=>{t.interestFlows[0].contactSharedAt=1;},bio:t=>{t.interestFlows[0].bioVisibleAt=1;},duplicateFlow:t=>{t.interestFlows.push({...t.interestFlows[0]});},noFlow:t=>{t.interestFlows=[];},linkedMatch:t=>{t.matches.push({interestId:TARGET});},linkedShare:t=>{t.profileShares.push({interestId:TARGET});},attempt:t=>{t.femaleWorkflowDeliveries[0].attempts=1;},sending:t=>{t.femaleWorkflowDeliveries[0].status="sending";},lease:t=>{t.femaleWorkflowDeliveries[0].leaseUntil=1;},sentPayload:t=>{t.femaleWorkflowDeliveries[0].providerPayload="x";},wrongRecipient:t=>{t.femaleWorkflowDeliveries[0].recipientId=sister;}
};
for(const [name,change] of Object.entries(drifts))test("reject without writes: "+name,()=>scoped(async()=>{const h=harness();change(h.tables);await expect(run(h.ctx,{adminSecret:"synthetic",expectedFingerprint:"0".repeat(64),confirm:"315-to-217-nov14"})).rejects.toThrow();expect(h.writes).toEqual([]);}));
test("stale full-row preview fails without writes",()=>scoped(async()=>{const h=harness();const p=await pre(h.ctx,{adminSecret:"synthetic"});h.tables.interests[0].notes="changed";await expect(run(h.ctx,{adminSecret:"synthetic",expectedFingerprint:p.fingerprint,confirm:"315-to-217-nov14"})).rejects.toThrow("Preview changed");expect(h.writes).toEqual([]);}));
test("authentication fails before reading or writing",()=>scoped(async()=>{const h=harness();await expect(pre(h.ctx,{adminSecret:"wrong"})).rejects.toThrow("Unauthorized");await expect(run(h.ctx,{adminSecret:"wrong",expectedFingerprint:"",confirm:"315-to-217-nov14"})).rejects.toThrow("Unauthorized");expect(h.writes).toEqual([]);}));

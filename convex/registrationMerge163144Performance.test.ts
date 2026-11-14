import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { modules } from "./test.setup";
import { applyMerge, canonical, dependencyState, fingerprint, plan, rollbackMerge, snapshot } from "./registrationMerge163144";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
type Row = Doc<TableNames>;
type Pair = {source: Id<"registrations">; target: Id<"registrations">};
function oracle(all: Record<string, Row[]>, pair: Pair) {
  const ids = new Set<string>([pair.source, pair.target]);
  const selected = new Set<string>();
  function references(value: unknown): boolean {
    if (typeof value === "string") return [...ids].some(id => value.includes(id));
    if (Array.isArray(value)) return value.some(references);
    return !!value && typeof value === "object" && Object.values(value).some(references);
  }
  function closure() { let changed=true; while(changed) {changed=false; for(const row of Object.values(all).flat()) if(!selected.has(row._id)&&references(row)){selected.add(row._id);ids.add(row._id);changed=true;}} }
  closure();
  for(const r of all.registrations as Doc<"registrations">[]) if(r._id===pair.source||r._id===pair.target){if(r.stripeSessionId)ids.add(r.stripeSessionId);ids.add(r.email.trim().toLowerCase());}
  closure();
  return Object.fromEntries(Object.entries(all).map(([t,rows])=>[t,rows.filter(r=>selected.has(r._id)).sort((a,b)=>a._id.localeCompare(b._id))]));
}
function instrument(ctx: MutationCtx) {
  const stats={rows:0,scans:0,indexed:0,gets:0};
  const db=new Proxy(ctx.db,{get(target,key){
    if(key==='get')return (...args: Parameters<typeof target.get>)=>{stats.gets++;return target.get(...args);};
    if(key==='query')return (table: TableNames)=>{const query=target.query(table);return new Proxy(query,{get(q,k){
      if(k==='take')return async(n:number)=>{stats.scans++;const rows=await q.take(n);stats.rows+=rows.length;return rows;};
      if(k==='withIndex')return (...args: Parameters<typeof q.withIndex>)=>{stats.indexed++;return q.withIndex(...args);};
      const v=Reflect.get(q,k);return typeof v==='function'?v.bind(q):v;
    }});};
    const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;
  }});
  return {ctx:{...ctx,db},stats};
}
test('frontier matcher exactly preserves serialized, nested, regex-special and multi-hop references',()=>{
  const pair={source:'source' as Id<'registrations'>,target:'target' as Id<'registrations'>};
  const all={registrations:[{_id:'source',email:' a+[b]@example.invalid ',stripeSessionId:'pay.*(x)'},{_id:'target',email:'target@example.invalid'}],settings:[{_id:'third',value:'serialized second'},{_id:'second',value:{nested:['receipt/pay.*(x)']}},{_id:'fourth',value:'prefixthirdsuffix'},{_id:'unrelated',value:'payZZx'},{_id:'email',value:'a+[b]@example.invalid'}]} as unknown as Record<string,Row[]>;
  expect(dependencyState(all,pair)).toEqual(oracle(all,pair));
  expect(dependencyState(all,pair).settings.map(r=>r._id)).not.toContain('unrelated');
});
test('13215+ synthetic documents: one completeness scan, exact after audit, idempotence and rollback',async()=>{
  const t=convexTest(schema,modules);
  const pair=await t.run(async ctx=>{const base={name:'Synthetic',gender:'female' as const,age:30,maritalStatus:'single',education:'Test',job:'Test',phone:'555',paymentStatus:'paid' as const,status:'pending' as const,createdAt:1};const source=await ctx.db.insert('registrations',{...base,email:'source@example.invalid',publicApplicantNumber:163});const target=await ctx.db.insert('registrations',{...base,email:'target@example.invalid',publicApplicantNumber:144});return {source,target};});
  // Three independently bounded tables; no production data or credentials.
  for(let offset=0;offset<4405;offset+=500) await t.run(async ctx=>{for(let i=offset;i<Math.min(offset+500,4405);i++){
    await ctx.db.insert('settings',{key:'unrelated-'+i,value:'x'.repeat(600)});
    await ctx.db.insert('interestLookups',{registrationId:pair.target,windowStart:i,count:1});
    await ctx.db.insert('receiptDeliveries',{key:'unrelated/'+i,token:'synthetic-'+i,leaseUntil:1,firstAttemptAt:1,sentAt:2,name:'Synthetic',email:'unrelated@example.invalid'});
  }});
  const all=await t.run(async ctx=>{const rows:Record<string,Row[]>={};for(const table of Object.keys(schema.tables) as TableNames[]){if(table!=='registrationMergeAudits')rows[table]=await ctx.db.query(table).take(5001);}return rows;});
  const oldStart=performance.now(),oldState=oracle(all,pair),oldClosureMs=performance.now()-oldStart;
  const newStart=performance.now(),newState=dependencyState(all,pair),newClosureMs=performance.now()-newStart;
  expect(newState).toEqual(oldState);
  const p=await t.run(ctx=>plan(ctx,pair,'retain_target'));
  const args={operationKey:'synthetic-performance-4557',expectedFingerprint:p.fingerprint,policy:'retain_target' as const,authorization:'Synthetic performance test authorization'};
  const proof=await t.run(async ctx=>{const measured=instrument(ctx),start=performance.now();const result=await applyMerge(measured.ctx,pair,args);return {result,stats:measured.stats,ms:performance.now()-start};});
  expect(proof.stats.scans).toBe(Object.keys(schema.tables).length-1);
  expect(proof.stats.rows).toBe(13217);
  expect(proof.stats.indexed).toBe(1); // Existing operation-key idempotence index.
  const after=await t.run(ctx=>snapshot(ctx,pair));
  const audit=await t.run(ctx=>ctx.db.get(proof.result.auditId));
  expect(audit?.afterFingerprint).toBe(after.fingerprint);
  expect(after.state.registrations.find(r=>r._id===pair.target)).toEqual(p.state.registrations.find(r=>r._id===pair.target));
  expect(after.state.receiptDeliveries).toEqual(p.state.receiptDeliveries);
  const repeated=await t.run(async ctx=>{const measured=instrument(ctx);const result=await applyMerge(measured.ctx,pair,args);return {result,stats:measured.stats};});
  expect(repeated.result.alreadyApplied).toBe(true);expect(repeated.stats.scans).toBe(0);
  await t.run(ctx=>rollbackMerge(ctx,proof.result.auditId));
  const restored=await t.run(ctx=>snapshot(ctx,pair));
  expect(restored.state.interestLookups).toEqual(p.state.interestLookups);
  expect((restored.state.registrations.find(r=>r._id===pair.source) as Doc<'registrations'>).securityRetiredAt).toBeGreaterThan(0);
  console.log(JSON.stringify({syntheticDocuments:13217,oldClosureMs,newClosureMs,applyDocumentReads:proof.stats.rows+proof.stats.gets,completenessScans:proof.stats.scans,applyMs:proof.ms,idempotentRescanCount:repeated.stats.scans,exactAfterFingerprint:after.fingerprint,rollbackVerified:true}));
},30000);
test('new frontier selection retains legacy canonical fingerprint',()=>{
  const pair={source:'source' as Id<'registrations'>,target:'target' as Id<'registrations'>};
  for(let seed=0;seed<30;seed++){
    const all={registrations:[{_id:'source',email:'s@example.invalid'},{_id:'target',email:'t@example.invalid'}],settings:Array.from({length:120},(_,i)=>({_id:'row-'+i,value:i%7===seed%7?'source':JSON.stringify({nested:['prefix row-'+((i*17+seed)%120)+' suffix']})}))} as unknown as Record<string,Row[]>;
    expect(canonical(dependencyState(all,pair))).toBe(canonical(oracle(all,pair)));
    expect(fingerprint(dependencyState(all,pair))).toBe(fingerprint(oracle(all,pair)));
  }
});

test('nine-row retain-target merge keeps current enrollment, old statuses, payments and six history events byte-identical',async()=>{
 const t=convexTest(schema,modules);
 const pair=await t.run(async ctx=>{
  const base={name:'Synthetic',gender:'female' as const,age:30,maritalStatus:'single',education:'Test',job:'Test',phone:'555',paymentStatus:'paid' as const,status:'approved' as const,createdAt:1};
  const source=await ctx.db.insert('registrations',{...base,email:'source@example.invalid',publicApplicantNumber:163,stripeSessionId:'paid-source'});
  const target=await ctx.db.insert('registrations',{...base,email:'target@example.invalid',publicApplicantNumber:144,stripeSessionId:'paid-target',photoSharingPermission:'ask_me_first'});
  const peer=await ctx.db.insert('registrations',{...base,email:'peer@example.invalid'});
  const event={title:'Synthetic',eventCode:'nov14',eventMonth:'2026-11',series:'1plus1_match',location:'Test',maleCapacity:60,femaleCapacity:60,startsAt:100,endsAt:200,status:'scheduled' as const,createdAt:1,updatedAt:1};
  const current=await ctx.db.insert('events',event),older=await ctx.db.insert('events',{...event,eventCode:'older'});
  for(const registrationId of [source,target])await ctx.db.insert('eventRegistrations',{eventId:current,registrationId,gender:'female',registrationStatus:'pending',confirmationStatus:'confirmed',attendanceStatus:'not_checked_in',eligibilityStatus:'awaiting_background_check',createdAt:1,updatedAt:1});
  await ctx.db.insert('eventRegistrations',{eventId:older,registrationId:source,gender:'female',registrationStatus:'withdrawn',confirmationStatus:'cancelled',attendanceStatus:'attended',eligibilityStatus:'awaiting_background_check',createdAt:1,updatedAt:1});
  for(let i=0;i<3;i++){
   const interestId=await ctx.db.insert('interests',{fromRegistrationId:source,toRegistrationId:peer,eventId:current,source:'platform_submission',status:'closed',visibility:'internal_only',femaleWorkflow:{state:'private_documented'},createdAt:1,updatedAt:1});
   const interestFlowId=await ctx.db.insert('interestFlows',{interestId,fromRegistrationId:source,toRegistrationId:peer,flowStatus:'private_documented',recipientDecision:'pending',requesterFinalApproval:'pending',recipientFinalApproval:'pending',photoDecision:'pending',createdAt:1,updatedAt:1});
   for(let j=0;j<2;j++)await ctx.db.insert('interestFlowEvents',{interestId,interestFlowId,actor:'system',eventType:'historical',createdAt:j});
  }
  for(const [i,registrationId]of [source,target].entries()){
   await ctx.db.insert('receiptDeliveries',{key:'registration/'+registrationId,token:'synthetic-'+i,leaseUntil:1,firstAttemptAt:1,sentAt:2,name:'Synthetic',email:i?'target@example.invalid':'source@example.invalid'});
   await ctx.db.insert('applicantSessions',{registrationId,sessionHash:'synthetic-'+i,expiresAt:99,createdAt:1});
  }
  return {source,target};
 });
 const before=await t.run(ctx=>plan(ctx,pair,'retain_target'));expect(before.writes).toHaveLength(9);
 const applied=await t.run(ctx=>applyMerge(ctx,pair,{operationKey:'synthetic-nine-4557',expectedFingerprint:before.fingerprint,policy:'retain_target',authorization:'Synthetic nine-row preservation authorization'}));
 const after=await t.run(ctx=>snapshot(ctx,pair));
 for(const table of ['receiptDeliveries','applicantSessions','interestFlowEvents'])expect(after.state[table]).toEqual(before.state[table]);
 expect(after.state.interestFlowEvents).toHaveLength(6);
 expect(after.state.registrations.find(r=>r._id===pair.target)).toEqual(before.state.registrations.find(r=>r._id===pair.target));
 const original=before.state.eventRegistrations as Doc<'eventRegistrations'>[],actual=after.state.eventRegistrations as Doc<'eventRegistrations'>[];
 expect(actual.find(r=>r.registrationId===pair.target)).toEqual(original.find(r=>r.registrationId===pair.target));
 for(const row of original.filter(r=>r.registrationId===pair.source)){const changed=actual.find(r=>r._id===row._id)!;expect({...changed,mergedIntoRegistrationId:undefined,supersededBy:undefined}).toEqual({...row,mergedIntoRegistrationId:undefined,supersededBy:undefined});}
 expect(actual.filter(r=>r.supersededBy)).toHaveLength(1);
 const audit=await t.run(ctx=>ctx.db.get(applied.auditId));expect(audit?.afterFingerprint).toBe(after.fingerprint);expect(JSON.parse(audit!.before)).toHaveLength(9);
});

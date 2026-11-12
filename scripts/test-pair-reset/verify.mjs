import fs from 'node:fs';import assert from 'node:assert/strict';import {ConvexHttpClient} from './node_modules/convex/dist/esm/browser/index.js';
const c=new ConvexHttpClient('http://127.0.0.1:3820');c.setAdminAuth(fs.readFileSync('.local-admin-key','utf8').trim());const adminSecret='runtime-synthetic-secret';
const {eventId}=await c.mutation('resetFixture:seed',{});
const submit=(from,to)=>c.mutation('applicantInterests:submitInterestNumber',{sessionHash:'synthetic-'+from,applicantNumber:to,applicantName:to===219?'Sister':to===220?'Brother':'Other',expectedEventId:eventId});
const unrelated=await submit(219,221);const initial=await c.query('resetFixture:state',{});const proof=[];
await assert.rejects(c.query('adminPairTestReset:preview',{adminSecret:'bad'}),/Unauthorized/);
await assert.rejects(c.query('adminPairTestReset:preview',{adminSecret,registrationIds:['other']}),/extra field/);
for(let cycle=0;cycle<4;cycle++){
const female=await submit(219,220),male=await submit(220,219);assert.notEqual(female.interestId,male.interestId);
if(cycle===0){await c.mutation('femaleInterestWorkflow:createReview',{adminSecret,interestId:female.interestId,reviewTokenHash:'a'.repeat(64)});const extras=await c.mutation('resetFixture:extras',{interestId:female.interestId});await c.mutation('resetFixture:deliveryState',{id:extras.deliveryId,sending:true});assert((await c.query('adminPairTestReset:preview',{adminSecret})).warnings.length > 0);}
const p=await c.query('adminPairTestReset:preview',{adminSecret});const args={adminSecret,expectedFingerprint:p.fingerprint,operationKey:'synthetic-repeat-cycle-'+cycle,reason:'Repeated normal submission integration test',confirmPair:'219-220'};
const before=await c.query('resetFixture:state',{});await assert.rejects(c.mutation('resetFixture:rollback',{args}),/post-write rollback/);assert.deepEqual(await c.query('resetFixture:state',{}),before);
const concurrent=await Promise.allSettled([c.mutation('adminPairTestReset:reset',args),c.mutation('adminPairTestReset:reset',{...args,operationKey:args.operationKey+'-racer'})]);assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);assert.match(concurrent.find(r=>r.status==='rejected').reason.message,/Preview changed/);
const winner=concurrent[0].status==='fulfilled'?args:{...args,operationKey:args.operationKey+'-racer'};
const after=await c.query('resetFixture:state',{});assert.equal((await c.mutation('adminPairTestReset:reset',winner)).alreadyReset,true);assert.deepEqual(await c.query('resetFixture:state',{}),after);
for(const table of ['registrations','eventRegistrations','eventAttendees','events','applicantSessions'])assert.deepEqual(after[table],initial[table]);
assert.deepEqual(after.interests.find(i=>i._id===unrelated.interestId),initial.interests.find(i=>i._id===unrelated.interestId));assert.deepEqual(after.pairTestResetAudits.slice(0,before.pairTestResetAudits.length),before.pairTestResetAudits);assert.deepEqual(after.interestFlowEvents.slice(0,before.interestFlowEvents.length),before.interestFlowEvents);
assert(after.interests.find(i=>i._id===female.interestId).testReset);assert(after.interests.find(i=>i._id===male.interestId).testReset);
if(cycle===0){assert.equal(after.profileShares[0].status,'closed');assert.equal(after.femaleWorkflowDeliveries[0].status,'cancelled');await assert.rejects(c.query('femaleInterestWorkflow:getReviewAccess',{sessionHash:'synthetic-220',interestId:female.interestId,reviewTokenHash:'a'.repeat(64)}));}
const fresh=await c.query('adminPairTestReset:preview',{adminSecret});assert.equal(fresh.count,0);await c.mutation('adminPairTestReset:reset',{...args,operationKey:args.operationKey+'-noop',expectedFingerprint:fresh.fingerprint});assert.deepEqual(await c.query('resetFixture:state',{}),after);
const e1=await c.query('applicantInterests:getInterestEligibility',{sessionHash:'synthetic-219'}),e2=await c.query('applicantInterests:getInterestEligibility',{sessionHash:'synthetic-220'});assert.equal(e1.interestSubmissions.length,1);assert.equal(e2.interestSubmissions.length,0);
proof.push({cycle,female:female.interestId,male:male.interestId,atomicRollback:true,concurrentStaleRejected:true,noOp:true,preserved:true,remainingConsumedSlots:[1,0]});}
const final=[await submit(219,220),await submit(220,219)];assert(final.every(r=>r.interestId));fs.writeFileSync('proof.json',JSON.stringify({proof,finalFreshAccepted:final.map(r=>r.interestId)},null,2));console.log('PASS: four repeated cycles, both normal submissions, preservation, concurrency, rollback, auth, no-op and stale access');

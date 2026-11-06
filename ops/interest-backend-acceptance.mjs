import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ConvexHttpClient} from 'convex/browser';
const URL='http://127.0.0.1:3340';
const originalFetch=globalThis.fetch;
globalThis.fetch=(input,init)=>{const url=new globalThis.URL(typeof input==='string'?input:input.url??input.toString());assert.equal(url.origin,URL,'NONLOCAL NETWORK HARD BLOCK');return originalFetch(input,init)};
const client=()=>new ConvexHttpClient(URL,{logger:false});
const c=client();const adminSecret='synthetic-local-only';const actor='synthetic-acceptance';
const toggle=(eventId,enabled,cl=c)=>cl.mutation('events:setInterestSubmissionsEnabled',{eventId,enabled,adminSecret,actor});
const snap=()=>c.query('interestFixture:snapshot',{});
const reject=async(p,pattern,label)=>{await assert.rejects(p,pattern);console.log('PASS rejection:',label)};
const fixture=await c.mutation('interestFixture:seed',{});fs.writeFileSync(new URLConstructor('../interest-runtime/fixture.json',import.meta.url),JSON.stringify(fixture,null,2));
function URLConstructor(...x){return new globalThis.URL(...x)}
const {events,people}=fixture;const baseline=await snap();
const submit=(i,target,eventId)=>c.mutation('applicantInterests:submitInterestNumber',{sessionHash:people[i].sessionHash,applicantNumber:people[target].applicantNumber,applicantName:people[target].name,expectedEventId:eventId});
const dash=i=>c.query('applicantInterests:getDashboard',{sessionHash:people[i].sessionHash});
for(let wave=0;wave<20;wave++){
 await toggle(events[0],false);await toggle(events[1],false);
 const results=await Promise.allSettled([toggle(events[0],true,client()),toggle(events[1],true,client())]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.match(results.find(x=>x.status==='rejected').reason.message,/Only one event can be ON/);
 const state=await snap();assert.equal(state.events.filter(x=>x.interestSubmissionsEnabled).length,1);
 console.log('PASS independent-client simultaneous ON wave',wave+1,results.map(x=>x.status));
}
await toggle(events[0],false);await toggle(events[1],false);await toggle(events[0],true);
const beforeRepeat=await snap();await toggle(events[0],true);assert.deepEqual((await snap()).audit,beforeRepeat.audit);assert.deepEqual((await snap()).events,beforeRepeat.events);console.log('PASS repeat ON idempotent and audit unchanged');
assert.equal((await dash(0)).canSubmitInterest,true);assert.equal((await dash(0)).interestSubmissionEventId,events[0]);
assert(baseline.events[0].startsAt>Date.now());assert(baseline.events[0].interestSubmissionClosesAt<Date.now());console.log('PASS future event + expired historical window still ON');
for(const [i,label]of [[1,'missing approval'],[2,'missing confirmation'],[3,'missing attendance'],[4,'cancelled confirmation'],[5,'attendance only wrong event'],[6,'missing roster']]){
 assert.equal((await dash(i)).canSubmitInterest,false);await reject(submit(i,8,events[0]),/unavailable|selected event changed/,label);
}
await reject(submit(0,8,events[1]),/unavailable|selected event changed/,'wrong selected expectedEventId');
assert.equal(baseline.rows.some(r=>r.registrationId===people[8].registrationId),false);
const first=await submit(0,8,events[0]);assert(first.interestId);console.log('PASS approved confirmed attended sender; recipient has no roster rows');
await reject(c.mutation('events:update',{adminSecret,eventId:events[0],status:'cancelled'}),/Turn off interest submissions/,'cancellation while ON');
const history=await snap();await toggle(events[0],false);const off=await snap();assert.deepEqual(off.interests,history.interests);assert.deepEqual(off.flows,history.flows);assert.deepEqual(off.flowEvents,history.flowEvents);
await toggle(events[0],false);assert.deepEqual((await snap()).audit,off.audit);console.log('PASS OFF history retained; repeat OFF idempotent');
assert.equal((await dash(0)).canSubmitInterest,false);await reject(submit(0,9,events[0]),/unavailable|selected event changed/,'OFF stale form');
await toggle(events[1],true);await reject(submit(0,9,events[0]),/unavailable|selected event changed/,'event switched stale form');await submit(0,9,events[1]);
await toggle(events[1],false);
// Cancellation races ON for a third, otherwise unused event: exactly one may commit.
const race=await Promise.allSettled([toggle(events[2],true,client()),client().mutation('events:update',{adminSecret,eventId:events[2],status:'cancelled'})]);
assert.equal(race.filter(x=>x.status==='fulfilled').length,1);const afterRace=await snap();const third=afterRace.events.find(e=>e._id===events[2]);assert(!(third.interestSubmissionsEnabled&&third.status==='cancelled'));console.log('PASS simultaneous ON/cancellation conflict',race.map(x=>x.status));
await toggle(events[2],false);await toggle(events[0],true);
const final=await snap();assert.deepEqual(final.profiles,baseline.profiles);assert.equal(final.emails.length,0);assert.equal(final.interests.length,2);assert(final.audit.every(x=>x.actor===actor));
fs.writeFileSync(new globalThis.URL('../interest-runtime/final-snapshot.json',import.meta.url),JSON.stringify(final,null,2));
console.log('PASS ALL; profile invariance; zero email records; audit rows',final.audit.length);console.log('READY browser: event',events[0],'; eligible session synthetic-interest-7 (unused), recipient 910 Synthetic10');

import assert from 'node:assert/strict';
import {ConvexHttpClient} from 'convex/browser';
// Intentionally fixed loopback endpoint: never accepts a production URL.
const url='http://127.0.0.1:3320';
const client=()=>new ConvexHttpClient(url,{skipConvexDeploymentUrlCheck:true});
const c=client();
const m=(fn,args)=>c.mutation(fn,args);
const snap=()=>c.query('raceFixture:snapshot',{});
const secret='synthetic-local-only'; // disposable local test value, not a service credential
const profiles=await m('raceFixture:seed',{});
const before=(await snap()).profiles;
const events=[];
for(const code of ['boundary','independent','race']) events.push((await m('events:create',{
 adminSecret:secret, title:'Synthetic '+code,eventCode:code,eventMonth:'2099-01',location:'Local only',
 startsAt:Date.now()+86400000,endsAt:Date.now()+90000000,status:'scheduled',maleCapacity:60,femaleCapacity:60,
})).eventId);
const register=(p,eventId,independent=false)=> (independent?client():c).mutation('events:registerForEvent',{sessionHash:p.sessionHash,eventId});
const summary=async eventId=>{
 const rows=(await snap()).rows.filter(r=>r.eventId===eventId);
 const result={};
 for(const gender of ['male','female']) {
  const g=rows.filter(r=>r.gender===gender);
  result[gender]={reserved:g.filter(r=>['pending','approved'].includes(r.registrationStatus)).length,waitlisted:g.filter(r=>r.registrationStatus==='waitlisted').length,total:g.length};
  assert(result[gender].reserved<=60);
  assert.equal(new Set(g.map(r=>r.registrationId)).size,g.length);
 }
 return result;
};
for(const gender of ['male','female']) {
 const ps=profiles.filter(p=>p.gender===gender);
 for(let i=0;i<60;i++) assert.equal((await register(ps[i],events[0])).registrationStatus,'pending');
 for(let i=60;i<63;i++) assert.equal((await register(ps[i],events[0])).registrationStatus,'waitlisted');
 assert.equal((await register(ps[60],events[1])).registrationStatus,'pending');
}
console.log('boundary and independent',JSON.stringify(await summary(events[0])),JSON.stringify(await summary(events[1])));
// Two genders and two independent HTTP clients per gender race across the final slots.
for(const gender of ['male','female']) for(const p of profiles.filter(p=>p.gender===gender).slice(0,56)) await register(p,events[2]);
let calls=0;
for(let i=56;i<70;i+=2) {
 const batch=profiles.filter(p=>['male','female'].some(g=>p.gender===g && profiles.filter(q=>q.gender===g).slice(i,i+2).includes(p)));
 const results=await Promise.all(batch.map(p=>register(p,events[2],true))); calls+=results.length;
 await summary(events[2]);
}
console.log('concurrent four-client bounded waves',calls,JSON.stringify(await summary(events[2])));
// Duplicate retries concurrently, with distinct clients (no shared client mutation queue).
for(const gender of ['male','female']) {
 const p=profiles.filter(p=>p.gender===gender)[69];
 const ids=await Promise.all(Array.from({length:4},()=>register(p,events[2],true)));
 assert.equal(new Set(ids.map(r=>r.eventRegistrationId)).size,1);
}
const independentBefore=(await snap()).rows.filter(r=>r.eventId===events[1]);
for(const gender of ['male','female']) {
 let rows=(await snap()).rows.filter(r=>r.eventId===events[0]&&r.gender===gender);
 const queue=rows.filter(r=>r.registrationStatus==='waitlisted').sort((a,b)=>(a.waitlistedAt??a.createdAt)-(b.waitlistedAt??b.createdAt)||a._creationTime-b._creationTime||a._id.localeCompare(b._id));
 const reserved=rows.filter(r=>r.registrationStatus==='pending');
 // Mix Approved + Pending capacity, then remove the Approved seat.
 await m('events:updateRegistrationStatus',{adminSecret:secret,eventRegistrationId:reserved[0]._id,registrationStatus:'approved'});
 await m('events:updateRegistrationStatus',{adminSecret:secret,eventRegistrationId:reserved[0]._id,registrationStatus:'withdrawn'});
 rows=(await snap()).rows;
 assert.equal(rows.find(r=>r._id===queue[0]._id).registrationStatus,'pending');
 assert.equal(rows.find(r=>r._id===queue[0]._id).approvedAt,undefined);
 assert.equal(rows.find(r=>r._id===queue[1]._id).registrationStatus,'waitlisted');
 // A second removal via confirmation cancellation promotes exactly the next FIFO row.
 await m('events:updateRegistrationConfirmation',{adminSecret:secret,eventRegistrationId:reserved[1]._id,confirmationStatus:'cancelled'});
 rows=(await snap()).rows;
 assert.equal(rows.find(r=>r._id===queue[1]._id).registrationStatus,'pending');
 assert.equal(rows.find(r=>r._id===queue[1]._id).approvedAt,undefined);
 assert.equal(rows.find(r=>r._id===queue[2]._id).registrationStatus,'waitlisted');
 // Retry withdrawn registration twice through the actual admin mutation; same row, queued.
 const p=profiles.find(p=>p.registrationId===reserved[0].registrationId);
 for(let i=0;i<2;i++) {
  const r=await m('events:addRegistration',{adminSecret:secret,eventId:events[0],registrationId:p.registrationId});
  assert.equal(r.eventRegistrationId,reserved[0]._id); assert.equal(r.registrationStatus,'waitlisted');
 }
}
const after=await snap();
assert.deepEqual(after.profiles,before);
assert.deepEqual(after.rows.filter(r=>r.eventId===events[1]),independentBefore);
assert.equal(after.emails.length,0);
for(const id of events) await summary(id);
console.log('PASS FIFO -> Pending only; retries no duplicates; 140 full profile documents unchanged; independent event unchanged; zero email records');
console.log('final boundary',JSON.stringify(await summary(events[0])));
console.log('final race',JSON.stringify(await summary(events[2])));

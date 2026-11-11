import assert from 'node:assert/strict';
import {ConvexHttpClient} from 'convex/browser';
// Immutable loopback URL: no production endpoints or provider requests.
const client=()=>new ConvexHttpClient('http://127.0.0.1:3368',{skipConvexDeploymentUrlCheck:true});
const c=client(), secret='synthetic-issue97-local';
const mut=(name,args)=>client().mutation(name,args);
const mm=(name,args)=>mut('matchmakerMatching:'+name,args);
const snap=()=>c.query('raceFixture:snapshot',{});
const pairs=await mut('raceFixture:seed',{});
async function prepare(pair){
 for(const p of pair) await mm('setConsent',{sessionHash:p.sessionHash,optedIn:true});
 return mut('matches:create',{adminSecret:secret,maleRegistrationId:pair[0].registrationId,femaleRegistrationId:pair[1].registrationId});
}
const rows=(s,id)=>Object.entries(s).filter(([k])=>/matchmaker.*(notif|deliver)/i.test(k)).flatMap(([,v])=>v).filter(r=>r.matchId===id);
// Simultaneous independent-client Present retries, not one client's mutation queue.
const pair=pairs[0], matchId=await prepare(pair);
const presented=await Promise.all(Array.from({length:4},()=>mm('present',{adminSecret:secret,matchId})));
assert.equal(presented.filter(r=>!r.alreadyPresented).length,1);
assert.equal(rows(await snap(),matchId).length,2);
for(const p of pair){
 const claims=await Promise.all(Array.from({length:4},()=>mm('claimNotification',{adminSecret:secret,matchId,recipientId:p.registrationId})));
 assert.equal(claims.filter(Boolean).length,1);
 assert.equal(await mm('claimNotification',{adminSecret:secret,matchId,recipientId:p.registrationId}),null);
}
console.log('PASS concurrent Present idempotency and permanent recipient claims');
// Ordered optout must win; same-turn races permit either valid serialization.
const blockedId=await prepare(pairs[1]);
await mm('setConsent',{sessionHash:pairs[1][0].sessionHash,optedIn:false});
await assert.rejects(mm('present',{adminSecret:secret,matchId:blockedId}));
assert.equal(rows(await snap(),blockedId).length,0);
let optoutFirst=0,presentFirst=0;
for(const p of pairs.slice(2,10)){
 const id=await prepare(p);
 const outcomes=await Promise.allSettled([
  mm('setConsent',{sessionHash:p[0].sessionHash,optedIn:false}),
  mm('present',{adminSecret:secret,matchId:id}),
 ]);
 assert.equal(outcomes[0].status,'fulfilled');
 const s=await snap(), r=s.matches.find(r=>r._id===id);
 assert.equal(s.registrations.find(r=>r._id===p[0].registrationId).backgroundMatchmakingOptIn,false);
 if(outcomes[1].status==='fulfilled'){presentFirst++;assert(r.matchmakerPresentedAt);assert.equal(rows(s,id).length,2);}
 else {optoutFirst++;assert.equal(r.matchmakerPresentedAt,undefined);assert.equal(rows(s,id).length,0);}
}
console.log('PASS optout/present valid serialization', {optoutFirst,presentFirst});
let shared=0,withdrawn=0;
for(const p of pairs.slice(10,15)){
 const id=await prepare(p);await mm('present',{adminSecret:secret,matchId:id});
 for(const person of p) await mm('approve',{sessionHash:person.sessionHash,matchId:id});
 const outcomes=await Promise.allSettled([
  mm('withdraw',{sessionHash:p[0].sessionHash,matchId:id}),
  mm('releaseContacts',{adminSecret:secret,matchId:id}),
 ]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
 const r=(await snap()).matches.find(r=>r._id===id);
 assert(!(r.matchmakerWithdrawnAt && r.contactGate==='contacts_released'));
 if(r.contactGate==='contacts_released') shared++; else {withdrawn++;assert(r.matchmakerWithdrawnAt);}
}
console.log('PASS contact release/withdraw mutually exclusive',{shared,withdrawn});
const finalPair=pairs[15], finalId=await prepare(finalPair);
await mm('present',{adminSecret:secret,matchId:finalId});
for(const p of finalPair) await mm('approve',{sessionHash:p.sessionHash,matchId:finalId});
await mm('releaseContacts',{adminSecret:secret,matchId:finalId});
await Promise.all(finalPair.map((p,i)=>mm('followup',{sessionHash:p.sessionHash,matchId:finalId,status:i?'engaged':'contact_made'})));
await mm('setConsent',{sessionHash:finalPair[0].sessionHash,optedIn:false});
await assert.rejects(mm('withdraw',{sessionHash:finalPair[0].sessionHash,matchId:finalId}));
const s=await snap(), record=s.matches.find(r=>r._id===finalId);
assert.equal(record.maleFollowup.status,'contact_made');assert.equal(record.femaleFollowup.status,'engaged');
assert.equal(record.maleFollowup.authorRegistrationId,finalPair[0].registrationId);
assert.equal(record.femaleFollowup.authorRegistrationId,finalPair[1].registrationId);
assert(record.maleFollowup.updatedAt && record.femaleFollowup.updatedAt);
assert.equal(record.contactGate,'contacts_released');
assert.equal((s.femaleWorkflowDeliveries??[]).length,0);
assert.equal((s.eventRegistrationEmails??[]).length,0);
console.log('PASS independent followups; global optout retains shared record; zero existing email outbox');

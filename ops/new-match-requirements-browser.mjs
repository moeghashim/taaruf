import {chromium} from 'playwright';
import {ConvexHttpClient} from 'convex/browser';
import assert from 'node:assert/strict';
const backend=new ConvexHttpClient('http://127.0.0.1:3340');
const before=await backend.query('newMatchFixture:snapshot',{});

const browser=await chromium.launch({channel:'chrome',headless:true});
try{for(const [index,width] of [1440,390].entries()){
 const context=await browser.newContext({viewport:{width,height:1000}});
 const auth=await context.request.post('http://127.0.0.1:3342/api/admin/auth',{data:{password:'synthetic-local-new-match'}});assert.equal(auth.status(),200);
 if(index===0)for(const match of before.matches){
  const closed=await context.request.post('http://127.0.0.1:3342/api/admin/bridge',{headers:{Origin:'http://127.0.0.1:3342'},data:{kind:'mutation',name:'matches.updateStatus',args:{id:match._id,status:'closed'}}});
  assert.equal(closed.status(),200);
 }
 const p=await context.newPage();p.setDefaultTimeout(30000);
 await p.goto('http://127.0.0.1:3342/admin/workbench');
 await p.getByRole('button',{name:'New match',exact:true}).click();
 const male=before.profiles.filter(r=>r.gender==='male')[index],female=before.profiles.filter(r=>r.gender==='female')[index];
 await p.getByLabel('Male applicant',{exact:true}).selectOption(male._id);await p.getByLabel('Female applicant',{exact:true}).selectOption(female._id);
 const response=p.waitForResponse(r=>r.url().endsWith('/api/admin/create-match')&&r.request().method()==='POST');
 await p.getByRole('button',{name:'Create match',exact:true}).click();const res=await response;assert.equal(res.status(),200);const {matchId}=await res.json();
 await p.waitForURL('**/admin/workbench?match='+matchId);await p.getByText('Match review',{exact:true}).waitFor();
 for(const person of [male,female])for(const key of ['spouseRequirement1','spouseRequirement2','spouseRequirement3'])await p.getByText(person[key],{exact:true}).waitFor();
 const boxes=await p.getByRole('heading',{name:'Top requirements',exact:true}).evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().toJSON()));assert.equal(boxes.length,2);if(width===1440){assert.ok(Math.abs(boxes[0].y-boxes[1].y)<3);assert.ok(boxes[0].x!==boxes[1].x);}console.log('PASS both profiles all six requirements rendered '+width);
 await p.getByRole('button',{name:'New match',exact:true}).click();await p.getByLabel('Male applicant',{exact:true}).selectOption(male._id);await p.getByLabel('Female applicant',{exact:true}).selectOption(female._id);await p.getByRole('button',{name:'Create match',exact:true}).click();await p.getByRole('alert').waitFor();assert.match(await p.getByRole('alert').innerText(),/open match already exists/);await p.screenshot({path:'real-browser-'+width+'.png'});
 await context.close();console.log('PASS real Next route + real local Convex + browser '+width);
}
const after=await backend.query('newMatchFixture:snapshot',{});assert.equal(after.matches.length,before.matches.length+2);assert.deepEqual(after.profiles,before.profiles);for(const key of ['interests','flows','shares','emails'])assert.deepEqual(after[key],before[key]);
await assert.rejects(backend.mutation('matches:create',{adminSecret:'wrong',maleRegistrationId:before.profiles[0]._id,femaleRegistrationId:before.profiles[3]._id}),/Unauthorized/);
console.log('PASS persisted records, duplicate rejection, auth rejection, unchanged profiles/consent/shares/emails');
}finally{await browser.close()}

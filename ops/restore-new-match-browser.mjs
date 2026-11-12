import { chromium } from '@playwright/test';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const base = process.env.PREVIEW_URL || 'http://localhost:3358';
const browser = await chromium.launch({channel:'chrome',headless:true});
try { for (const width of [1440,390,320]) {
 const context = await browser.newContext({viewport:{width,height:1000}});
 await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
 await context.routeWebSocket('**/*', socket => socket.close());
 const token = crypto.createHash('sha256').update('synthetic-local-new-matchtaaruf-admin-salt').digest('hex');
 await context.addCookies([{name:'admin_token',value:token,url:base}]);
 const people = ['male','female'].map((gender,i)=>({_id:'synthetic-'+gender,_creationTime:1,name:'Synthetic '+gender,publicApplicantNumber:901+i,gender,status:'approved',profileCompletionStatus:'completed',searchStatus:'active',age:30,education:'College',createdAt:1}));
 let matches=[],posts=0, duplicate=false;
 await context.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/admin/bridge') {
   const {kind,name}=route.request().postDataJSON(); assert.equal(kind,'query','No real mutation in browser test');
   let result=[];
   if(name==='registrations.getAll') result=people;
   if(name.endsWith('workbenchPage')||name==='events.profileFilterCatalog') result={page:name==='matches.workbenchPage'?matches:[],isDone:true,continueCursor:''};
   return route.fulfill({json:{result}});
  }
  if(path==='/api/admin/create-match') {
   posts++; const body=route.request().postDataJSON();assert.equal(body.maleRegistrationId,people[0]._id);assert.equal(body.femaleRegistrationId,people[1]._id);
   if(duplicate) return route.fulfill({status:400,json:{error:'An open match already exists for this pair. Open it in the workbench.'}});
   matches=[{_id:'synthetic-draft',_creationTime:1,createdAt:1,updatedAt:1,maleRegistrationId:people[0]._id,femaleRegistrationId:people[1]._id,maleRegistration:people[0],femaleRegistration:people[1],interest:null,status:'new',interestType:'admin_suggested',initiatedBy:'admin_recommendation'}];
   return route.fulfill({json:{matchId:'synthetic-draft'}});
  }
  throw Error('Unexpected API '+path);
 });
 const page=await context.newPage(); await page.goto(base+'/admin/workbench');
 const trigger=page.getByRole('button',{name:'New match',exact:true});await trigger.click();
 await page.getByText('Save a private draft for admin review.',{exact:false}).waitFor();
 await page.getByLabel('Male applicant',{exact:true}).selectOption(people[0]._id);await page.getByLabel('Female applicant',{exact:true}).selectOption(people[1]._id);
 await page.screenshot({path:'../../privateops/restore-new-match-modal-'+width+'.png'});
 const box=await page.getByRole('dialog').boundingBox(); assert(box.x>=0&&box.x+box.width<=width+1);
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 await page.waitForURL('**/admin/workbench?match=synthetic-draft');await page.getByText('Private draft — not visible to applicants.',{exact:false}).waitFor();
 assert.equal(await page.getByRole('button',{name:/Share (requester|target) profile/}).count(),0);
 assert.equal(await page.getByRole('button',{name:'Share contacts',exact:true}).count(),0);
 duplicate=true; await trigger.click();await page.getByLabel('Male applicant',{exact:true}).selectOption(people[0]._id);await page.getByLabel('Female applicant',{exact:true}).selectOption(people[1]._id);await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByRole('alert').waitFor();
 assert.equal(posts,2);await page.keyboard.press('Escape');await trigger.waitFor();
 await context.close();console.log('PASS synthetic modal/save/navigation/duplicate/privacy '+width);
} } finally {await browser.close();}

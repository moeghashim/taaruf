import { chromium } from '@playwright/test';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const base=process.env.PREVIEW_URL || 'http://localhost:3417';
const out=process.env.ARTIFACT_DIR || '../../privateops/new-match3407';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {for(const width of [1440,390,320]) for(const state of ['empty','populated','filtered']) {
 const context=await browser.newContext({viewport:{width,height:1000}});
 await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
 await context.routeWebSocket('**/*',s=>s.close());
 await context.addCookies([{name:'admin_token',value:process.env.BROWSER_ADMIN_TOKEN || crypto.createHash('sha256').update('synthetic-local-new-matchtaaruf-admin-salt').digest('hex'),url:base}]);
 const people=['male','female'].map((gender,i)=>({_id:'synthetic-'+gender,_creationTime:1,name:'Synthetic '+gender,publicApplicantNumber:901+i,gender,status:'approved',profileCompletionStatus:'completed',searchStatus:'active',age:30,createdAt:1}));
 const event={_id:'manual',title:'1Plus1 Manual/Admin Interest',startsAt:0};
 const interest={_id:'synthetic-interest',_creationTime:1,createdAt:1,updatedAt:1,eventId:'manual',fromRegistrationId:people[0]._id,toRegistrationId:people[1]._id,status:'new',fromRegistration:people[0],toRegistration:people[1],match:null,event};
 const match={_id:'synthetic-match',_creationTime:1,createdAt:1,updatedAt:1,maleRegistrationId:people[0]._id,femaleRegistrationId:people[1]._id,maleRegistration:people[0],femaleRegistration:people[1],interest:null,status:'new',interestType:'admin_suggested',initiatedBy:'admin_recommendation'};
 await context.route('**/api/**',async r=>{assert.equal(new URL(r.request().url()).pathname,'/api/admin/bridge');const {kind,name}=r.request().postDataJSON();assert.equal(kind,'query');let result=[];if(name==='registrations.getAll')result=people;if(name.endsWith('workbenchPage')||name==='events.profileFilterCatalog')result={page:name==='events.profileFilterCatalog'?[event]:state==='empty'?[]:name==='matches.workbenchPage'?[match]:[interest],isDone:true,continueCursor:''};await r.fulfill({json:{result}});});
 const page=await context.newPage();await page.goto(base+'/admin/workbench'+(state==='filtered'?'?event=manual':''));
 await page.getByLabel('Filter workbench by event').waitFor();
 const trigger=page.getByRole('button',{name:'New match',exact:true});assert.equal(await trigger.count(),1);assert(await trigger.isVisible());const box=await trigger.boundingBox();assert(box.x>=0&&box.x+box.width<=width&&box.y<600);
 assert.equal(await page.getByLabel('Filter workbench by event').inputValue(),state==='filtered'?'manual':'all');
 if(process.env.EXPECT_FIXED)assert(!(await page.locator('#workbench-event').textContent()).includes('1969'));
 await page.screenshot({path:out+'/'+state+'-'+width+'.png'});
 await trigger.focus();await page.keyboard.press('Enter');await page.getByRole('dialog').waitFor();await page.getByLabel('Male applicant',{exact:true}).selectOption(people[0]._id);assert(await page.getByRole('button',{name:'Save draft',exact:true}).isDisabled());await page.getByLabel('Female applicant',{exact:true}).selectOption(people[1]._id);assert(await page.getByRole('button',{name:'Save draft',exact:true}).isEnabled());const db=await page.getByRole('dialog').boundingBox();assert(db.x>=0&&db.x+db.width<=width+1);await page.screenshot({path:out+'/'+state+'-dialog-'+width+'.png'});await page.keyboard.press('Escape');assert(await trigger.isVisible());
 await context.close();console.log('PASS workbench '+state+' '+width+' visible/keyboard/dialog/filter');
}} finally {await browser.close();}

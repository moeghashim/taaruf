import { chromium } from '@playwright/test';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const base=process.env.CLICK_TEST_BASE || 'http://127.0.0.1:3649';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {for(const mode of ['pointer','touch','keyboard','denied']) for(const explicit of [true]) {
const width=mode==='touch'?390:1440;let posts=0;let slow=false;const context=await browser.newContext({hasTouch:width===390,viewport:{width,height:1000}});
await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
await context.routeWebSocket('**/*',s=>s.close());
await context.addCookies([{name:'admin_token',value:crypto.createHash('sha256').update('synthetic-local-passwordtaaruf-admin-salt').digest('hex'),url:base}]);
const people=['female','male'].map((gender,i)=>({_id:'synthetic-'+gender,_creationTime:1,name:'Synthetic '+gender,publicApplicantNumber:901+i,gender,status:'approved',profileCompletionStatus:'completed',searchStatus:'active',age:30,createdAt:1}));
const event={_id:'manual',title:'Manual interest',startsAt:0};
const interest={_id:'synthetic-interest',_creationTime:1,createdAt:1,updatedAt:1,eventId:'manual',fromRegistrationId:people[0]._id,toRegistrationId:people[1]._id,status:'new',visibility:'internal_only',fromRegistration:people[0],toRegistration:people[1],match:null,event,...(explicit?{femaleWorkflow:{state:'private_documented'}}:{})};
await context.route('**/api/**',async r=>{assert.equal(new URL(r.request().url()).pathname,'/api/admin/bridge');const {kind,name}=r.request().postDataJSON();console.log('QUERY',name);if(kind==='mutation'){posts++;return r.fulfill({json:{result:null}});}assert.equal(kind,'query');if(slow)await new Promise(resolve=>setTimeout(resolve,500));if(slow&&mode==='denied')return r.fulfill({status:401,json:{error:'Synthetic session expired'}});let result=[];if(name==='registrations.getAll')result=people;if(name==='interests.getAll')result=[interest];if(name.endsWith('workbenchPage')||name==='events.profileFilterCatalog')result={page:name==='events.profileFilterCatalog'?[event]:name==='interests.workbenchPage'?[interest]:[],isDone:true,continueCursor:''};await r.fulfill({json:{result}});});
const page=await context.newPage();page.on('pageerror',e=>console.log('PAGEERROR',e.message));await page.goto(base+'/admin/workbench');console.log((await page.locator('body').innerText()).slice(0,1600));
await page.waitForTimeout(1500);console.log('AFTER', (await page.locator('body').innerText()).slice(-2400));await page.locator('select').filter({has:page.locator('option[value="synthetic-interest"]')}).selectOption('synthetic-interest');
const header=page.getByRole('heading',{name:'Evaluating interest · '+(explicit?'Requester profile not yet shared':'Awaiting applicant approvals'),exact:true});await header.waitFor();
const card=header.locator('xpath=ancestor::div[@class="panel"][1]');
const button=card.getByRole('button',{name:'Close interest',exact:true});await button.scrollIntoViewIfNeeded();const box=await button.boundingBox();slow=true;
if(mode==='denied'){await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(800);assert.equal(await page.getByRole('button',{name:'Close interest',exact:true}).count(),0);}else if(mode==='keyboard'){await button.focus();await page.keyboard.down('Space');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(60);await page.keyboard.up('Space');}else if(width===390){const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(60);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}else{await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(60);await page.mouse.up();}
await page.waitForTimeout(800);assert.equal(posts,mode==='denied'?0:1);console.log('PASS workbench',mode,'POSTS',posts);await context.close();
}}finally{await browser.close();}

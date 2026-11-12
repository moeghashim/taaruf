// Built Next UI with synthetic API responses only; all real APIs blocked.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3404',out=process.env.TEST_OUTPUT||'/Users/moeghashim/taaruf/privateops/optin4014/browser';
await fs.mkdir(out,{recursive:true});
const rows=['male','female'].flatMap((gender,g)=>[true,false,undefined,'true',1].map((consent,i)=>({_id:gender+'-'+i,name:['Explicit','Declined','Missing','String','Number'][i],gender,publicApplicantNumber:901+g*10+i,...(consent===undefined?{}:{backgroundMatchmakingOptIn:consent}),eventMatchingOptIn:true,onlineMatchingOptIn:true})));
const token=process.env.TEST_ADMIN_TOKEN||crypto.createHash('sha256').update('syntheticsynthetic-salt').digest('hex');
const browser=await chromium.launch({channel:'chrome',headless:true}),proof=[];
try{for(const width of [1440,390,320]){
 const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block',extraHTTPHeaders:process.env.TEST_BYPASS?{'x-vercel-protection-bypass':process.env.TEST_BYPASS}:{}});
 await context.addCookies([{name:'admin_token',value:token,url:base}]);
 const page=await context.newPage(),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
 await page.routeWebSocket('**/*',s=>s.close());
 await page.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(u.origin!==new URL(base).origin)return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue();
 if(u.pathname==='/api/admin/match-candidates')return route.fulfill({json:rows});
 if(u.pathname==='/api/admin/bridge'){assert.equal(req.postDataJSON().kind,'query');return route.fulfill({json:{result:[]}});}
 if(u.pathname==='/api/admin/create-match'){writes.push(req.postDataJSON());return route.fulfill({status:400,json:{error:'Synthetic draft received; no real write.'}});}
 return route.fulfill({status:403,json:{error:'Blocked synthetic request'}});});
 await page.goto(base+'/admin/workbench');await page.getByRole('button',{name:'New match',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'New match'});await dialog.waitFor();
 await page.waitForFunction(()=>document.querySelectorAll('select[aria-label="Male applicant"] option').length===6);
 for(const gender of ['male','female']){
  const select=page.getByLabel(gender==='male'?'Male applicant':'Female applicant',{exact:true});
  const expected=rows.filter(r=>r.gender===gender).map(r=>({value:r._id,text:'#'+r.publicApplicantNumber+' '+r.name+(r.backgroundMatchmakingOptIn===true?' (opted in)':'')}));
  assert.deepEqual(await select.locator('option').evaluateAll(es=>es.slice(1).map(e=>({value:e.value,text:e.textContent}))),expected);
  for(const option of expected){await select.selectOption(option.value);assert.equal(await select.inputValue(),option.value);assert.equal(await select.evaluate(e=>e.selectedOptions[0].textContent),option.text);}
  await select.selectOption(gender+'-0');
 }
 const box=await dialog.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1);
 await page.screenshot({path:out+'/selected-true-'+width+'.png',fullPage:true});
 for(const [name,value]of [['Male applicant','male-1'],['Female applicant','female-2']])await page.getByLabel(name,{exact:true}).selectOption(value);
 await page.screenshot({path:out+'/selected-false-missing-'+width+'.png',fullPage:true});
 await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByRole('alert').waitFor();
 assert.deepEqual(writes,[{maleRegistrationId:'male-1',femaleRegistrationId:'female-2',adminNotes:''}]);assert.deepEqual(errors,[]);
 proof.push({width,optionsAndSelectedLabels:10,strictTrueOnly:true,unchangedIds:true,draftWithoutConsent:true,realWrites:0,dialogFits:true});await context.close();
}}finally{await browser.close();await fs.writeFile(out+'/proof.json',JSON.stringify(proof,null,2));}console.log(JSON.stringify(proof));

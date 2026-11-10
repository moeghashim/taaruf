import {chromium} from '@playwright/test';import crypto from 'node:crypto';import fs from 'node:fs';import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:"chrome"});const origin='http://127.0.0.1:3822';const page=await browser.newPage();
const unauth=await page.request.post(origin+'/api/admin/reset-test-pair',{headers:{Origin:origin},data:{action:'preview'}});assert.equal(unauth.status(),401);
await page.context().addCookies([{name:'admin_token',value:crypto.createHash('sha256').update('synthetic-admin-onlysynthetic-salt').digest('hex'),url:origin}]);
const noOrigin=await page.request.post(origin+'/api/admin/reset-test-pair',{data:{action:'preview'}});assert.equal(noOrigin.status(),403);
const otherPair=await page.request.post(origin+'/api/admin/reset-test-pair',{headers:{Origin:origin},data:{action:'preview',registrationIds:['other']}});assert.equal(otherPair.status(),400);
for(const [name,width,height] of [['desktop',1440,1100],['mobile',390,844]]){
await page.setViewportSize({width,height});await page.goto(origin+'/admin/settings');await page.getByRole('button',{name:'Preview reset',exact:true}).click();await page.getByLabel('Reason (10–500 characters)').waitFor();const reset=page.getByRole('button',{name:'Reset #219 ↔ #220',exact:true});assert(await reset.isDisabled());await page.getByLabel('Reason (10–500 characters)').fill('Synthetic browser integration reset');await page.getByRole('checkbox').check();assert(await reset.isEnabled());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await page.locator('section[aria-labelledby="reset-pair-title"]').screenshot({path:name+'.png'});
if(name==='mobile'){await reset.click();await page.getByRole('status').filter({hasText:'Test pair reset.'}).waitFor();}
}
fs.writeFileSync('browser-proof.json',JSON.stringify({desktop:true,mobile:true,confirmation:true,reset:true,nonAdmin401:true,origin403:true,otherPair400:true}));await browser.close();console.log('PASS browser desktop/mobile/auth/confirmation/actual reset');

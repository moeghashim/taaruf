import { test, expect } from '@playwright/test';
const helper = 'Interest submissions will open after being approved and checked in for the next event';
for (const width of [1440,390]) for (const enabled of [false,true]) test('profile preference submission '+width+' enabled='+enabled, async ({page},info)=>{
 await page.setViewportSize({width,height:1000});
 const submissions: unknown[]=[];
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.hostname!=='127.0.0.1') return route.abort();
  if(!u.pathname.startsWith('/api/'))return route.continue();
  if(u.pathname==='/api/applicant/interests') { submissions.push(route.request().postDataJSON());return route.fulfill({json:{success:true}}); }
  if(u.pathname==='/api/applicant/me') return route.fulfill({json:{applicant:{name:'Synthetic Participant',gender:'male',applicantNumber:1,profileCompletionStatus:'completed'},inbound:[],outbound:[],privateDocumented:[],canSubmitInterest:enabled,interestSubmissionEventId:'synthetic-event',interestSubmissions:[]}});
  if(u.pathname==='/api/applicant/interest-eligibility')return route.fulfill({json:{canSubmitInterest:enabled,interestSubmissionEventId:'synthetic-event',interestSubmissions:[]}});
  if(u.pathname==='/api/applicant/events')return route.fulfill({json:{upcoming:[],history:[],eligibleInterestEvents:[]}});
  return route.fulfill({status:400,json:{error:'Synthetic fixture only'}});
 });
 await page.goto('/me');const panel=page.locator('.interest-submit-panel');await expect(panel).toBeVisible();
 await expect(panel.locator('input[type="radio"]')).toHaveCount(0);
 await expect(panel.getByText(/share my photos|photo sharing|Clear choice/i)).toHaveCount(0);
 if(!enabled){await expect(panel.locator('[aria-live="polite"]')).toHaveText(helper);await expect(panel.locator('form')).toHaveCount(0);expect(submissions).toEqual([]);}
 else {
  await expect(panel.locator('form')).toHaveCount(3);
  const form=panel.locator('form').first();
  await form.locator('input[type="number"]').fill('999');await form.locator('input[maxlength="200"]').fill('Fixture');
  await expect(form.locator('button[type="submit"]')).toBeEnabled();
  await panel.screenshot({path:info.outputPath('before-submit.png')});
  await form.locator('button[type="submit"]').click();
  await expect.poll(()=>submissions.length).toBe(1);
  expect(submissions[0]).toEqual({action:'submit_number',expectedEventId:'synthetic-event',applicantNumber:999,applicantName:'Fixture'});
  expect(Object.prototype.hasOwnProperty.call(submissions[0],'photoConsent')).toBe(false);
  await expect(form.locator('input[type="number"]')).toHaveValue('');
  await info.attach('captured-submission.json',{body:JSON.stringify(submissions,null,2),contentType:'application/json'});
 }
 expect(await page.locator('body').evaluate(el=>el.scrollWidth<=window.innerWidth)).toBe(true);
 await panel.screenshot({path:info.outputPath('panel.png')});
});
test('unmocked local API fails closed',async({request})=>{const r=await request.post('/api/applicant/interests',{data:{action:'submit_number',applicantNumber:999,applicantName:'Fixture'}});expect(r.status()).toBe(503);expect(await r.text()).toContain('UI-review-only');});

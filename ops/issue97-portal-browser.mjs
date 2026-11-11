import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const base = process.env.PREVIEW_URL || 'http://localhost:3358';
const browser = await chromium.launch({channel:'chrome',headless:true});
try { for (const width of [1440,390,320]) {
 const context = await browser.newContext({viewport:{width,height:1000}});
 await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
 await context.routeWebSocket('**/*',socket=>socket.close());
 let optedIn=false, shared=false, withdrawn=false, approved=false, followup; const actions=[];
 const partner={publicApplicantNumber:902,age:29,education:'College',job:'Synthetic engineer',ethnicity:'Synthetic',maritalStatus:'Single',shareableBio:'Synthetic profile for preview tests only.',spouseRequirement1:'A complete requirement shown without truncation.',images:[]};
 await context.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/applicant/me') return route.fulfill({json:{applicant:{status:'approved',name:'Synthetic applicant',gender:'male',applicantNumber:901,profileCompletionStatus:'completed',hasPhotos:true},inbound:[],outbound:[],privateDocumented:[],canSubmitInterest:false,interestSubmissionLimit:3,interestSubmissionEventId:null,interestSubmissions:[]}});
  if(path==='/api/applicant/profile')return route.fulfill({json:{registration:{name:'Synthetic applicant',gender:'male',email:'synthetic@example.invalid',education:'College',ethnicity:'Synthetic',imageStorageIds:[],imageUrls:[],profileCompletionStatus:'completed'}}});
  if(path==='/api/applicant/events')return route.fulfill({json:{upcoming:[],history:[]}});
  if(path==='/api/applicant/female-review')return route.fulfill({json:{page:[],isDone:true,continueCursor:''}});
  if(path==='/api/applicant/interest-eligibility')return route.fulfill({json:{canSubmit:false,reason:'Synthetic test'}});
  if(path==='/api/applicant/matchmaker') {
   if(route.request().method()==='POST') {const body=route.request().postDataJSON();actions.push(body);if(body.action==='consent')optedIn=body.optedIn;if(body.action==='approve')approved=true;if(body.action==='withdraw')withdrawn=true;if(body.action==='followup')followup={status:body.status,updatedAt:Date.now()};return route.fulfill({json:{success:true}});}
   return route.fulfill({json:{optedIn,consentUpdatedAt:Date.now(),matches:[{_id:'synthetic-match',status:withdrawn?'closed':shared?'contact_shared':'reviewing',presentedAt:Date.now(),contactShared:shared,canWithdraw:!shared&&!withdrawn,canApprove:!shared&&!withdrawn,myApproval:approved,partnerApproval:true,withdrawnAt:withdrawn?Date.now():undefined,myFollowup:followup,partner:{...partner,...(shared?{name:'Synthetic partner',email:'partner@example.invalid',phone:'555-0100'}:{})}}]}});
  }
  throw Error('Unexpected API '+path);
 });
 const page=await context.newPage();page.on('dialog',dialog=>dialog.accept());await page.goto(base+'/me#matchmaker-matching');
 await page.getByRole('heading',{name:'Matchmaker Matching',exact:true}).waitFor();
 const consent=page.getByRole('checkbox');await consent.click();await page.getByRole('status').filter({hasText:'now opted in'}).waitFor();
 await page.getByRole('button',{name:'Agree to this introduction',exact:true}).click();await page.getByRole('button',{name:'You agreed',exact:true}).waitFor();
 await consent.click();await page.getByRole('status').filter({hasText:'opted out'}).waitFor();assert.equal(await page.getByRole('button',{name:'Withdraw',exact:true}).count(),1);
 await page.screenshot({path:'../../privateops/issue97-portal-'+width+'.png'});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'mobile overflow');
 await page.getByRole('button',{name:'Withdraw',exact:true}).click();await page.getByText('Introduction withdrawn',{exact:true}).waitFor();assert.equal(optedIn,false);
 shared=true;withdrawn=false;await page.reload();await page.getByText('Contact details shared',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Withdraw',exact:true}).count(),0);
 for(const status of ['contact_made','getting_to_know','not_proceeding','engaged']){await page.getByLabel('Your follow-up status',{exact:true}).selectOption(status);await page.getByRole('status').filter({hasText:'follow-up status has been saved'}).waitFor();await page.getByLabel('Your follow-up status',{exact:true}).isEnabled();}
 assert.equal(actions.filter(a=>a.action==='followup').length,4);assert.equal(optedIn,false);
 await page.screenshot({path:'../../privateops/issue97-shared-'+width+'.png'});await context.close();console.log('PASS synthetic consent/approval/withdrawal/shared followups '+width);
} } finally {await browser.close();}

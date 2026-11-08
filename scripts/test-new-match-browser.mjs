// Synthetic-only browser regression. Bundles the actual Topbar and dialog, not a replica.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const output = '.new-match-browser';
await fs.mkdir(output, {recursive:true});
const bundle = await build({stdin:{contents:
  `import React from "react";
   import {createRoot} from "react-dom/client";
   import {Topbar} from "./src/components/admin/layout/topbar";
   import {WorkbenchPageClient} from "./src/components/admin/matching/matching-page-client";
   import {useAdminQuery} from "./src/components/admin/hooks/use-admin-transport";
   function PollingProbe() {
    const value = useAdminQuery("settings.get", {key:"synthetic"});
    return value === undefined ? <p role="status">Loading</p> : <output aria-label="poll-result">{value}</output>;
   }
   class FailureBoundary extends React.Component {
    state = {error:null};
    static getDerivedStateFromError(error) { return {error}; }
    render() { return this.state.error ? <p role="alert">{this.state.error.message}</p> : this.props.children; }
   }
   createRoot(document.getElementById("root")).render(location.pathname === "/polling" ? <FailureBoundary><PollingProbe/></FailureBoundary> : location.pathname === "/workbench" ? <WorkbenchPageClient/> : <Topbar crumb="Workbench" onMenu={()=>{}}/>);`,
  resolveDir:process.cwd(),loader:'tsx'}, bundle:true,write:false,format:'iife',jsx:'automatic',plugins:[{name:'synthetic-adapters',setup(b){
    b.onResolve({filter:new RegExp("^next/(navigation|link)$")}, args=>({path:args.path,namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'}, args=>({loader:'js',contents: args.path === 'next/link' ? 'export default function Link({children,href}) { return children; }' : 'export const useRouter=()=>({push:url=>{window.destination=url}}); const params = new URLSearchParams(window.location.search); export const useSearchParams=()=>params;' }));
  }}]});
const js=bundle.outputFiles[0].text;
const cssFiles=(await fs.readdir('.next/static/chunks')).filter(f=>f.endsWith('.css'));
const css=(await Promise.all(cssFiles.map(f=>fs.readFile('.next/static/chunks/'+f,'utf8')))).join('\n');
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<html><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div data-admin id="root"></div><script>'+js+'</script></html>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true, channel:"chrome"});
try {
 for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
  const page=await browser.newPage({viewport}); const errors=[]; page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)}); page.setDefaultTimeout(10000);
  await page.route('**/api/admin/bridge', async route => {
   const {kind,name,args}=route.request().postDataJSON();
   assert.equal(kind,'query'); assert.equal(route.request().method(),'POST'); assert.deepEqual(args,{});
   const profiles=[{_id:'synthetic-male',name:'Synthetic Male',gender:'male',status:'approved',profileCompletionStatus:'completed',searchStatus:'active',publicApplicantNumber:901},{_id:'synthetic-female',name:'Synthetic Female',gender:'female',status:'approved',profileCompletionStatus:'completed',searchStatus:'active',publicApplicantNumber:902}];
   assert.equal(name,'registrations.getAll');
   await route.fulfill({json:{result:profiles}});
  });
  await page.route('**/api/admin/create-match',async route=>{assert.deepEqual(route.request().postDataJSON(),{maleRegistrationId:'synthetic-male',femaleRegistrationId:'synthetic-female',adminNotes:''});await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'An open match already exists for this pair. Open it in the workbench.'})});});
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.getByRole('button',{name:'New match',exact:true}).click();
  await page.getByRole('dialog',{name:'New match'}).waitFor();
  await page.screenshot({path:output+'/dialog-'+viewport.width+'.png'});
  assert.equal(await page.getByRole('button',{name:'Create match',exact:true}).isDisabled(),true);
  await page.getByLabel('Male applicant',{exact:true}).selectOption('synthetic-male');
  await page.getByLabel('Female applicant',{exact:true}).selectOption('synthetic-female');
  await page.getByRole('button',{name:'Create match',exact:true}).click();
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(),/open match already exists/);
  assert.equal(await page.getByLabel('Male applicant',{exact:true}).inputValue(),'synthetic-male');
  await page.unroute('**/api/admin/create-match');
  await page.route('**/api/admin/create-match',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({matchId:'synthetic-created-match'})}));
  await page.getByRole('button',{name:'Create match',exact:true}).click();
  await page.waitForFunction(()=>window.destination==='/admin/workbench?match=synthetic-created-match');
  assert.equal(await page.getByRole('dialog').count(),0);
  await page.getByRole('button',{name:'New match',exact:true}).click();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(),0);
  assert.deepEqual(errors,[]); await page.close(); console.log('PASS real Topbar click, selection, error/retry, success, Escape: '+viewport.width);
 }
 for (const failure of ['network',408,429,503]) {
  const page=await browser.newPage(); page.setDefaultTimeout(10000);
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  let mode='failure', requests=0;
  let failureFinished;
  await page.route('**/api/admin/bridge',async route=>{
   const {kind,name,args}=route.request().postDataJSON();
   assert.deepEqual({kind,name,args},{kind:'query',name:'settings.get',args:{key:'synthetic'}});
   requests++;
   if(mode==='failure') {
    if(failure==='network')await route.abort('failed');
    else await route.fulfill({status:failure,contentType:'text/html',body:'private backend details'});
    failureFinished?.();
   } else await route.fulfill({json:{result:mode}});
  });
  const initialFailure=new Promise(resolve=>{failureFinished=resolve;});
  await page.goto('http://127.0.0.1:'+server.address().port+'/polling');
  await initialFailure;
  assert.equal(await page.getByRole('status').innerText(),'Loading');
  mode='loaded';
  await page.getByText('loaded',{exact:true}).waitFor();
  mode='failure';
  await new Promise(resolve=>{failureFinished=resolve;});
  assert.equal(await page.getByLabel('poll-result').innerText(),'loaded');
  mode='recovered';
  await page.getByText('recovered',{exact:true}).waitFor();
  assert.ok(requests>=4); assert.deepEqual(errors,[]);
  await page.close(); console.log('PASS initial and loaded polling recovery '+failure);
 }
 for (const status of [400,401,403]) {
  const page=await browser.newPage(); page.setDefaultTimeout(10000);
  let failed=false;
  await page.route('**/api/admin/bridge',route=>failed ? route.fulfill({status,json:{error:'private-secret backend failure'}}) : route.fulfill({json:{result:'loaded'}}));
  await page.goto('http://127.0.0.1:'+server.address().port+'/polling');
  await page.getByText('loaded',{exact:true}).waitFor(); failed=true;
  await page.getByRole('alert').waitFor();
  const message=await page.getByRole('alert').innerText();
  assert.equal(message,status===401?'Your admin session has expired. Sign in again.':status===403?'Admin access denied.':'Admin request failed. Refresh and try again.');
  assert.equal(await page.getByLabel('poll-result').count(),0);
  assert.doesNotMatch(message,/private-secret/);
  await page.close(); console.log('PASS non-retryable polling failure '+status);
 }
 for (const gender of ['male','female']) for (const consent of ['yes','no','revoked']) {
  const page=await browser.newPage();
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  const requester={_id:'requester',name:'Synthetic Requester',gender,photoSharingPermission:consent==='yes'?'no':'yes',publicApplicantNumber:901,profileCompletionStatus:'completed',status:'approved',createdAt:1,_creationTime:1};
  const target={...requester,_id:'target',name:'Synthetic Target',gender:gender==='male'?'female':'male',photoSharingPermission:'yes',publicApplicantNumber:902};
  const interest={_id:'linked-interest',fromRegistrationId:requester._id,toRegistrationId:target._id,senderPhotoConsent:consent==='no'?'no':'yes',...(consent==='revoked'?{senderPhotoConsentRevokedAt:1}:{}),status:'converted_to_match',source:'platform_submission',createdAt:1,updatedAt:1};
  const male=gender==='male'?requester:target, female=gender==='female'?requester:target;
  const match={_id:'synthetic-match',maleRegistrationId:male._id,femaleRegistrationId:female._id,maleRegistration:male,femaleRegistration:female,interestId:interest._id,interest,status:'reviewing',interestType:'one_way',createdAt:1,updatedAt:1};
  await page.route('**/api/admin/bridge',async route=>{
   const {kind,name}=route.request().postDataJSON(); assert.equal(kind,'query');
   const result={'registrations.getAll':[requester,target],'matches.getAll':[match],'interests.getAll':[],'profileShares.getAll':[]};
   assert.ok(Object.hasOwn(result,name)); await route.fulfill({json:{result:result[name]}});
  });
  const shares=[];
  await page.route('**/api/admin/create-profile-share',async route=>{shares.push(route.request().postDataJSON());await route.fulfill({json:{shareUrl:'https://synthetic.invalid/share/test'}});});
  await page.goto('http://127.0.0.1:'+server.address().port+'/workbench?match=synthetic-match');
  await page.getByText('Match review',{exact:true}).waitFor();
  const requesterPhotos=page.getByRole('checkbox',{name:/Include requester photos/});
  const targetPhotos=page.getByRole('checkbox',{name:/Include target photos/});
  assert.equal(await requesterPhotos.isDisabled(),consent!=='yes');
  assert.equal(await targetPhotos.isEnabled(),true);
  if(consent==='yes')await requesterPhotos.check();
  await page.getByRole('button',{name:'Share requester profile → Synthetic Target',exact:true}).click();
  await page.waitForFunction(()=>document.body.textContent.includes('Share link created:'));
  assert.deepEqual(shares[0],{ownerRegistrationId:'requester',recipientRegistrationId:'target',includeImages:consent==='yes',interestId:'linked-interest',matchId:'synthetic-match'});
  await targetPhotos.check();
  await Promise.all([page.waitForResponse(response=>response.url().endsWith('/api/admin/create-profile-share')),page.getByRole('button',{name:'Share target profile → Synthetic Requester',exact:true}).click()]);
  assert.deepEqual(shares[1],{ownerRegistrationId:'target',recipientRegistrationId:'requester',includeImages:true,interestId:'linked-interest',matchId:'synthetic-match'});
  assert.deepEqual(errors,[]); await page.close(); console.log('PASS match recipient photo consent '+gender+' '+consent);
 }
} finally {await browser.close();server.close();}
